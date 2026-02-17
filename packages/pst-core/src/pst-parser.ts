import { PSTFile, PSTFolder, PSTMessage } from 'pst-extractor';
import { v4 as uuidv4 } from 'uuid';
import type {
  PstFolder,
  EmailSummary,
  EmailDetail,
  AttachmentInfo,
} from '@email-app/shared';

interface Session {
  pstFile: PSTFile;
  folderMap: Map<string, PSTFolder>;
  /** Pre-cached summaries per folder to avoid re-iterating. */
  folderMessages: Map<string, EmailSummary[]>;
  /** Cached native messages for detail lookups. */
  messageCache: Map<string, PSTMessage>;
}

const sessions = new Map<string, Session>();

export function openPstFile(filePath: string): {
  sessionId: string;
  folders: PstFolder[];
} {
  const pstFile = new PSTFile(filePath);
  const sessionId = uuidv4();
  const folderMap = new Map<string, PSTFolder>();

  function walkFolder(native: PSTFolder, parentPath: string): PstFolder {
    const name = native.displayName || 'Root';
    const id = parentPath ? `${parentPath}/${name}` : name;
    folderMap.set(id, native);

    const children: PstFolder[] = [];
    if (native.hasSubfolders) {
      const subs = native.getSubFolders();
      for (const sub of subs) {
        children.push(walkFolder(sub, id));
      }
    }

    return {
      id,
      name,
      messageCount: native.contentCount,
      children,
    };
  }

  const rootFolder = pstFile.getRootFolder();
  const folders: PstFolder[] = [];
  if (rootFolder.hasSubfolders) {
    const subs = rootFolder.getSubFolders();
    for (const sub of subs) {
      folders.push(walkFolder(sub, ''));
    }
  }

  sessions.set(sessionId, {
    pstFile,
    folderMap,
    folderMessages: new Map(),
    messageCache: new Map(),
  });

  return { sessionId, folders };
}

/**
 * Load all message summaries for a folder (cached after first call).
 */
function loadFolderMessages(session: Session, folderId: string): EmailSummary[] {
  const cached = session.folderMessages.get(folderId);
  if (cached) return cached;

  const native = session.folderMap.get(folderId);
  if (!native) throw new Error(`Folder not found: ${folderId}`);

  const summaries: EmailSummary[] = [];
  let msg: PSTMessage = native.getNextChild();
  let index = 0;

  while (msg !== null) {
    const messageId = `${folderId}::${index}`;
    session.messageCache.set(messageId, msg);
    summaries.push(mapToSummary(msg, messageId, folderId));
    index++;
    msg = native.getNextChild();
  }

  session.folderMessages.set(folderId, summaries);
  return summaries;
}

export function getMessagesInFolder(
  sessionId: string,
  folderId: string,
  offset = 0,
  limit = 50
): { messages: EmailSummary[]; total: number } {
  const session = getSession(sessionId);
  const all = loadFolderMessages(session, folderId);
  return {
    messages: all.slice(offset, offset + limit),
    total: all.length,
  };
}

export function getMessageDetail(
  sessionId: string,
  messageId: string
): EmailDetail {
  const session = getSession(sessionId);
  const msg = resolveMessage(session, messageId);

  const attachments: AttachmentInfo[] = [];
  for (let i = 0; i < msg.numberOfAttachments; i++) {
    const att = msg.getAttachment(i);
    attachments.push({
      index: i,
      filename: att.longFilename || att.filename || `attachment_${i}`,
      size: att.size,
      mimeType: att.mimeTag || 'application/octet-stream',
    });
  }

  const folderId = messageId.split('::')[0];
  return {
    ...mapToSummary(msg, messageId, folderId),
    toRecipients: msg.displayTo || '',
    ccRecipients: msg.displayCC || '',
    bccRecipients: msg.displayBCC || '',
    bodyText: msg.body || '',
    bodyHtml: msg.bodyHTML || '',
    attachments,
  };
}

export function getAttachmentBuffer(
  sessionId: string,
  messageId: string,
  attachmentIndex: number
): { buffer: Buffer; filename: string; mimeType: string } {
  const session = getSession(sessionId);
  const msg = resolveMessage(session, messageId);
  const att = msg.getAttachment(attachmentIndex);

  const stream = att.fileInputStream;
  if (!stream) throw new Error('Attachment has no data stream');

  const chunks: Buffer[] = [];
  const blockSize = 8192;
  const readBuf = Buffer.alloc(blockSize);
  let bytesRead: number;
  do {
    bytesRead = stream.read(readBuf);
    if (bytesRead > 0) {
      chunks.push(Buffer.from(readBuf.subarray(0, bytesRead)));
    }
  } while (bytesRead === blockSize);

  return {
    buffer: Buffer.concat(chunks),
    filename: att.longFilename || att.filename || `attachment_${attachmentIndex}`,
    mimeType: att.mimeTag || 'application/octet-stream',
  };
}

export function searchMessages(
  sessionId: string,
  query: string,
  maxResults = 100
): EmailSummary[] {
  const session = getSession(sessionId);
  const results: EmailSummary[] = [];
  const lowerQuery = query.toLowerCase();

  // Search across all folders using cached summaries
  for (const [folderId] of session.folderMap) {
    const summaries = loadFolderMessages(session, folderId);
    for (const summary of summaries) {
      if (results.length >= maxResults) return results;

      if (
        summary.subject.toLowerCase().includes(lowerQuery) ||
        summary.senderName.toLowerCase().includes(lowerQuery) ||
        summary.senderEmail.toLowerCase().includes(lowerQuery) ||
        summary.preview.toLowerCase().includes(lowerQuery)
      ) {
        results.push(summary);
      }
    }
  }

  return results;
}

export function closePstSession(sessionId: string): void {
  sessions.delete(sessionId);
}

// --- Helpers ---

function getSession(sessionId: string): Session {
  const s = sessions.get(sessionId);
  if (!s) throw new Error(`Invalid session: ${sessionId}`);
  return s;
}

function resolveMessage(session: Session, messageId: string): PSTMessage {
  const cached = session.messageCache.get(messageId);
  if (cached) return cached;

  // Re-derive by loading the folder
  const [folderId, indexStr] = messageId.split('::');
  const targetIndex = parseInt(indexStr, 10);
  loadFolderMessages(session, folderId);

  const msg = session.messageCache.get(messageId);
  if (!msg) throw new Error(`Message not found: ${messageId}`);
  return msg;
}

function mapToSummary(
  msg: PSTMessage,
  messageId: string,
  folderId: string
): EmailSummary {
  return {
    id: messageId,
    folderId,
    subject: msg.subject || '(No Subject)',
    senderName: msg.senderName || '',
    senderEmail: msg.senderEmailAddress || '',
    receivedDate: msg.clientSubmitTime
      ? msg.clientSubmitTime.toISOString()
      : '',
    isRead: msg.isRead,
    hasAttachments: msg.hasAttachments,
    preview: (msg.body || '').slice(0, 200).replace(/\r?\n/g, ' '),
  };
}
