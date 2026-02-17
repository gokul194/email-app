import * as fs from 'fs';
import PostalMime from 'postal-mime';
import { v4 as uuidv4 } from 'uuid';
import type {
  PstFolder,
  EmailSummary,
  EmailDetail,
  AttachmentInfo,
} from '@email-app/shared';

interface ParsedEmail {
  raw: string;
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

interface MboxSession {
  filePath: string;
  emails: ParsedEmail[];
  folders: PstFolder[];
}

const mboxSessions = new Map<string, MboxSession>();

/**
 * Split an MBOX file into individual raw RFC 2822 messages.
 */
function splitMbox(content: string): string[] {
  const messages: string[] = [];
  // MBOX format: each message starts with "From " at the beginning of a line
  const parts = content.split(/\n(?=From )/);
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    // Remove the "From <sender> <date>" envelope line
    const firstNewline = trimmed.indexOf('\n');
    if (firstNewline === -1) continue;
    const firstLine = trimmed.substring(0, firstNewline);
    if (firstLine.startsWith('From ')) {
      messages.push(trimmed.substring(firstNewline + 1));
    } else {
      messages.push(trimmed);
    }
  }
  return messages;
}

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

export async function openMboxFile(filePath: string): Promise<{
  sessionId: string;
  folders: PstFolder[];
}> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const rawMessages = splitMbox(content);

  const parser = new PostalMime();
  const emails: ParsedEmail[] = [];

  for (const raw of rawMessages) {
    try {
      const parsed = await parser.parse(raw);
      const from = formatAddress(parsed.from as any);
      emails.push({
        raw,
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
          const raw = att.content;
          const buf = typeof raw === 'string'
            ? Buffer.from(raw, 'binary')
            : Buffer.from(raw || new ArrayBuffer(0));
          return {
            filename: att.filename || 'attachment',
            size: buf.length,
            mimeType: att.mimeType || 'application/octet-stream',
            content: buf,
          };
        }),
      });
    } catch {
      // Skip unparseable messages
    }
  }

  // Sort by date descending
  emails.sort((a, b) => {
    if (!a.date || !b.date) return 0;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  const sessionId = uuidv4();
  const folderName = filePath
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    ?.replace(/\.mbox$/i, '') || 'Inbox';

  const folders: PstFolder[] = [
    {
      id: folderName,
      name: folderName,
      messageCount: emails.length,
      children: [],
    },
  ];

  mboxSessions.set(sessionId, { filePath, emails, folders });
  return { sessionId, folders };
}

export function getMboxMessages(
  sessionId: string,
  folderId: string,
  offset = 0,
  limit = 50
): { messages: EmailSummary[]; total: number } {
  const session = getMboxSession(sessionId);
  const total = session.emails.length;
  const slice = session.emails.slice(offset, offset + limit);

  const messages: EmailSummary[] = slice.map((email, i) => ({
    id: `${folderId}::${offset + i}`,
    folderId,
    subject: email.subject,
    senderName: email.senderName,
    senderEmail: email.senderEmail,
    receivedDate: email.date,
    isRead: email.isRead,
    hasAttachments: email.attachments.length > 0,
    preview: email.bodyText.slice(0, 200).replace(/\r?\n/g, ' '),
  }));

  return { messages, total };
}

export function getMboxMessageDetail(
  sessionId: string,
  messageId: string
): EmailDetail {
  const session = getMboxSession(sessionId);
  const index = parseInt(messageId.split('::')[1], 10);
  const folderId = messageId.split('::')[0];
  const email = session.emails[index];
  if (!email) throw new Error(`Message not found: ${messageId}`);

  return {
    id: messageId,
    folderId,
    subject: email.subject,
    senderName: email.senderName,
    senderEmail: email.senderEmail,
    receivedDate: email.date,
    isRead: email.isRead,
    hasAttachments: email.attachments.length > 0,
    preview: email.bodyText.slice(0, 200).replace(/\r?\n/g, ' '),
    toRecipients: email.toRecipients,
    ccRecipients: email.ccRecipients,
    bccRecipients: email.bccRecipients,
    bodyText: email.bodyText,
    bodyHtml: email.bodyHtml,
    attachments: email.attachments.map((att, i) => ({
      index: i,
      filename: att.filename,
      size: att.size,
      mimeType: att.mimeType,
    })),
  };
}

export function getMboxAttachmentBuffer(
  sessionId: string,
  messageId: string,
  attachmentIndex: number
): { buffer: Buffer; filename: string; mimeType: string } {
  const session = getMboxSession(sessionId);
  const index = parseInt(messageId.split('::')[1], 10);
  const email = session.emails[index];
  if (!email) throw new Error(`Message not found: ${messageId}`);

  const att = email.attachments[attachmentIndex];
  if (!att) throw new Error(`Attachment not found: ${attachmentIndex}`);

  return {
    buffer: att.content,
    filename: att.filename,
    mimeType: att.mimeType,
  };
}

export function searchMboxMessages(
  sessionId: string,
  query: string,
  maxResults = 100
): EmailSummary[] {
  const session = getMboxSession(sessionId);
  const results: EmailSummary[] = [];
  const lowerQuery = query.toLowerCase();
  const folderId = session.folders[0]?.id || 'Inbox';

  for (let i = 0; i < session.emails.length && results.length < maxResults; i++) {
    const email = session.emails[i];
    if (
      email.subject.toLowerCase().includes(lowerQuery) ||
      email.senderName.toLowerCase().includes(lowerQuery) ||
      email.senderEmail.toLowerCase().includes(lowerQuery) ||
      email.bodyText.toLowerCase().includes(lowerQuery)
    ) {
      results.push({
        id: `${folderId}::${i}`,
        folderId,
        subject: email.subject,
        senderName: email.senderName,
        senderEmail: email.senderEmail,
        receivedDate: email.date,
        isRead: email.isRead,
        hasAttachments: email.attachments.length > 0,
        preview: email.bodyText.slice(0, 200).replace(/\r?\n/g, ' '),
      });
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
