import { useState, useEffect, useRef } from 'react';
import { useEmailStore } from '../store/email-store';
import { useDataProvider } from '../providers/DataProviderContext';

export function SearchBar() {
  const [localQuery, setLocalQuery] = useState('');
  const { sessionId, setSearchQuery, setSearchResults, setIsSearching } =
    useEmailStore();
  const provider = useDataProvider();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!localQuery.trim()) {
      setSearchResults(null);
      setSearchQuery('');
      return;
    }

    debounceRef.current = setTimeout(async () => {
      if (!sessionId) return;
      setIsSearching(true);
      setSearchQuery(localQuery);
      try {
        const results = await provider.search(sessionId, localQuery);
        setSearchResults(results);
      } catch {
        setSearchResults(null);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [localQuery, sessionId, provider, setSearchQuery, setSearchResults, setIsSearching]);

  return (
    <input
      type="text"
      placeholder="Search emails..."
      value={localQuery}
      onChange={(e) => setLocalQuery(e.target.value)}
      className="w-48 rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 md:w-64"
    />
  );
}
