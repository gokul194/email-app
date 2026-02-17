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
 * message inside the MBOX file.  The actual message content is read on
 * demand, keeping memory usage minimal even for multi-GB files.
 */
interface MessageIndex {
  /** Byte offset of the first header line (after the "From " envelope line) */
  offset: number;
  /** Byte length of the raw RFC 2822 message */
  length: number;
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
  /** Cached summaries – populated lazily as pages are requested */
  summaryCache: Map<number, CachedSummary>;
  /** Cached full parses – populated on demand for detail views */
  detailCache: Map<number, ParsedEmail>;
  folders: PstFolder[];
  folderName: string;
  /** How many summaries have been loaded so far (sequential) */
  loadedUpTo: number;
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
  const markerStart = Buffer.from('From '); // for very first message at offset 0

  /** Byte offsets of each "From " envelope line */
  const envelopeOffsets: number[] = [];

  let bytesRead = 0;
  let filePos = 0;
  // We need to handle markers that span chunk boundaries.
  // Keep the last (marker.length - 1) bytes of the previous chunk.
  let overlap = Buffer.alloc(0);

  while (filePos < fileSize) {
    const toRead = Math.min(CHUNK_SIZE, fileSize - filePos);
    bytesRead = fs.readSync(fd, buf, 0, toRead, filePos);

    // Combine overlap from previous chunk with current chunk for boundary scanning
    const scanBuf = overlap.length > 0
      ? Buffer.concat([overlap, buf.subarray(0, bytesRead)])
      : buf.subarray(0, bytesRead);

    const scanOffset = filePos - overlap.length; // absolute file offset of scanBuf[0]

    // Check for "From " at the very start of the file
    if (filePos === 0 && scanBuf.length >= 5) {
      if (scanBuf[0] === 0x46 && // F
          scanBuf[1] === 0x72 && // r
          scanBuf[2] === 0x6f && // o
          scanBuf[3] === 0x6d && // m
          scanBuf[4] === 0x20) { // space
        envelopeOffsets.push(0);
      }
    }

    // Search for "\nFrom " within the scan buffer
    let searchStart = (filePos === 0 && overlap.length === 0) ? 1 : 0;
    while (searchStart <= scanBuf.length - marker.length) {
      const idx = scanBuf.indexOf(marker, searchStart);
      if (idx === -1) break;
      // The "\nFrom " was found; the envelope line starts at idx + 1
      const absOffset = scanOffset + idx + 1; // points to "From "
      envelopeOffsets.push(absOffset);
      searchStart = idx + marker.length;
    }

    // Keep overlap for next iteration
    const overlapSize = Math.min(marker.length - 1, bytesRead);
    overlap = Buffer.from(buf.subarray(bytesRead - overlapSize, bytesRead));

    filePos += bytesRead;
  }

  fs.closeSync(fd);

  // Now convert envelope offsets → message body offsets + lengths
  const index: MessageIndex[] = [];
  for (let i = 0; i < envelopeOffsets.length; i++) {
    // Find end of the "From " envelope line (first \n after envelope offset)
    const envOffset = envelopeOffsets[i];
    const headerStart = findNewlineAfter(filePath, envOffset) + 1;
    const nextEnv = i + 1 < envelopeOffsets.length
      ? envelopeOffsets[i + 1]
      : fileSize;
    // The message body goes from headerStart to (nextEnv - 1) — skip trailing \n
    const length = nextEnv - headerStart;
    if (length > 0) {
      index.push({ offset: headerStart, length });
    }
  }

  return index;
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
      if (smallBuf[i] === 0x0a) { // \n
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
  // Split headers from body at first blank line
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

  // Parse key headers using regex (fast, no full MIME parsing)
  const getHeader = (name: string): string => {
    const regex = new RegExp(`^${name}:\\s*(.+(?:\\r?\\n[ \\t]+.+)*)`, 'mi');
    const match = headers.match(regex);
    return match ? match[1].replace(/\r?\n\s+/g, ' ').trim() : '';
  };

  const subject = getHeader('Subject') || '(No Subject)';
  const fromRaw = getHeader('From');
  const dateRaw = getHeader('Date');
  const contentType = getHeader('Content-Type');

  // Parse From header
  let senderName = '';
  let senderEmail = '';
  const fromMatch = fromRaw.match(/^"?([^"<]*?)"?\s*<([^>]+)>/);
  if (fromMatch) {
    senderName = fromMatch[1].trim();
    senderEmail = fromMatch[2].trim();
  } else if (fromRaw.includes('@')) {
    senderEmail = fromRaw.trim();
  }

  // Parse date
  let date = '';
  if (dateRaw) {
    try {
      date = new Date(dateRaw).toISOString();
    } catch {
      date = '';
    }
  }

  // Quick preview from body (first 200 chars of plain text portion)
  // Strip common MIME boundaries/headers from the preview
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

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[MBOX] Indexed ${messageIndex.length} messages in ${elapsed}s`);

  const sessionId = uuidv4();
  const nameSource = originalFilename || filePath;
  const folderName = nameSource
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    ?.replace(/\.mbox$/i, '') || 'Inbox';

  const folders: PstFolder[] = [
    {
      id: folderName,
      name: folderName,
      messageCount: messageIndex.length,
      children: [],
    },
  ];

  mboxSessions.set(sessionId, {
    filePath,
    messageIndex,
    summaryCache: new Map(),
    detailCache: new Map(),
    folders,
    folderName,
    loadedUpTo: 0,
  });

  return { sessionId, folders };
}

/**
 * Ensure we have summaries loaded up to `needed` messages.
 * Loads in batch using header-only parsing for speed.
 */
async function ensureSummariesLoaded(session: MboxSession, needed: number): Promise<void> {
  const effectiveNeeded = Math.min(needed, session.messageIndex.length);

  if (session.loadedUpTo >= effectiveNeeded) return;

  const BATCH_SIZE = 100; // parse headers in batches
  let current = session.loadedUpTo;

  while (current < effectiveNeeded) {
    const batchEnd = Math.min(current + BATCH_SIZE, effectiveNeeded);

    for (let i = current; i < batchEnd; i++) {
      if (session.summaryCache.has(i)) {
        continue;
      }
      const entry = session.messageIndex[i];
      // Read only the first ~4KB of each message for header parsing
      const fd = fs.openSync(session.filePath, 'r');
      const headerBufSize = Math.min(4096, entry.length);
      const headerBuf = Buffer.alloc(headerBufSize);
      fs.readSync(fd, headerBuf, 0, headerBufSize, entry.offset);
      fs.closeSync(fd);

      const partialRaw = headerBuf.toString('utf-8');
      const info = parseHeadersOnly(partialRaw);

      const summary: CachedSummary = {
        _parsed: true,
        id: `${session.folderName}::${i}`,
        folderId: session.folderName,
        subject: info.subject,
        senderName: info.senderName,
        senderEmail: info.senderEmail,
        receivedDate: info.date,
        isRead: true,
        hasAttachments: info.hasAttachments,
        preview: info.preview,
      };

      session.summaryCache.set(i, summary);
    }

    current = batchEnd;
  }

  session.loadedUpTo = Math.max(session.loadedUpTo, effectiveNeeded);
}

export async function getMboxMessages(
  sessionId: string,
  folderId: string,
  offset = 0,
  limit = 50
): Promise<{ messages: EmailSummary[]; total: number }> {
  const session = getMboxSession(sessionId);
  const total = session.messageIndex.length;

  const needed = Math.min(offset + limit, total);
  await ensureSummariesLoaded(session, needed);

  const messages: EmailSummary[] = [];
  for (let i = offset; i < Math.min(offset + limit, total); i++) {
    const cached = session.summaryCache.get(i);
    if (cached) {
      messages.push(cached);
    }
  }

  return { messages, total };
}

export async function getMboxMessageDetail(
  sessionId: string,
  messageId: string
): Promise<EmailDetail> {
  const session = getMboxSession(sessionId);
  const index = parseInt(messageId.split('::')[1], 10);
  const folderId = messageId.split('::')[0];

  // Check detail cache first
  let parsed = session.detailCache.get(index);
  if (!parsed) {
    const entry = session.messageIndex[index];
    if (!entry) throw new Error(`Message not found: ${messageId}`);

    const raw = readRawMessage(session.filePath, entry);
    parsed = await parseRawMessage(raw);
    session.detailCache.set(index, parsed);

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
  const index = parseInt(messageId.split('::')[1], 10);

  // Ensure the message is fully parsed
  let parsed = session.detailCache.get(index);
  if (!parsed) {
    const entry = session.messageIndex[index];
    if (!entry) throw new Error(`Message not found: ${messageId}`);
    const raw = readRawMessage(session.filePath, entry);
    parsed = await parseRawMessage(raw);
    session.detailCache.set(index, parsed);
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

  // Search across loaded summaries
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
