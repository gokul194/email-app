import type {
  DataProvider,
  EmailSummary,
  EmailDetail,
  PstFolder,
} from '@email-app/shared';

declare global {
  interface Window {
    electronAPI: {
      openFileDialog: () => Promise<string | null>;
      openPst: (
        filePath: string
      ) => Promise<{ sessionId: string; folders: PstFolder[] }>;
      getMessages: (
        sessionId: string,
        folderId: string,
        offset: number,
        limit: number
      ) => Promise<{ messages: EmailSummary[]; total: number }>;
      getMessageDetail: (
        sessionId: string,
        messageId: string
      ) => Promise<EmailDetail>;
      getAttachment: (
        sessionId: string,
        messageId: string,
        index: number
      ) => Promise<{ data: ArrayBuffer; filename: string; mimeType: string }>;
      search: (
        sessionId: string,
        query: string
      ) => Promise<EmailSummary[]>;
      closePst: (sessionId: string) => Promise<void>;
    };
  }
}

export class ElectronDataProvider implements DataProvider {
  async openPst(
    file: File | string
  ): Promise<{ sessionId: string; folders: PstFolder[] }> {
    let filePath: string;

    if (typeof file === 'string') {
      filePath = file;
    } else if ((file as any).path) {
      // Electron File objects from drag-drop have a .path property
      filePath = (file as any).path;
    } else {
      const dialogPath = await window.electronAPI.openFileDialog();
      if (!dialogPath) throw new Error('No file selected');
      filePath = dialogPath;
    }

    return window.electronAPI.openPst(filePath);
  }

  async getMessages(
    sessionId: string,
    folderId: string,
    offset = 0,
    limit = 50
  ): Promise<{ messages: EmailSummary[]; total: number }> {
    return window.electronAPI.getMessages(sessionId, folderId, offset, limit);
  }

  async getMessageDetail(
    sessionId: string,
    messageId: string
  ): Promise<EmailDetail> {
    return window.electronAPI.getMessageDetail(sessionId, messageId);
  }

  async getAttachment(
    sessionId: string,
    messageId: string,
    attachmentIndex: number
  ): Promise<{ blob: Blob; filename: string }> {
    const { data, filename, mimeType } =
      await window.electronAPI.getAttachment(
        sessionId,
        messageId,
        attachmentIndex
      );
    const blob = new Blob([data], { type: mimeType });
    return { blob, filename };
  }

  async search(
    sessionId: string,
    query: string
  ): Promise<EmailSummary[]> {
    return window.electronAPI.search(sessionId, query);
  }

  async closePst(sessionId: string): Promise<void> {
    return window.electronAPI.closePst(sessionId);
  }
}
