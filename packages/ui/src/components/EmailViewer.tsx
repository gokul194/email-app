import { useRef, useEffect } from 'react';
import DOMPurify from 'dompurify';
import { useEmailStore } from '../store/email-store';
import { useResponsive } from '../hooks/useResponsive';
import { AttachmentList } from './AttachmentList';
import { formatDate } from '@email-app/shared';

export function EmailViewer() {
  const { selectedMessage, setShowMessageList } = useEmailStore();
  const { isMobile } = useResponsive();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const sanitizedHtml = selectedMessage?.bodyHtml
    ? DOMPurify.sanitize(selectedMessage.bodyHtml, {
        FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed'],
        FORBID_ATTR: ['onerror', 'onclick', 'onload'],
      })
    : '';

  useEffect(() => {
    if (iframeRef.current && sanitizedHtml) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(`<!DOCTYPE html>
<html><head><style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         font-size: 14px; color: #333; padding: 16px; margin: 0; line-height: 1.5; }
  img { max-width: 100%; height: auto; }
  a { color: #2563eb; }
  table { max-width: 100%; }
</style></head><body>${sanitizedHtml}</body></html>`);
        doc.close();
      }
    }
  }, [sanitizedHtml]);

  if (!selectedMessage) return null;

  return (
    <div className="flex h-full flex-col">
      {isMobile && (
        <button
          className="flex items-center gap-1 border-b border-gray-200 px-4 py-2 text-sm text-blue-600"
          onClick={() => setShowMessageList(true)}
        >
          &larr; Back to list
        </button>
      )}

      {/* Email header */}
      <div className="border-b border-gray-200 px-6 py-4">
        <h1 className="text-lg font-semibold text-gray-900">
          {selectedMessage.subject}
        </h1>
        <div className="mt-2 space-y-1 text-sm text-gray-600">
          <div>
            <span className="font-medium text-gray-700">From:</span>{' '}
            {selectedMessage.senderName}
            {selectedMessage.senderEmail && (
              <span className="text-gray-400">
                {' '}
                &lt;{selectedMessage.senderEmail}&gt;
              </span>
            )}
          </div>
          {selectedMessage.toRecipients && (
            <div>
              <span className="font-medium text-gray-700">To:</span>{' '}
              {selectedMessage.toRecipients}
            </div>
          )}
          {selectedMessage.ccRecipients && (
            <div>
              <span className="font-medium text-gray-700">CC:</span>{' '}
              {selectedMessage.ccRecipients}
            </div>
          )}
          <div>
            <span className="font-medium text-gray-700">Date:</span>{' '}
            {selectedMessage.receivedDate
              ? formatDate(selectedMessage.receivedDate)
              : 'Unknown'}
          </div>
        </div>
      </div>

      {/* Attachments */}
      {selectedMessage.attachments.length > 0 && (
        <AttachmentList attachments={selectedMessage.attachments} />
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {sanitizedHtml ? (
          <iframe
            ref={iframeRef}
            className="h-full w-full border-0"
            sandbox="allow-same-origin"
            title="Email content"
          />
        ) : (
          <pre className="whitespace-pre-wrap p-6 font-sans text-sm text-gray-700">
            {selectedMessage.bodyText || '(No content)'}
          </pre>
        )}
      </div>
    </div>
  );
}
