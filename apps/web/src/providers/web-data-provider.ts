import type { DataProvider, EmailSummary, EmailDetail, PstFolder } from '@email-app/shared';

const API_BASE = '/api/pst';

export class WebDataProvider implements DataProvider {
  async openPst(
    file: File | string
  ): Promise<{ sessionId: string; folders: PstFolder[] }> {
    if (typeof file === 'string') {
      throw new Error(
        'File path not supported in web mode. Please provide a File object.'
      );
    }
    const formData = new FormData();
    formData.append('pstFile', file);

    const res = await fetch(`${API_BASE}/open`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `Upload failed: ${res.statusText}`);
    }
    return res.json();
  }

  async getMessages(
    sessionId: string,
    folderId: string,
    offset = 0,
    limit = 50
  ): Promise<{ messages: EmailSummary[]; total: number }> {
    const params = new URLSearchParams({
      offset: String(offset),
      limit: String(limit),
    });
    const res = await fetch(
      `${API_BASE}/${sessionId}/folders/${encodeURIComponent(folderId)}/messages?${params}`
    );
    if (!res.ok) throw new Error(`Failed to load messages: ${res.statusText}`);
    return res.json();
  }

  async getMessageDetail(
    sessionId: string,
    messageId: string
  ): Promise<EmailDetail> {
    const res = await fetch(
      `${API_BASE}/${sessionId}/messages/${encodeURIComponent(messageId)}`
    );
    if (!res.ok) throw new Error(`Failed to load message: ${res.statusText}`);
    const data = await res.json();
    return data.message;
  }

  async getAttachment(
    sessionId: string,
    messageId: string,
    attachmentIndex: number
  ): Promise<{ blob: Blob; filename: string }> {
    const res = await fetch(
      `${API_BASE}/${sessionId}/messages/${encodeURIComponent(messageId)}/attachments/${attachmentIndex}`
    );
    if (!res.ok)
      throw new Error(`Failed to download attachment: ${res.statusText}`);
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') || '';
    const filenameMatch = disposition.match(/filename="(.+?)"/);
    const filename =
      filenameMatch?.[1]
        ? decodeURIComponent(filenameMatch[1])
        : `attachment_${attachmentIndex}`;
    return { blob, filename };
  }

  async search(
    sessionId: string,
    query: string
  ): Promise<EmailSummary[]> {
    const res = await fetch(
      `${API_BASE}/${sessionId}/search?q=${encodeURIComponent(query)}`
    );
    if (!res.ok) throw new Error(`Search failed: ${res.statusText}`);
    const data = await res.json();
    return data.results;
  }

  async closePst(sessionId: string): Promise<void> {
    await fetch(`${API_BASE}/${sessionId}`, { method: 'DELETE' });
  }
}
