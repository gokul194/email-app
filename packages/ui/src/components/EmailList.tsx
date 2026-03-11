import { useRef, useEffect, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useEmailStore } from '../store/email-store';
import { useDataProvider } from '../providers/DataProviderContext';
import { useResponsive } from '../hooks/useResponsive';
import { EmailListItem } from './EmailListItem';
import { LoadingSpinner } from './LoadingSpinner';
import { EmptyState } from './EmptyState';

const PAGE_SIZE = 50;

export function EmailList() {
  const parentRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);
  const {
    messages,
    messageTotalCount,
    searchResults,
    selectedMessageId,
    selectedFolderId,
    sessionId,
    isLoading,
    isLoadingMore,
    isSearching,
    setSelectedMessage,
    setLoading,
    setLoadingMore,
    setError,
    setShowMessageList,
    setSelectedFolder,
    appendMessages,
  } = useEmailStore();
  const provider = useDataProvider();
  const { isMobile } = useResponsive();

  const displayMessages = searchResults ?? messages;
  const hasMore = searchResults === null && messages.length < messageTotalCount;

  const virtualizer = useVirtualizer({
    count: displayMessages.length + (hasMore ? 1 : 0), // +1 for loading sentinel
    getScrollElement: () => parentRef.current,
    estimateSize: (index) =>
      index === displayMessages.length ? 48 : 76, // sentinel is smaller
    overscan: 10,
  });

  // Load more messages when the user scrolls near the bottom
  const loadMore = useCallback(async () => {
    if (
      !sessionId ||
      !selectedFolderId ||
      loadingMoreRef.current ||
      !hasMore ||
      searchResults !== null
    ) {
      return;
    }

    loadingMoreRef.current = true;
    setLoadingMore(true);

    try {
      const offset = messages.length;
      const { messages: newMessages } = await provider.getMessages(
        sessionId,
        selectedFolderId,
        offset,
        PAGE_SIZE
      );
      if (newMessages.length > 0) {
        appendMessages(newMessages);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load more messages'
      );
    } finally {
      setLoadingMore(false);
      loadingMoreRef.current = false;
    }
  }, [
    sessionId,
    selectedFolderId,
    messages.length,
    hasMore,
    searchResults,
    provider,
    appendMessages,
    setLoadingMore,
    setError,
  ]);

  // Watch virtualizer items — if the sentinel row is visible, load more
  useEffect(() => {
    const virtualItems = virtualizer.getVirtualItems();
    if (virtualItems.length === 0) return;

    const lastItem = virtualItems[virtualItems.length - 1];
    if (!lastItem) return;

    // If we can see the last few items or the sentinel row, load more
    if (lastItem.index >= displayMessages.length - 5 && hasMore) {
      loadMore();
    }
  }, [virtualizer.getVirtualItems(), displayMessages.length, hasMore, loadMore]);

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

      {/* Message count header */}
      {displayMessages.length > 0 && (
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
          <span className="text-xs text-gray-500">
            {searchResults !== null
              ? `${displayMessages.length} search results`
              : `${messages.length} of ${messageTotalCount} emails loaded`}
          </span>
        </div>
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
              const isSentinel = virtualRow.index === displayMessages.length;
              if (isSentinel) {
                return (
                  <div
                    key="load-more-sentinel"
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <div className="flex items-center justify-center py-3">
                      {isLoadingMore ? (
                        <div className="flex items-center gap-2 text-sm text-gray-400">
                          <svg
                            className="h-4 w-4 animate-spin"
                            viewBox="0 0 24 24"
                            fill="none"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                            />
                          </svg>
                          Loading more...
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">
                          Scroll for more
                        </span>
                      )}
                    </div>
                  </div>
                );
              }

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
