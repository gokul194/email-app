import { ipcMain, dialog } from 'electron';
import {
  openFile,
  getMessagesInFolder,
  getMessageDetail,
  getAttachmentBuffer,
  searchMessages,
  closeSession,
} from '@email-app/pst-core';

export function registerIpcHandlers() {
  ipcMain.handle('pst:open-dialog', async () => {
    const result = await dialog.showOpenDialog({
      filters: [
        { name: 'Email Archives', extensions: ['pst', 'mbox'] },
        { name: 'PST Files', extensions: ['pst'] },
        { name: 'MBOX Files', extensions: ['mbox'] },
      ],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('pst:open', async (_event, filePath: string) => {
    return openFile(filePath);
  });

  ipcMain.handle(
    'pst:get-messages',
    (_event, sessionId: string, folderId: string, offset: number, limit: number) => {
      return getMessagesInFolder(sessionId, folderId, offset, limit);
    }
  );

  ipcMain.handle(
    'pst:get-message-detail',
    (_event, sessionId: string, messageId: string) => {
      return getMessageDetail(sessionId, messageId);
    }
  );

  ipcMain.handle(
    'pst:get-attachment',
    (_event, sessionId: string, messageId: string, attachmentIndex: number) => {
      const { buffer, filename, mimeType } = getAttachmentBuffer(
        sessionId,
        messageId,
        attachmentIndex
      );
      return {
        data: buffer.buffer.slice(
          buffer.byteOffset,
          buffer.byteOffset + buffer.byteLength
        ),
        filename,
        mimeType,
      };
    }
  );

  ipcMain.handle(
    'pst:search',
    (_event, sessionId: string, query: string) => {
      return searchMessages(sessionId, query);
    }
  );

  ipcMain.handle('pst:close', (_event, sessionId: string) => {
    closeSession(sessionId);
  });
}
