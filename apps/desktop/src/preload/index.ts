import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  openFileDialog: () => ipcRenderer.invoke('pst:open-dialog'),
  openPst: (filePath: string) => ipcRenderer.invoke('pst:open', filePath),
  getMessages: (
    sessionId: string,
    folderId: string,
    offset: number,
    limit: number
  ) => ipcRenderer.invoke('pst:get-messages', sessionId, folderId, offset, limit),
  getMessageDetail: (sessionId: string, messageId: string) =>
    ipcRenderer.invoke('pst:get-message-detail', sessionId, messageId),
  getAttachment: (
    sessionId: string,
    messageId: string,
    attachmentIndex: number
  ) =>
    ipcRenderer.invoke('pst:get-attachment', sessionId, messageId, attachmentIndex),
  search: (sessionId: string, query: string) =>
    ipcRenderer.invoke('pst:search', sessionId, query),
  closePst: (sessionId: string) => ipcRenderer.invoke('pst:close', sessionId),
});
