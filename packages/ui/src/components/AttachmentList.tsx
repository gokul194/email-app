import type { AttachmentInfo } from '@email-app/shared';
import { AttachmentItem } from './AttachmentItem';

interface Props {
  attachments: AttachmentInfo[];
}

export function AttachmentList({ attachments }: Props) {
  return (
    <div className="border-b border-gray-200 px-6 py-3">
      <p className="mb-2 text-xs font-semibold uppercase text-gray-500">
        Attachments ({attachments.length})
      </p>
      <div className="flex flex-wrap gap-2">
        {attachments.map((att) => (
          <AttachmentItem key={att.index} attachment={att} />
        ))}
      </div>
    </div>
  );
}
