import type { PstFolder, EmailSummary, EmailDetail } from './email';

/**
 * Platform-agnostic data access interface.
 * Implemented by WebDataProvider (fetch) and ElectronDataProvider (IPC).
 */
export interface DataProvider {
  openPst(file: File | string): Promise<{
    sessionId: string;
    folders: PstFolder[];
  }>;

  getMessages(
    sessionId: string,
    folderId: string,
    offset?: number,
    limit?: number
  ): Promise<{ messages: EmailSummary[]; total: number }>;

  getMessageDetail(
    sessionId: string,
    messageId: string
  ): Promise<EmailDetail>;

  getAttachment(
    sessionId: string,
    messageId: string,
    attachmentIndex: number
  ): Promise<{ blob: Blob; filename: string }>;

  search(sessionId: string, query: string): Promise<EmailSummary[]>;

  closePst(sessionId: string): Promise<void>;
}
