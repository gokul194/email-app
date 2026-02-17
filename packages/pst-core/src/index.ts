import {
  openPstFile as _openPst,
  getMessagesInFolder as _getPstMessages,
  getMessageDetail as _getPstDetail,
  getAttachmentBuffer as _getPstAttachment,
  searchMessages as _searchPst,
  closePstSession as _closePst,
} from './pst-parser';

import {
  openMboxFile as _openMbox,
  getMboxMessages,
  getMboxMessageDetail,
  getMboxAttachmentBuffer,
  searchMboxMessages,
  closeMboxSession,
  isMboxSession,
} from './mbox-parser';

import type { PstFolder, EmailSummary, EmailDetail } from '@email-app/shared';

// Track which sessions are MBOX vs PST
const sessionTypes = new Map<string, 'pst' | 'mbox'>();

export async function openFile(filePath: string, originalFilename?: string): Promise<{
  sessionId: string;
  folders: PstFolder[];
}> {
  const nameToCheck = originalFilename || filePath;
  const ext = nameToCheck.toLowerCase().split('.').pop();

  if (ext === 'mbox') {
    const result = await _openMbox(filePath, originalFilename);
    sessionTypes.set(result.sessionId, 'mbox');
    return result;
  }

  // Default: PST
  const result = _openPst(filePath);
  sessionTypes.set(result.sessionId, 'pst');
  return result;
}

export async function getMessagesInFolder(
  sessionId: string,
  folderId: string,
  offset = 0,
  limit = 50
): Promise<{ messages: EmailSummary[]; total: number }> {
  if (isMboxSession(sessionId)) {
    return getMboxMessages(sessionId, folderId, offset, limit);
  }
  return _getPstMessages(sessionId, folderId, offset, limit);
}

export async function getMessageDetail(
  sessionId: string,
  messageId: string
): Promise<EmailDetail> {
  if (isMboxSession(sessionId)) {
    return getMboxMessageDetail(sessionId, messageId);
  }
  return _getPstDetail(sessionId, messageId);
}

export async function getAttachmentBuffer(
  sessionId: string,
  messageId: string,
  attachmentIndex: number
): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
  if (isMboxSession(sessionId)) {
    return getMboxAttachmentBuffer(sessionId, messageId, attachmentIndex);
  }
  return _getPstAttachment(sessionId, messageId, attachmentIndex);
}

export async function searchMessages(
  sessionId: string,
  query: string,
  maxResults = 100
): Promise<EmailSummary[]> {
  if (isMboxSession(sessionId)) {
    return searchMboxMessages(sessionId, query, maxResults);
  }
  return _searchPst(sessionId, query, maxResults);
}

export function closeSession(sessionId: string): void {
  if (isMboxSession(sessionId)) {
    closeMboxSession(sessionId);
  } else {
    _closePst(sessionId);
  }
  sessionTypes.delete(sessionId);
}

// Backwards compatibility
export { openFile as openPstFile };
export { closeSession as closePstSession };
