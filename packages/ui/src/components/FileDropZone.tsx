import { useState, useCallback, useRef } from 'react';
import { useDataProvider } from '../providers/DataProviderContext';
import { useEmailStore } from '../store/email-store';
import { LoadingSpinner } from './LoadingSpinner';

export function FileDropZone() {
  const [isDragging, setIsDragging] = useState(false);
  const [filePath, setFilePath] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const provider = useDataProvider();
  const { isLoading, error, setSession, setLoading, setError } =
    useEmailStore();

  const handleFile = useCallback(
    async (file: File) => {
      console.log('[FileDropZone] handleFile called:', file.name, file.size);
      setLoading(true);
      setError(null);
      try {
        const result = await provider.openPst(file);
        console.log('[FileDropZone] openPst result:', result.sessionId, result.folders.length, 'folders');
        setSession(result.sessionId, result.folders);
      } catch (err) {
        console.error('[FileDropZone] openPst error:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to open file'
        );
      } finally {
        setLoading(false);
      }
    },
    [provider, setSession, setLoading, setError]
  );

  const handleFilePath = useCallback(
    async (path: string) => {
      const trimmed = path.trim();
      if (!trimmed) return;
      const lower = trimmed.toLowerCase();
      if (!lower.endsWith('.pst') && !lower.endsWith('.mbox')) {
        setError('Please enter a path to a .pst or .mbox file');
        return;
      }
      console.log('[FileDropZone] handleFilePath called:', trimmed);
      setLoading(true);
      setError(null);
      try {
        const result = await provider.openPst(trimmed);
        console.log('[FileDropZone] openPst result:', result.sessionId, result.folders.length, 'folders');
        setSession(result.sessionId, result.folders);
      } catch (err) {
        console.error('[FileDropZone] openPst error:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to open file'
        );
      } finally {
        setLoading(false);
      }
    },
    [provider, setSession, setLoading, setError]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      const name = file?.name.toLowerCase() || '';
      if (file && (name.endsWith('.pst') || name.endsWith('.mbox'))) {
        handleFile(file);
      } else {
        setError('Please drop a .pst or .mbox file');
      }
    },
    [handleFile, setError]
  );

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
        <LoadingSpinner />
        <p className="text-sm text-gray-500">Parsing email archive...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8">
      <div
        className={`flex h-64 w-full max-w-lg flex-col items-center justify-center rounded-xl border-2 border-dashed transition-colors ${
          isDragging
            ? 'border-blue-400 bg-blue-50'
            : 'border-gray-300 bg-gray-50'
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
      >
        <svg
          className="mb-3 h-10 w-10 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
        <p className="text-lg text-gray-500">Drop a .pst or .mbox file here</p>
        <p className="mt-1 text-sm text-gray-400">or</p>
        <button
          className="mt-3 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800"
          onClick={() => inputRef.current?.click()}
        >
          Browse files
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".pst,.mbox"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>

      {/* Local file path input for large files */}
      <div className="mt-6 w-full max-w-lg">
        <p className="mb-2 text-center text-xs text-gray-400">
          For large files, paste the full file path:
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={filePath}
            onChange={(e) => setFilePath(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleFilePath(filePath);
            }}
            placeholder="e.g. C:\Users\...\emails.pst"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <button
            onClick={() => handleFilePath(filePath)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800"
          >
            Open
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-4 text-sm text-red-500">{error}</p>
      )}
    </div>
  );
}
