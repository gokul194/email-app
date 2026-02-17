import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useEmailStore } from '../store/email-store';
import { useDataProvider } from '../providers/DataProviderContext';
import { useResponsive } from '../hooks/useResponsive';
import { EmailListItem } from './EmailListItem';
import { LoadingSpinner } from './LoadingSpinner';
import { EmptyState } from './EmptyState';

export function EmailList() {
  const parentRef = useRef<HTMLDivElement>(null);
  const {
    messages,
    searchResults,
    selectedMessageId,
    selectedFolderId,
    sessionId,
    isLoading,
    isSearching,
    setSelectedMessage,
    setLoading,
    setError,
    setShowMessageList,
    setSelectedFolder,
  } = useEmailStore();
  const provider = useDataProvider();
  const { isMobile } = useResponsive();

  const displayMessages = searchResults ?? messages;

  const virtualizer = useVirtualizer({
    count: displayMessages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 76,
    overscan: 10,
  });

  async function handleSelectMessage(messageId: string) {
    if (!sessionId) return;
    setLoading(true);
    try {
      const detail = await provider.getMessageDetail(sessionId, messageId);
      setSelectedMessage(detail);
      setShowMessageList(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load message'
      );
    } finally {
      setLoading(false);
    }
  }

  if (isLoading && displayMessages.length === 0) return <LoadingSpinner />;
  if (isSearching) return <LoadingSpinner />;

  return (
    <div className="flex h-full flex-col">
      {isMobile && selectedFolderId && (
        <button
          className="flex items-center gap-1 border-b border-gray-200 px-4 py-2 text-sm text-blue-600"
          onClick={() => setSelectedFolder('')}
        >
          &larr; Folders
        </button>
      )}
      {displayMessages.length === 0 ? (
        <EmptyState message="No emails in this folder" />
      ) : (
        <div ref={parentRef} className="flex-1 overflow-y-auto">
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const msg = displayMessages[virtualRow.index];
              return (
                <div
                  key={msg.id}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <EmailListItem
                    email={msg}
                    isSelected={selectedMessageId === msg.id}
                    onClick={() => handleSelectMessage(msg.id)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
