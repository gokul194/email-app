import type { AttachmentInfo } from '@email-app/shared';
import { formatFileSize } from '@email-app/shared';
import { useEmailStore } from '../store/email-store';
import { useDataProvider } from '../providers/DataProviderContext';

interface Props {
  attachment: AttachmentInfo;
}

export function AttachmentItem({ attachment }: Props) {
  const { sessionId, selectedMessageId } = useEmailStore();
  const provider = useDataProvider();

  async function handleDownload() {
    if (!sessionId || !selectedMessageId) return;
    const { blob, filename } = await provider.getAttachment(
      sessionId,
      selectedMessageId,
      attachment.index
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      onClick={handleDownload}
      className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm hover:bg-gray-100"
    >
      <svg
        className="h-4 w-4 flex-shrink-0 text-gray-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
        />
      </svg>
      <span className="max-w-[200px] truncate">{attachment.filename}</span>
      <span className="text-xs text-gray-400">
        {formatFileSize(attachment.size)}
      </span>
    </button>
  );
}
