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
  db,
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

const LAYOUT_STORAGE_KEY = 'rss-layout-widths';

function loadLayoutWidths(): { sidebarWidth: number; articleListWidth: number } {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return { sidebarWidth: 280, articleListWidth: 400 };
}

function saveLayoutWidths(sidebarWidth: number, articleListWidth: number) {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify({ sidebarWidth, articleListWidth }));
  } catch {
    // ignore
  }
}

async function getFeedsWithUnreadCounts(feeds: Feed[]): Promise<Feed[]> {
  const allArticles = await db.articles.toArray();
  const unreadMap = new Map<string, number>();

  for (const article of allArticles) {
    if (!article.isRead) {
      unreadMap.set(article.feedId, (unreadMap.get(article.feedId) ?? 0) + 1);
    }
  }

  return feeds.map(feed => ({
    ...feed,
    unreadCount: unreadMap.get(feed.id) ?? 0,
  }));
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
    filterBy: 'unread',
    searchQuery: '',
    specialView: undefined,
    ...loadLayoutWidths(),
  },

  isLoadingFeeds: false,
  isLoadingArticles: false,

  // Actions
  loadFeeds: async () => {
    set({ isLoadingFeeds: true });
    try {
      const feeds = await getAllFeeds();
      const sorted = (await getFeedsWithUnreadCounts(feeds))
        .sort((a, b) => {
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
      set((state) => ({
        settings,
        uiState: {
          ...state.uiState,
          filterBy: settings.defaultArticleFilter ?? 'all',
        },
      }));
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  },

  setUIState: (updates) => {
    set((state) => {
      const next = { ...state.uiState, ...updates };
      if (updates.sidebarWidth !== undefined || updates.articleListWidth !== undefined) {
        saveLayoutWidths(next.sidebarWidth, next.articleListWidth);
      }
      return { uiState: next };
    });
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
    getFeedsWithUnreadCounts(feeds)
      .then((hydratedFeeds) => {
        const sorted = [...hydratedFeeds].sort((a, b) => {
          const aOrder = a.sortOrder ?? a.createdAt;
          const bOrder = b.sortOrder ?? b.createdAt;
          return aOrder - bOrder;
        });
        set({ feeds: sorted });
      })
      .catch((error) => {
        console.error('Failed to replace feeds:', error);
        const sorted = [...feeds].sort((a, b) => {
          const aOrder = a.sortOrder ?? a.createdAt;
          const bOrder = b.sortOrder ?? b.createdAt;
          return aOrder - bOrder;
        });
        set({ feeds: sorted });
      });
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
  },

  moveFeedToFolder: async (feedId, folderId) => {
    await moveFeedToFolderDb(feedId, folderId);
    const feeds = await getAllFeeds();
    const sorted = (await getFeedsWithUnreadCounts(feeds)).sort((a, b) => {
      const aOrder = a.sortOrder ?? a.createdAt;
      const bOrder = b.sortOrder ?? b.createdAt;
      return aOrder - bOrder;
    });
    set({ feeds: sorted });
  },
}));
