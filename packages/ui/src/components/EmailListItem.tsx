import type { EmailSummary } from '@email-app/shared';
import { formatDate, truncate } from '@email-app/shared';

interface Props {
  email: EmailSummary;
  isSelected: boolean;
  onClick: () => void;
}

export function EmailListItem({ email, isSelected, onClick }: Props) {
  return (
    <button
      className={`flex w-full flex-col gap-0.5 border-b border-gray-100 px-4 py-3 text-left transition-colors ${
        isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
      } ${!email.isRead ? 'font-semibold' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <span className="truncate text-sm text-gray-900">
          {email.senderName || email.senderEmail || 'Unknown'}
        </span>
        <span className="ml-2 flex-shrink-0 text-xs text-gray-400">
          {email.receivedDate ? formatDate(email.receivedDate) : ''}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <span className="truncate text-sm text-gray-700">{email.subject}</span>
        {email.hasAttachments && (
          <svg
            className="h-3.5 w-3.5 flex-shrink-0 text-gray-400"
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
        )}
      </div>
      <span className="truncate text-xs text-gray-400">
        {truncate(email.preview, 120)}
      </span>
    </button>
  );
}
