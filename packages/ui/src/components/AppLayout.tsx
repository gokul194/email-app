import { useResponsive } from '../hooks/useResponsive';
import { useEmailStore } from '../store/email-store';
import { TopBar } from './TopBar';
import { FolderTree } from './FolderTree';
import { EmailList } from './EmailList';
import { EmailViewer } from './EmailViewer';
import { FileDropZone } from './FileDropZone';
import { EmptyState } from './EmptyState';

export function AppLayout() {
  const { isMobile } = useResponsive();
  const {
    sessionId,
    selectedFolderId,
    selectedMessage,
    isSidebarOpen,
    showMessageList,
  } = useEmailStore();

  // No file loaded: show drop zone
  if (!sessionId) {
    return (
      <div className="flex h-screen flex-col bg-gray-50">
        <TopBar />
        <FileDropZone />
      </div>
    );
  }

  // Mobile: stacked single-panel navigation
  if (isMobile) {
    return (
      <div className="flex h-screen flex-col bg-white">
        <TopBar />
        <div className="flex-1 overflow-hidden">
          {!selectedFolderId ? (
            <FolderTree />
          ) : !showMessageList && selectedMessage ? (
            <EmailViewer />
          ) : (
            <EmailList />
          )}
        </div>
      </div>
    );
  }

  // Desktop: 3-panel layout
  return (
    <div className="flex h-screen flex-col bg-white">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        {isSidebarOpen && (
          <aside className="w-60 flex-shrink-0 overflow-y-auto border-r border-gray-200 bg-gray-50">
            <FolderTree />
          </aside>
        )}
        <div className="w-80 flex-shrink-0 overflow-y-auto border-r border-gray-200">
          {selectedFolderId ? (
            <EmailList />
          ) : (
            <EmptyState message="Select a folder" />
          )}
        </div>
        <main className="flex-1 overflow-hidden">
          {selectedMessage ? (
            <EmailViewer />
          ) : (
            <EmptyState message="Select an email to read" />
          )}
        </main>
      </div>
    </div>
  );
}
