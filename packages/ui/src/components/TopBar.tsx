import { useEmailStore } from '../store/email-store';
import { SearchBar } from './SearchBar';

export function TopBar() {
  const { sessionId, toggleSidebar, reset } = useEmailStore();

  return (
    <header className="flex h-12 flex-shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4">
      <div className="flex items-center gap-3">
        {sessionId && (
          <button
            onClick={toggleSidebar}
            className="text-gray-500 hover:text-gray-700"
            title="Toggle sidebar"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
        )}
        <h1 className="text-sm font-semibold text-gray-800">
          PST Email Reader
        </h1>
      </div>
      <div className="flex items-center gap-3">
        {sessionId && <SearchBar />}
        {sessionId && (
          <button
            onClick={reset}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Close file
          </button>
        )}
      </div>
    </header>
  );
}
