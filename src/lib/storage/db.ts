import Dexie, { Table } from 'dexie';
import type { Feed, Article, Folder, FeedFilter, Settings } from '@/types';

export class RSSDatabase extends Dexie {
  feeds!: Table<Feed, string>;
  articles!: Table<Article, string>;
  folders!: Table<Folder, string>;
  filters!: Table<FeedFilter, string>;
  settings!: Table<Settings, number>;

  constructor() {
    super('RSSReaderDB');

    this.version(1).stores({
      feeds: 'id, url, folderId, lastFetchTime, unreadCount',
      articles: 'id, feedId, pubDate, isRead, isStarred, [feedId+isRead], [feedId+pubDate]',
      folders: 'id, parentId, order',
      filters: 'id, feedId, enabled',
      settings: '++id',
    });

    this.version(2).stores({
      articles: 'id, feedId, pubDate, isRead, isStarred, [feedId+isRead], [feedId+pubDate], [isStarred+starredAt]',
    });

    this.version(3)
      .stores({
        feeds: 'id, url, folderId, lastFetchTime, unreadCount',
        articles: 'id, feedId, pubDate, isRead, isStarred, [feedId+isRead], [feedId+pubDate], [isStarred+starredAt]',
        folders: 'id, parentId, order',
        filters: 'id, feedId, enabled',
        settings: '++id',
      })
      .upgrade(async transaction => {
        const settings = await transaction.table('settings').toArray();
        for (const setting of settings) {
          await transaction
            .table('settings')
            .update(setting.id, mergeSettingsWithDefaults(setting as Settings));
        }
      });

    this.version(4)
      .stores({})
      .upgrade(async transaction => {
        const settings = await transaction.table('settings').toArray();
        for (const setting of settings) {
          await transaction
            .table('settings')
            .update(setting.id, mergeSettingsWithDefaults(setting as Settings));
        }
      });

    this.version(5)
      .stores({})
      .upgrade(async transaction => {
        const settings = await transaction.table('settings').toArray();
        for (const setting of settings) {
          await transaction
            .table('settings')
            .update(setting.id, mergeSettingsWithDefaults(setting as Settings));
        }
      });

    this.version(6)
      .stores({})
      .upgrade(async transaction => {
        const settings = await transaction.table('settings').toArray();
        for (const setting of settings) {
          await transaction
            .table('settings')
            .update(setting.id, mergeSettingsWithDefaults(setting as Settings));
        }
      });
  }
}

export const db = new RSSDatabase();

const defaultSettings = {
  language: 'zh' as const,
  theme: 'auto' as const,
  defaultUpdateInterval: 30,
  enableNotifications: true,
  maxArticlesPerFeed: 500,
  articleRetentionDays: 30,
  openLinksInNewTab: true,
  markAsReadOnScroll: true,
  removeScrollReadInUnreadMode: false,
  fontSize: 'medium' as const,
  fontFamily: 'system-ui',
  contentWidth: 'standard' as const,
  compactView: false,
  showFeedIcons: true,
  enableKeyboardShortcuts: true,
  defaultArticleFilter: 'unread' as const,
  enableTranslation: false,
  translationProvider: 'google' as const,
  translationTargetLanguage: 'zh-CN',
  translationSourceLanguage: '',
  translationAutoFetch: false,
};

function mergeSettingsWithDefaults(partial: Partial<Settings>): Settings {
  return {
    ...defaultSettings,
    ...partial,
  };
}

// Initialize default settings
export async function initializeSettings(): Promise<void> {
  const count = await db.settings.count();
  if (count === 0) {
    await db.settings.add({ ...defaultSettings });
  }
}

// Feed operations
export async function addFeed(feed: Omit<Feed, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const now = Date.now();
  const id = crypto.randomUUID();
  await db.feeds.add({
    ...feed,
    sortOrder: feed.sortOrder ?? now,
    id,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export async function updateFeed(id: string, updates: Partial<Feed>): Promise<void> {
  await db.feeds.update(id, {
    ...updates,
    updatedAt: Date.now(),
  });
}

export async function updateFeedSortOrders(
  orders: { id: string; sortOrder: number }[]
): Promise<void> {
  await db.transaction('rw', db.feeds, async () => {
    for (const { id, sortOrder } of orders) {
      await db.feeds.update(id, {
        sortOrder,
        updatedAt: Date.now(),
      });
    }
  });
}

export async function deleteFeed(id: string): Promise<void> {
  await db.feeds.delete(id);
  await db.articles.where('feedId').equals(id).delete();
}

export async function getFeed(id: string): Promise<Feed | undefined> {
  return await db.feeds.get(id);
}

export async function getFeedByUrl(url: string): Promise<Feed | undefined> {
  return await db.feeds.where('url').equals(url).first();
}

export async function getAllFeeds(): Promise<Feed[]> {
  return await db.feeds.toArray();
}

export async function getFeedsByFolder(folderId?: string): Promise<Feed[]> {
  if (folderId === undefined) {
    return await db.feeds.where('folderId').equals(undefined as any).toArray();
  }
  return await db.feeds.where('folderId').equals(folderId).toArray();
}

// Article operations
export async function addArticle(article: Omit<Article, 'id' | 'createdAt'>): Promise<string> {
  const id = crypto.randomUUID();
  await db.articles.add({
    ...article,
    id,
    createdAt: Date.now(),
  });
  return id;
}

export async function addArticles(articles: Omit<Article, 'id' | 'createdAt'>[]): Promise<void> {
  const now = Date.now();
  await db.articles.bulkAdd(
    articles.map(article => ({
      ...article,
      id: crypto.randomUUID(),
      createdAt: now,
    }))
  );
}

export async function updateArticle(id: string, updates: Partial<Article>): Promise<void> {
  await db.articles.update(id, updates);
}

export async function markArticleAsRead(id: string, isRead: boolean = true): Promise<void> {
  await db.articles.update(id, {
    isRead,
    readAt: isRead ? Date.now() : undefined,
  });
}

export async function toggleArticleStar(id: string): Promise<void> {
  const article = await db.articles.get(id);
  if (article) {
    await db.articles.update(id, {
      isStarred: !article.isStarred,
      starredAt: !article.isStarred ? Date.now() : undefined,
    });
  }
}

export async function recalcFeedUnreadCount(feedId: string): Promise<number> {
  const unreadCount = await db.articles
    .where('feedId')
    .equals(feedId)
    .and(article => article.isRead === false)
    .count();

  await db.feeds.update(feedId, { unreadCount });
  return unreadCount;
}

export async function recalcAllFeedUnreadCounts(): Promise<void> {
  const feeds = await db.feeds.toArray();
  await Promise.all(feeds.map(feed => recalcFeedUnreadCount(feed.id)));
}

export async function bulkUpdateArticlesReadStatus(
  articles: Article[],
  isRead: boolean
): Promise<Map<string, number>> {
  const affectedFeedIds = new Set<string>();
  const timestamp = isRead ? Date.now() : undefined;

  await db.transaction('rw', db.articles, async () => {
    for (const article of articles) {
      if (article.isRead === isRead) continue;
      await db.articles.update(article.id, {
        isRead,
        readAt: timestamp,
      });
      affectedFeedIds.add(article.feedId);
    }
  });

  const unreadMap = new Map<string, number>();

  for (const feedId of affectedFeedIds) {
    const unread = await recalcFeedUnreadCount(feedId);
    unreadMap.set(feedId, unread);
  }

  return unreadMap;
}

export async function getArticlesByFeed(
  feedId: string,
  options?: { limit?: number; offset?: number; unreadOnly?: boolean }
): Promise<Article[]> {
  let collection;

  if (options?.unreadOnly) {
    collection = db.articles
      .where('feedId').equals(feedId)
      .and(article => article.isRead === false);
  } else {
    collection = db.articles.where('feedId').equals(feedId);
  }

  const articles = await collection.reverse().sortBy('pubDate');

  if (options?.limit) {
    const start = options.offset || 0;
    return articles.slice(start, start + options.limit);
  }

  return articles;
}

/** Returns articles from multiple feeds, merged and sorted by pubDate desc (or starredAt when starredOnly). */
export async function getArticlesByFeedIds(
  feedIds: string[],
  options?: { unreadOnly?: boolean; starredOnly?: boolean }
): Promise<Article[]> {
  if (feedIds.length === 0) return [];

  let collection = db.articles.where('feedId').anyOf(feedIds);
  if (options?.unreadOnly) {
    collection = collection.and(article => article.isRead === false);
  }
  if (options?.starredOnly) {
    collection = collection.and(article => article.isStarred === true);
    const articles = await collection.reverse().sortBy('starredAt');
    return articles;
  }
  return collection.reverse().sortBy('pubDate');
}

export async function getStarredArticles(): Promise<Article[]> {
  return await db.articles
    .filter(article => article.isStarred === true)
    .reverse()
    .sortBy('starredAt');
}

export async function searchArticles(query: string): Promise<Article[]> {
  const lowerQuery = query.toLowerCase();
  return await db.articles
    .filter(article => {
      const title = article.title.toLowerCase();
      const desc = article.description?.toLowerCase() || '';
      const cont = article.content?.toLowerCase() || '';
      return title.includes(lowerQuery) || desc.includes(lowerQuery) || cont.includes(lowerQuery);
    })
    .reverse()
    .sortBy('pubDate');
}

export async function getRecentUnreadArticles(limit: number): Promise<Article[]> {
  // 优化方案：先获取最近的文章（限制数量避免处理过多数据），再过滤未读
  // 假设未读文章占比不高，获取 limit*5 的数据应该足够
  const recentArticles = await db.articles
    .orderBy('pubDate')
    .reverse()
    .limit(limit * 5)
    .toArray();

  return recentArticles
    .filter(article => article.isRead === false)
    .slice(0, limit);
}

export async function deleteOldArticles(retentionDays: number): Promise<number> {
  const cutoffDate = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  return await db.articles
    .where('pubDate')
    .below(cutoffDate)
    .and(article => !article.isStarred)
    .delete();
}

// Folder operations
export async function addFolder(folder: Omit<Folder, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const now = Date.now();
  const id = crypto.randomUUID();
  const maxOrder = await db.folders
    .filter(f => f.parentId == null || f.parentId === undefined)
    .count();
  await db.folders.add({
    ...folder,
    parentId: undefined,
    order: folder.order ?? maxOrder,
    isExpanded: folder.isExpanded ?? true,
    id,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export async function updateFolder(id: string, updates: Partial<Folder>): Promise<void> {
  await db.folders.update(id, {
    ...updates,
    updatedAt: Date.now(),
  });
}

export async function deleteFolder(id: string): Promise<void> {
  await db.folders.delete(id);
  // Move feeds in this folder to root
  await db.feeds.where('folderId').equals(id).modify({ folderId: undefined });
}

export async function getAllFolders(): Promise<Folder[]> {
  return await db.folders.orderBy('order').toArray();
}

/** Returns only root folders (parentId undefined), ordered by order. */
export async function getRootFolders(): Promise<Folder[]> {
  const all = await db.folders.toArray();
  return all
    .filter(f => f.parentId == null || f.parentId === undefined)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/** Moves a feed to a folder (or root when folderId is undefined), recalculates sortOrder. */
export async function moveFeedToFolder(
  feedId: string,
  folderId?: string
): Promise<void> {
  const feed = await db.feeds.get(feedId);
  if (!feed) return;

  await db.feeds.update(feedId, {
    folderId: folderId ?? undefined,
    updatedAt: Date.now(),
  });

  const feedsInTarget = await getFeedsByFolder(folderId);
  const sorted = [...feedsInTarget].sort(
    (a, b) => (a.sortOrder ?? a.createdAt) - (b.sortOrder ?? b.createdAt)
  );

  const updates = sorted.map((f, i) => ({
    id: f.id,
    sortOrder: i + 1,
  }));
  await updateFeedSortOrders(updates);
}

/** Reorders root folders by the given id array. */
export async function reorderFolders(orderedIds: string[]): Promise<void> {
  await db.transaction('rw', db.folders, async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.folders.update(orderedIds[i], {
        order: i,
        updatedAt: Date.now(),
      });
    }
  });
}

// Settings operations
export async function getSettings(): Promise<Settings> {
  const settings = await db.settings.toArray();
  if (settings.length === 0) {
    await initializeSettings();
    return (await db.settings.toArray())[0];
  }
  return mergeSettingsWithDefaults(settings[0]);
}

export async function updateSettings(updates: Partial<Settings>): Promise<void> {
  const settings = await db.settings.toArray();
  if (settings.length > 0) {
    await db.settings.update(1, updates);
  }
}
