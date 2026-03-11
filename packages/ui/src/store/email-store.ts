import { create } from 'zustand';
import type { PstFolder, EmailSummary, EmailDetail } from '@email-app/shared';

interface EmailState {
  sessionId: string | null;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;

  folders: PstFolder[];
  selectedFolderId: string | null;

  messages: EmailSummary[];
  messageTotalCount: number;

  selectedMessageId: string | null;
  selectedMessage: EmailDetail | null;

  searchQuery: string;
  searchResults: EmailSummary[] | null;
  isSearching: boolean;

  isSidebarOpen: boolean;
  showMessageList: boolean;

  setSession: (sessionId: string, folders: PstFolder[]) => void;
  setSelectedFolder: (folderId: string) => void;
  setMessages: (messages: EmailSummary[], total: number) => void;
  appendMessages: (messages: EmailSummary[]) => void;
  setSelectedMessage: (message: EmailDetail | null) => void;
  setSearchQuery: (query: string) => void;
  setSearchResults: (results: EmailSummary[] | null) => void;
  setLoading: (loading: boolean) => void;
  setLoadingMore: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setIsSearching: (searching: boolean) => void;
  toggleSidebar: () => void;
  setShowMessageList: (show: boolean) => void;
  reset: () => void;
}

const initialState = {
  sessionId: null,
  isLoading: false,
  isLoadingMore: false,
  error: null,
  folders: [],
  selectedFolderId: null,
  messages: [],
  messageTotalCount: 0,
  selectedMessageId: null,
  selectedMessage: null,
  searchQuery: '',
  searchResults: null,
  isSearching: false,
  isSidebarOpen: true,
  showMessageList: true,
};

export const useEmailStore = create<EmailState>((set) => ({
  ...initialState,

  setSession: (sessionId, folders) =>
    set({ sessionId, folders, error: null }),

  setSelectedFolder: (folderId) =>
    set({
      selectedFolderId: folderId,
      selectedMessageId: null,
      selectedMessage: null,
      messages: [],
      messageTotalCount: 0,
      searchResults: null,
      searchQuery: '',
      showMessageList: true,
    }),

  setMessages: (messages, total) =>
    set({ messages, messageTotalCount: total }),

  appendMessages: (newMessages) =>
    set((state) => ({
      messages: [...state.messages, ...newMessages],
    })),

  setSelectedMessage: (message) =>
    set({
      selectedMessageId: message?.id ?? null,
      selectedMessage: message,
    }),

  setSearchQuery: (query) => set({ searchQuery: query }),
  setSearchResults: (results) => set({ searchResults: results }),
  setLoading: (loading) => set({ isLoading: loading }),
  setLoadingMore: (loading) => set({ isLoadingMore: loading }),
  setError: (error) => set(error ? { error, isLoading: false } : { error }),
  setIsSearching: (searching) => set({ isSearching: searching }),
  toggleSidebar: () => set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),
  setShowMessageList: (show) => set({ showMessageList: show }),
  reset: () => set(initialState),
}));
