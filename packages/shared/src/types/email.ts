/** Represents a folder node in the PST hierarchy. */
export interface PstFolder {
  id: string;
  name: string;
  messageCount: number;
  children: PstFolder[];
}

/** Compact email summary used in list views. */
export interface EmailSummary {
  id: string;
  folderId: string;
  subject: string;
  senderName: string;
  senderEmail: string;
  receivedDate: string; // ISO 8601
  isRead: boolean;
  hasAttachments: boolean;
  preview: string;
}

/** Full email detail returned when user clicks a message. */
export interface EmailDetail extends EmailSummary {
  toRecipients: string;
  ccRecipients: string;
  bccRecipients: string;
  bodyText: string;
  bodyHtml: string;
  attachments: AttachmentInfo[];
}

/** Attachment metadata (no binary content). */
export interface AttachmentInfo {
  index: number;
  filename: string;
  size: number;
  mimeType: string;
}
