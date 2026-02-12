import { create } from 'zustand';
import type { Feed, Article, Folder, Settings, UIState } from '@/types';
import {
  getAllFeeds,
  getRootFolders,
  getSettings,
  updateSettings as updateSettingsDb,
  addFolder as addFolderDb,
  updateFolder as updateFolderDb,
  deleteFolder as deleteFolderDb,
  moveFeedToFolder as moveFeedToFolderDb,
  recalcAllFeedUnreadCounts,
} from '@/lib/storage/db';

interface AppStore {
  // Data
  feeds: Feed[];
  folders: Folder[];
  articles: Article[];
  settings: Settings | null;

  // UI State
  uiState: UIState;

  // Loading states
  isLoadingFeeds: boolean;
  isLoadingArticles: boolean;

  // Actions
  loadFeeds: () => Promise<void>;
  loadFolders: () => Promise<void>;
  loadSettings: () => Promise<void>;
  setUIState: (updates: Partial<UIState>) => void;
  updateSettings: (updates: Partial<Settings>) => Promise<void>;
  updateFeedLocal: (feedId: string, updates: Partial<Feed>) => void;
  replaceFeeds: (feeds: Feed[]) => void;
  replaceFolders: (folders: Folder[]) => void;
  addFolder: (folder: Omit<Folder, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateFolder: (id: string, updates: Partial<Folder>) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  moveFeedToFolder: (feedId: string, folderId?: string) => Promise<void>;
}

export const useAppStore = create<AppStore>((set) => ({
  // Initial state
  feeds: [],
  folders: [],
  articles: [],
  settings: null,

  uiState: {
    selectedFeedId: undefined,
    selectedFolderId: undefined,
    selectedArticleId: undefined,
    viewMode: 'list',
    sortBy: 'date-desc',
    filterBy: 'all',
    searchQuery: '',
    sidebarWidth: 280,
    articleListWidth: 400,
  },

  isLoadingFeeds: false,
  isLoadingArticles: false,

  // Actions
  loadFeeds: async () => {
    set({ isLoadingFeeds: true });
    try {
      const feeds = await getAllFeeds();
      const sorted = [...feeds].sort((a, b) => {
        const aOrder = a.sortOrder ?? a.createdAt;
        const bOrder = b.sortOrder ?? b.createdAt;
        return aOrder - bOrder;
      });
      set({ feeds: sorted });
    } catch (error) {
      console.error('Failed to load feeds:', error);
    } finally {
      set({ isLoadingFeeds: false });
    }
  },

  loadFolders: async () => {
    try {
      const folders = await getRootFolders();
      set({ folders });
    } catch (error) {
      console.error('Failed to load folders:', error);
    }
  },

  loadSettings: async () => {
    try {
      const settings = await getSettings();
      set({ settings });
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  },

  setUIState: (updates) => {
    set((state) => ({
      uiState: { ...state.uiState, ...updates },
    }));
  },

  updateSettings: async (updates) => {
    try {
      await updateSettingsDb(updates);
      const settings = await getSettings();
      set({ settings });
    } catch (error) {
      console.error('Failed to update settings:', error);
    }
  },

  updateFeedLocal: (feedId, updates) => {
    set((state) => ({
      feeds: state.feeds.map((feed) =>
        feed.id === feedId
          ? { ...feed, ...updates, unreadCount: updates.unreadCount ?? feed.unreadCount }
          : feed
      ),
    }));
  },

  replaceFeeds: (feeds) => {
    const sorted = [...feeds].sort((a, b) => {
      const aOrder = a.sortOrder ?? a.createdAt;
      const bOrder = b.sortOrder ?? b.createdAt;
      return aOrder - bOrder;
    });
    set({ feeds: sorted });
  },

  replaceFolders: (folders) => {
    set({ folders });
  },

  addFolder: async (folder) => {
    const id = await addFolderDb(folder);
    const folders = await getRootFolders();
    set({ folders });
    return id;
  },

  updateFolder: async (id, updates) => {
    await updateFolderDb(id, updates);
    const folders = await getRootFolders();
    set({ folders });
  },

  deleteFolder: async (id) => {
    await deleteFolderDb(id);
    const folders = await getRootFolders();
    set({ folders });
    await recalcAllFeedUnreadCounts();
  },

  moveFeedToFolder: async (feedId, folderId) => {
    await moveFeedToFolderDb(feedId, folderId);
    const feeds = await getAllFeeds();
    const sorted = [...feeds].sort((a, b) => {
      const aOrder = a.sortOrder ?? a.createdAt;
      const bOrder = b.sortOrder ?? b.createdAt;
      return aOrder - bOrder;
    });
    set({ feeds: sorted });
  },
}));
