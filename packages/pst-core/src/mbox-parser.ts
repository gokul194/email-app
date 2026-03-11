import * as fs from 'fs';
import PostalMime from 'postal-mime';
import { v4 as uuidv4 } from 'uuid';
import type {
  PstFolder,
  EmailSummary,
  EmailDetail,
  AttachmentInfo,
} from '@email-app/shared';

/**
 * Lightweight index entry — stores only the byte offset + length of each
 * message inside the MBOX file, plus Gmail labels for folder reconstruction.
 */
interface MessageIndex {
  /** Byte offset of the first header line (after the "From " envelope line) */
  offset: number;
  /** Byte length of the raw RFC 2822 message */
  length: number;
  /** Gmail labels extracted from X-Gmail-Labels header */
  labels: string[];
}

/**
 * Cached summary data so we don't re-parse headers for list views.
 */
interface CachedSummary extends EmailSummary {
  _parsed: true;
}

interface MboxSession {
  filePath: string;
  /** Byte-offset index of every message (built once during open) */
  messageIndex: MessageIndex[];
  /** Map from folderId → array of global message indices in that folder */
  folderMessageMap: Map<string, number[]>;
  /** Cached summaries – populated lazily as pages are requested */
  summaryCache: Map<number, CachedSummary>;
  /** Cached full parses – populated on demand for detail views */
  detailCache: Map<number, ParsedEmail>;
  folders: PstFolder[];
  /** Per-folder: how many summaries have been loaded sequentially */
  folderLoadedUpTo: Map<string, number>;
}

interface ParsedEmail {
  subject: string;
  senderName: string;
  senderEmail: string;
  toRecipients: string;
  ccRecipients: string;
  bccRecipients: string;
  date: string;
  bodyText: string;
  bodyHtml: string;
  isRead: boolean;
  attachments: {
    filename: string;
    size: number;
    mimeType: string;
    content: Buffer;
  }[];
}

const mboxSessions = new Map<string, MboxSession>();

// ─── Helpers ──────────────────────────────────────────────────────────

function formatAddress(
  addr: { name?: string; address?: string } | { name?: string; address?: string }[] | undefined
): { name: string; email: string; display: string } {
  if (!addr) return { name: '', email: '', display: '' };
  const first = Array.isArray(addr) ? addr[0] : addr;
  if (!first) return { name: '', email: '', display: '' };
  const name = first.name || '';
  const email = first.address || '';
  const display = name ? `${name} <${email}>` : email;
  return { name, email, display };
}

function formatAddressList(
  addrs: { name?: string; address?: string }[] | undefined
): string {
  if (!addrs || addrs.length === 0) return '';
  return addrs
    .map((a) => (a.name ? `${a.name} <${a.address}>` : a.address || ''))
    .join('; ');
}

// ─── Index Builder (streaming, low-memory) ───────────────────────────

/**
 * Scan the MBOX file to build a byte-offset index of all messages.
 * We read in chunks to avoid loading the whole file into memory.
 *
 * MBOX format: each message starts with a line "From <sender> <date>\n"
 * at a byte position preceded by a newline (or start of file).
 */
function buildMessageIndex(filePath: string): MessageIndex[] {
  const CHUNK_SIZE = 4 * 1024 * 1024; // 4 MB chunks
  const fd = fs.openSync(filePath, 'r');
  const fileSize = fs.fstatSync(fd).size;
  const buf = Buffer.alloc(CHUNK_SIZE);

  const marker = Buffer.from('\nFrom ');

  /** Byte offsets of each "From " envelope line */
  const envelopeOffsets: number[] = [];

  let bytesRead = 0;
  let filePos = 0;
  let overlap = Buffer.alloc(0);

  while (filePos < fileSize) {
    const toRead = Math.min(CHUNK_SIZE, fileSize - filePos);
    bytesRead = fs.readSync(fd, buf, 0, toRead, filePos);

    const scanBuf = overlap.length > 0
      ? Buffer.concat([overlap, buf.subarray(0, bytesRead)])
      : buf.subarray(0, bytesRead);

    const scanOffset = filePos - overlap.length;

    // Check for "From " at the very start of the file
    if (filePos === 0 && scanBuf.length >= 5) {
      if (scanBuf[0] === 0x46 && scanBuf[1] === 0x72 &&
          scanBuf[2] === 0x6f && scanBuf[3] === 0x6d && scanBuf[4] === 0x20) {
        envelopeOffsets.push(0);
      }
    }

    let searchStart = (filePos === 0 && overlap.length === 0) ? 1 : 0;
    while (searchStart <= scanBuf.length - marker.length) {
      const idx = scanBuf.indexOf(marker, searchStart);
      if (idx === -1) break;
      const absOffset = scanOffset + idx + 1;
      envelopeOffsets.push(absOffset);
      searchStart = idx + marker.length;
    }

    const overlapSize = Math.min(marker.length - 1, bytesRead);
    overlap = Buffer.from(buf.subarray(bytesRead - overlapSize, bytesRead));

    filePos += bytesRead;
  }

  fs.closeSync(fd);

  // Convert envelope offsets → message entries with labels
  const index: MessageIndex[] = [];
  const headerBuf = Buffer.alloc(4096); // reusable buffer for header reading

  for (let i = 0; i < envelopeOffsets.length; i++) {
    const envOffset = envelopeOffsets[i];
    const headerStart = findNewlineAfter(filePath, envOffset) + 1;
    const nextEnv = i + 1 < envelopeOffsets.length
      ? envelopeOffsets[i + 1]
      : fileSize;
    const length = nextEnv - headerStart;
    if (length <= 0) continue;

    // Read first 4KB to extract Gmail labels during indexing
    const readSize = Math.min(4096, length);
    const hfd = fs.openSync(filePath, 'r');
    fs.readSync(hfd, headerBuf, 0, readSize, headerStart);
    fs.closeSync(hfd);

    const headerStr = headerBuf.subarray(0, readSize).toString('utf-8');
    const labels = extractGmailLabels(headerStr);

    index.push({ offset: headerStart, length, labels });
  }

  return index;
}

/**
 * Extract Gmail labels from X-Gmail-Labels header in a raw header string.
 * Gmail Takeout includes: X-Gmail-Labels: Inbox,Important,Category Updates
 * Labels can be quoted if they contain commas: "Label, with comma"
 */
function extractGmailLabels(headerStr: string): string[] {
  // Match X-Gmail-Labels header (may span multiple lines with folding)
  const match = headerStr.match(/^X-Gmail-Labels:\s*(.+(?:\r?\n[ \t]+.+)*)/mi);
  if (!match) return [];

  const rawValue = match[1].replace(/\r?\n\s+/g, ' ').trim();
  if (!rawValue) return [];

  // Parse comma-separated labels, respecting quoted strings
  const labels: string[] = [];
  let current = '';
  let inQuote = false;

  for (let i = 0; i < rawValue.length; i++) {
    const ch = rawValue[i];
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      const trimmed = current.trim();
      if (trimmed) labels.push(trimmed);
      current = '';
    } else {
      current += ch;
    }
  }
  const lastTrimmed = current.trim();
  if (lastTrimmed) labels.push(lastTrimmed);

  return labels;
}

/**
 * Normalize a Gmail label into a cleaner display name.
 * E.g. "Category Promotions" → "Promotions" (under Category parent)
 */
function normalizeLabel(label: string): string {
  return label.trim();
}

/**
 * Known Gmail system label display order.
 */
const GMAIL_LABEL_ORDER: Record<string, number> = {
  'Inbox': 0,
  'Starred': 1,
  'Important': 2,
  'Sent': 3,
  'Drafts': 4,
  'Spam': 5,
  'Trash': 6,
  'Chats': 7,
};

/**
 * Build folder tree from Gmail labels found across all messages.
 * Creates nested folders for labels with "/" separator (e.g. "Work/Projects").
 * Groups "Category *" labels under a "Categories" parent.
 */
function buildFolderTree(
  messageIndex: MessageIndex[]
): { folders: PstFolder[]; folderMessageMap: Map<string, number[]> } {
  // Count messages per label and build label → message index mapping
  const labelCounts = new Map<string, number>();
  const labelMessages = new Map<string, number[]>();

  for (let i = 0; i < messageIndex.length; i++) {
    const labels = messageIndex[i].labels;
    if (labels.length === 0) {
      // Messages without labels go to "All Mail"
      const key = 'All Mail';
      labelCounts.set(key, (labelCounts.get(key) || 0) + 1);
      if (!labelMessages.has(key)) labelMessages.set(key, []);
      labelMessages.get(key)!.push(i);
    }
    for (const label of labels) {
      const normalized = normalizeLabel(label);
      if (!normalized) continue;
      labelCounts.set(normalized, (labelCounts.get(normalized) || 0) + 1);
      if (!labelMessages.has(normalized)) labelMessages.set(normalized, []);
      labelMessages.get(normalized)!.push(i);
    }
  }

  // Also add an "All Mail" entry with ALL messages
  if (!labelMessages.has('All Mail')) {
    labelMessages.set('All Mail', []);
  }
  const allMailList = labelMessages.get('All Mail')!;
  // If we only collected unlabeled messages above, now collect ALL
  // Always provide All Mail with every message
  allMailList.length = 0;
  for (let i = 0; i < messageIndex.length; i++) {
    allMailList.push(i);
  }
  labelCounts.set('All Mail', messageIndex.length);

  // Build flat folders first, then organize into tree
  const topLevel: PstFolder[] = [];
  const categoryChildren: PstFolder[] = [];
  const nestedFolders = new Map<string, PstFolder>(); // parent path → folder
  const processedLabels = new Set<string>();

  // Sort labels: system labels first (in Gmail order), then alphabetical
  const sortedLabels = [...labelCounts.keys()].sort((a, b) => {
    const orderA = GMAIL_LABEL_ORDER[a] ?? 999;
    const orderB = GMAIL_LABEL_ORDER[b] ?? 999;
    if (orderA !== orderB) return orderA - orderB;
    return a.localeCompare(b);
  });

  for (const label of sortedLabels) {
    if (processedLabels.has(label)) continue;
    processedLabels.add(label);

    const count = labelCounts.get(label) || 0;

    // Handle "Category *" labels → group under Categories parent
    if (label.startsWith('Category ')) {
      const catName = label.substring('Category '.length);
      categoryChildren.push({
        id: label,
        name: catName,
        messageCount: count,
        children: [],
      });
      continue;
    }

    // Handle nested labels with "/" separator (e.g. "Work/Projects/Active")
    if (label.includes('/')) {
      const parts = label.split('/');
      let currentPath = '';
      let parentChildren = topLevel;

      for (let p = 0; p < parts.length; p++) {
        const partName = parts[p];
        currentPath = currentPath ? `${currentPath}/${partName}` : partName;

        let existing = nestedFolders.get(currentPath);
        if (!existing) {
          const isLeaf = p === parts.length - 1;
          existing = {
            id: currentPath,
            name: partName,
            messageCount: isLeaf ? count : (labelCounts.get(currentPath) || 0),
            children: [],
          };
          nestedFolders.set(currentPath, existing);
          parentChildren.push(existing);

          // If intermediate path also has messages, register it
          if (!isLeaf && labelMessages.has(currentPath)) {
            // already handled by the folder
          }
        }
        parentChildren = existing.children;
      }
      continue;
    }

    // Regular top-level label
    const folder: PstFolder = {
      id: label,
      name: label,
      messageCount: count,
      children: [],
    };
    topLevel.push(folder);
  }

  // Add Categories parent if there are category labels
  if (categoryChildren.length > 0) {
    topLevel.push({
      id: '__categories__',
      name: 'Categories',
      messageCount: 0,
      children: categoryChildren,
    });
  }

  return { folders: topLevel, folderMessageMap: labelMessages };
}

/**
 * Find the byte offset of the first \n after `startOffset` in the file.
 */
function findNewlineAfter(filePath: string, startOffset: number): number {
  const fd = fs.openSync(filePath, 'r');
  const smallBuf = Buffer.alloc(512);
  let pos = startOffset;
  const fileSize = fs.fstatSync(fd).size;

  while (pos < fileSize) {
    const toRead = Math.min(512, fileSize - pos);
    fs.readSync(fd, smallBuf, 0, toRead, pos);
    for (let i = 0; i < toRead; i++) {
      if (smallBuf[i] === 0x0a) {
        fs.closeSync(fd);
        return pos + i;
      }
    }
    pos += toRead;
  }

  fs.closeSync(fd);
  return fileSize - 1;
}

/**
 * Read a single raw message from the MBOX file by its index entry.
 */
function readRawMessage(filePath: string, entry: MessageIndex): string {
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(entry.length);
  fs.readSync(fd, buf, 0, entry.length, entry.offset);
  fs.closeSync(fd);
  return buf.toString('utf-8');
}

/**
 * Parse a raw RFC 2822 message into our internal format.
 */
async function parseRawMessage(raw: string): Promise<ParsedEmail> {
  const parser = new PostalMime();
  const parsed = await parser.parse(raw);
  const from = formatAddress(parsed.from as any);

  return {
    subject: parsed.subject || '(No Subject)',
    senderName: from.name,
    senderEmail: from.email,
    toRecipients: formatAddressList(parsed.to as any),
    ccRecipients: formatAddressList(parsed.cc as any),
    bccRecipients: formatAddressList(parsed.bcc as any),
    date: parsed.date ? new Date(parsed.date).toISOString() : '',
    bodyText: parsed.text || '',
    bodyHtml: parsed.html || '',
    isRead: true,
    attachments: (parsed.attachments || []).map((att) => {
      const rawContent = att.content;
      const buf = typeof rawContent === 'string'
        ? Buffer.from(rawContent, 'binary')
        : Buffer.from(rawContent || new ArrayBuffer(0));
      return {
        filename: att.filename || 'attachment',
        size: buf.length,
        mimeType: att.mimeType || 'application/octet-stream',
        content: buf,
      };
    }),
  };
}

/**
 * Parse only the headers of a raw message to extract summary info quickly
 * without parsing the full body/attachments.
 */
function parseHeadersOnly(raw: string): {
  subject: string;
  senderName: string;
  senderEmail: string;
  date: string;
  preview: string;
  hasAttachments: boolean;
} {
  const blankLineIdx = raw.indexOf('\r\n\r\n');
  const blankLineIdx2 = raw.indexOf('\n\n');
  let headerEnd = -1;
  if (blankLineIdx !== -1 && blankLineIdx2 !== -1) {
    headerEnd = Math.min(blankLineIdx, blankLineIdx2);
  } else if (blankLineIdx !== -1) {
    headerEnd = blankLineIdx;
  } else if (blankLineIdx2 !== -1) {
    headerEnd = blankLineIdx2;
  }

  const headers = headerEnd > 0 ? raw.substring(0, headerEnd) : raw.substring(0, 2000);
  const bodyStart = headerEnd > 0
    ? raw.substring(headerEnd).replace(/^\r?\n\r?\n/, '')
    : '';

  const getHeader = (name: string): string => {
    const regex = new RegExp(`^${name}:\\s*(.+(?:\\r?\\n[ \\t]+.+)*)`, 'mi');
    const match = headers.match(regex);
    return match ? match[1].replace(/\r?\n\s+/g, ' ').trim() : '';
  };

  const subject = getHeader('Subject') || '(No Subject)';
  const fromRaw = getHeader('From');
  const dateRaw = getHeader('Date');
  const contentType = getHeader('Content-Type');

  let senderName = '';
  let senderEmail = '';
  const fromMatch = fromRaw.match(/^"?([^"<]*?)"?\s*<([^>]+)>/);
  if (fromMatch) {
    senderName = fromMatch[1].trim();
    senderEmail = fromMatch[2].trim();
  } else if (fromRaw.includes('@')) {
    senderEmail = fromRaw.trim();
  }

  let date = '';
  if (dateRaw) {
    try {
      date = new Date(dateRaw).toISOString();
    } catch {
      date = '';
    }
  }

  let preview = bodyStart
    .replace(/^--[^\n]+\n/gm, '')
    .replace(/^Content-[^\n]+\n/gm, '')
    .replace(/^\s+/gm, ' ')
    .slice(0, 300)
    .replace(/\r?\n/g, ' ')
    .trim()
    .slice(0, 200);

  const hasAttachments =
    contentType.toLowerCase().includes('mixed') ||
    raw.includes('Content-Disposition: attachment');

  return { subject, senderName, senderEmail, date, preview, hasAttachments };
}

// ─── Public API ──────────────────────────────────────────────────────

export async function openMboxFile(filePath: string, originalFilename?: string): Promise<{
  sessionId: string;
  folders: PstFolder[];
}> {
  console.log(`[MBOX] Building index for ${filePath}...`);
  const startTime = Date.now();

  const messageIndex = buildMessageIndex(filePath);

  const indexElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[MBOX] Indexed ${messageIndex.length} messages in ${indexElapsed}s`);

  // Check if this is a Gmail Takeout export (has X-Gmail-Labels)
  const hasGmailLabels = messageIndex.some(m => m.labels.length > 0);

  let folders: PstFolder[];
  let folderMessageMap: Map<string, number[]>;

  if (hasGmailLabels) {
    console.log(`[MBOX] Gmail labels detected — building folder tree...`);
    const result = buildFolderTree(messageIndex);
    folders = result.folders;
    folderMessageMap = result.folderMessageMap;
    const labelCount = folderMessageMap.size;
    console.log(`[MBOX] Built ${labelCount} label folders`);
  } else {
    // No Gmail labels — single folder like before
    const nameSource = originalFilename || filePath;
    const folderName = nameSource
      .replace(/\\/g, '/')
      .split('/')
      .pop()
      ?.replace(/\.mbox$/i, '') || 'Inbox';

    folders = [{
      id: folderName,
      name: folderName,
      messageCount: messageIndex.length,
      children: [],
    }];

    folderMessageMap = new Map();
    const allIndices: number[] = [];
    for (let i = 0; i < messageIndex.length; i++) allIndices.push(i);
    folderMessageMap.set(folderName, allIndices);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[MBOX] Ready in ${elapsed}s — ${messageIndex.length} messages, ${folders.length} top-level folders`);

  const sessionId = uuidv4();

  mboxSessions.set(sessionId, {
    filePath,
    messageIndex,
    folderMessageMap,
    summaryCache: new Map(),
    detailCache: new Map(),
    folders,
    folderLoadedUpTo: new Map(),
  });

  return { sessionId, folders };
}

/**
 * Ensure we have summaries loaded for messages in a specific folder
 * up to `needed` count.
 */
async function ensureFolderSummariesLoaded(
  session: MboxSession,
  folderId: string,
  needed: number
): Promise<void> {
  const folderIndices = session.folderMessageMap.get(folderId);
  if (!folderIndices) return;

  const effectiveNeeded = Math.min(needed, folderIndices.length);
  const currentLoaded = session.folderLoadedUpTo.get(folderId) || 0;

  if (currentLoaded >= effectiveNeeded) return;

  for (let fi = currentLoaded; fi < effectiveNeeded; fi++) {
    const globalIdx = folderIndices[fi];
    if (session.summaryCache.has(globalIdx)) continue;

    const entry = session.messageIndex[globalIdx];

    // Read enough of the message for postal-mime to parse headers + start of body.
    // We read up to 16KB so postal-mime can decode MIME-encoded headers properly.
    const readSize = Math.min(16384, entry.length);
    const fd = fs.openSync(session.filePath, 'r');
    const headerBuf = Buffer.alloc(readSize);
    fs.readSync(fd, headerBuf, 0, readSize, entry.offset);
    fs.closeSync(fd);

    const partialRaw = headerBuf.toString('utf-8');

    let subject = '(No Subject)';
    let senderName = '';
    let senderEmail = '';
    let date = '';
    let preview = '';
    let hasAttachments = false;

    try {
      const parser = new PostalMime();
      const parsed = await parser.parse(partialRaw);
      subject = parsed.subject || '(No Subject)';
      const from = formatAddress(parsed.from as any);
      senderName = from.name;
      senderEmail = from.email;
      date = parsed.date ? new Date(parsed.date).toISOString() : '';
      preview = (parsed.text || '').slice(0, 200).replace(/\r?\n/g, ' ');
      hasAttachments = (parsed.attachments || []).length > 0;
    } catch {
      // Fall back to raw header parsing if postal-mime fails
      const info = parseHeadersOnly(partialRaw);
      subject = info.subject;
      senderName = info.senderName;
      senderEmail = info.senderEmail;
      date = info.date;
      preview = info.preview;
      hasAttachments = info.hasAttachments;
    }

    const summary: CachedSummary = {
      _parsed: true,
      id: `${folderId}::${globalIdx}`,
      folderId,
      subject,
      senderName,
      senderEmail,
      receivedDate: date,
      isRead: true,
      hasAttachments,
      preview,
    };

    session.summaryCache.set(globalIdx, summary);
  }

  session.folderLoadedUpTo.set(folderId, effectiveNeeded);
}

export async function getMboxMessages(
  sessionId: string,
  folderId: string,
  offset = 0,
  limit = 50
): Promise<{ messages: EmailSummary[]; total: number }> {
  const session = getMboxSession(sessionId);
  const folderIndices = session.folderMessageMap.get(folderId);

  if (!folderIndices) {
    return { messages: [], total: 0 };
  }

  const total = folderIndices.length;
  const needed = Math.min(offset + limit, total);
  await ensureFolderSummariesLoaded(session, folderId, needed);

  const messages: EmailSummary[] = [];
  for (let fi = offset; fi < Math.min(offset + limit, total); fi++) {
    const globalIdx = folderIndices[fi];
    const cached = session.summaryCache.get(globalIdx);
    if (cached) {
      // Return with the correct folderId for this context
      messages.push({ ...cached, folderId, id: `${folderId}::${globalIdx}` });
    }
  }

  return { messages, total };
}

export async function getMboxMessageDetail(
  sessionId: string,
  messageId: string
): Promise<EmailDetail> {
  const session = getMboxSession(sessionId);
  const parts = messageId.split('::');
  const folderId = parts[0];
  const globalIdx = parseInt(parts[1], 10);

  let parsed = session.detailCache.get(globalIdx);
  if (!parsed) {
    const entry = session.messageIndex[globalIdx];
    if (!entry) throw new Error(`Message not found: ${messageId}`);

    const raw = readRawMessage(session.filePath, entry);
    parsed = await parseRawMessage(raw);
    session.detailCache.set(globalIdx, parsed);

    // Limit detail cache size to prevent memory bloat
    if (session.detailCache.size > 200) {
      const oldestKey = session.detailCache.keys().next().value;
      if (oldestKey !== undefined) {
        session.detailCache.delete(oldestKey);
      }
    }
  }

  return {
    id: messageId,
    folderId,
    subject: parsed.subject,
    senderName: parsed.senderName,
    senderEmail: parsed.senderEmail,
    receivedDate: parsed.date,
    isRead: parsed.isRead,
    hasAttachments: parsed.attachments.length > 0,
    preview: parsed.bodyText.slice(0, 200).replace(/\r?\n/g, ' '),
    toRecipients: parsed.toRecipients,
    ccRecipients: parsed.ccRecipients,
    bccRecipients: parsed.bccRecipients,
    bodyText: parsed.bodyText,
    bodyHtml: parsed.bodyHtml,
    attachments: parsed.attachments.map((att, i) => ({
      index: i,
      filename: att.filename,
      size: att.size,
      mimeType: att.mimeType,
    })),
  };
}

export async function getMboxAttachmentBuffer(
  sessionId: string,
  messageId: string,
  attachmentIndex: number
): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
  const session = getMboxSession(sessionId);
  const globalIdx = parseInt(messageId.split('::')[1], 10);

  let parsed = session.detailCache.get(globalIdx);
  if (!parsed) {
    const entry = session.messageIndex[globalIdx];
    if (!entry) throw new Error(`Message not found: ${messageId}`);
    const raw = readRawMessage(session.filePath, entry);
    parsed = await parseRawMessage(raw);
    session.detailCache.set(globalIdx, parsed);
  }

  const att = parsed.attachments[attachmentIndex];
  if (!att) throw new Error(`Attachment not found: ${attachmentIndex}`);

  return {
    buffer: att.content,
    filename: att.filename,
    mimeType: att.mimeType,
  };
}

export async function searchMboxMessages(
  sessionId: string,
  query: string,
  maxResults = 100
): Promise<EmailSummary[]> {
  const session = getMboxSession(sessionId);
  const results: EmailSummary[] = [];
  const lowerQuery = query.toLowerCase();

  for (const [_idx, summary] of session.summaryCache) {
    if (results.length >= maxResults) break;
    if (
      summary.subject.toLowerCase().includes(lowerQuery) ||
      summary.senderName.toLowerCase().includes(lowerQuery) ||
      summary.senderEmail.toLowerCase().includes(lowerQuery) ||
      summary.preview.toLowerCase().includes(lowerQuery)
    ) {
      results.push(summary);
    }
  }

  return results;
}

export function closeMboxSession(sessionId: string): void {
  mboxSessions.delete(sessionId);
}

export function isMboxSession(sessionId: string): boolean {
  return mboxSessions.has(sessionId);
}

function getMboxSession(sessionId: string): MboxSession {
  const s = mboxSessions.get(sessionId);
  if (!s) throw new Error(`Invalid MBOX session: ${sessionId}`);
  return s;
}
