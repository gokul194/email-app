import { useState, useCallback, useRef } from 'react';
import { useDataProvider } from '../providers/DataProviderContext';
import { useEmailStore } from '../store/email-store';
import { LoadingSpinner } from './LoadingSpinner';

export function FileDropZone() {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const provider = useDataProvider();
  const { isLoading, error, setSession, setLoading, setError } =
    useEmailStore();

  const handleFile = useCallback(
    async (file: File) => {
      setLoading(true);
      setError(null);
      try {
        const result = await provider.openPst(file);
        setSession(result.sessionId, result.folders);
      } catch (err) {
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
      {error && (
        <p className="mt-4 text-sm text-red-500">{error}</p>
      )}
    </div>
  );
}
