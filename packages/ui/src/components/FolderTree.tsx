import { useEmailStore } from '../store/email-store';
import { useDataProvider } from '../providers/DataProviderContext';
import { FolderTreeItem } from './FolderTreeItem';

export function FolderTree() {
  const { folders, selectedFolderId, sessionId } = useEmailStore();
  const { setSelectedFolder, setMessages, setLoading, setError } =
    useEmailStore();
  const provider = useDataProvider();

  async function handleSelectFolder(folderId: string) {
    if (!sessionId) return;
    setSelectedFolder(folderId);
    setLoading(true);
    try {
      const { messages, total } = await provider.getMessages(
        sessionId,
        folderId
      );
      setMessages(messages, total);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load messages'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <nav className="p-2">
      <h2 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
        Folders
      </h2>
      <ul>
        {folders.map((folder) => (
          <FolderTreeItem
            key={folder.id}
            folder={folder}
            selectedId={selectedFolderId}
            onSelect={handleSelectFolder}
            depth={0}
          />
        ))}
      </ul>
    </nav>
  );
}
