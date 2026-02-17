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

export async function openFile(filePath: string): Promise<{
  sessionId: string;
  folders: PstFolder[];
}> {
  const ext = filePath.toLowerCase().split('.').pop();

  if (ext === 'mbox') {
    const result = await _openMbox(filePath);
    sessionTypes.set(result.sessionId, 'mbox');
    return result;
  }

  // Default: PST
  const result = _openPst(filePath);
  sessionTypes.set(result.sessionId, 'pst');
  return result;
}

export function getMessagesInFolder(
  sessionId: string,
  folderId: string,
  offset = 0,
  limit = 50
): { messages: EmailSummary[]; total: number } {
  if (isMboxSession(sessionId)) {
    return getMboxMessages(sessionId, folderId, offset, limit);
  }
  return _getPstMessages(sessionId, folderId, offset, limit);
}

export function getMessageDetail(
  sessionId: string,
  messageId: string
): EmailDetail {
  if (isMboxSession(sessionId)) {
    return getMboxMessageDetail(sessionId, messageId);
  }
  return _getPstDetail(sessionId, messageId);
}

export function getAttachmentBuffer(
  sessionId: string,
  messageId: string,
  attachmentIndex: number
): { buffer: Buffer; filename: string; mimeType: string } {
  if (isMboxSession(sessionId)) {
    return getMboxAttachmentBuffer(sessionId, messageId, attachmentIndex);
  }
  return _getPstAttachment(sessionId, messageId, attachmentIndex);
}

export function searchMessages(
  sessionId: string,
  query: string,
  maxResults = 100
): EmailSummary[] {
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
