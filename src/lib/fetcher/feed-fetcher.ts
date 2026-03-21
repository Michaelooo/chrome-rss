import type { Feed, RSSFeed, RSSItem, Article } from '@/types';
import { rssParser } from '../parser/rss-parser';
import { db, addArticles, updateFeed } from '../storage/db';

export interface FetchResult {
  success: boolean;
  feed?: RSSFeed;
  newArticlesCount?: number;
  error?: string;
}

export function getArticleGuidFromItem(item: RSSItem): string {
  const guid = item.guid?.trim();
  if (guid) return guid;

  const link = item.link?.trim();
  if (link) return link;

  if (item.title && item.pubDate) {
    return `${item.title.trim()}::${item.pubDate}`;
  }

  if (item.title) {
    return `${item.title.trim()}::${item.description?.slice(0, 50) || ''}`;
  }

  return crypto.randomUUID();
}

export function rssItemToArticle(
  item: RSSItem,
  feedId: string,
  guidOverride?: string
): Omit<Article, 'id' | 'createdAt'> {
  const pubDate = item.pubDate ? new Date(item.pubDate).getTime() : Date.now();

  return {
    feedId,
    title: item.title,
    link: item.link,
    description: item.description,
    content: item.content,
    author: item.author,
    pubDate: isNaN(pubDate) ? Date.now() : pubDate,
    guid: guidOverride || getArticleGuidFromItem(item),
    isRead: false,
    isStarred: false,
  };
}

export class FeedFetcher {
  async fetchFeed(feedUrl: string): Promise<RSSFeed> {
    try {
      const response = await fetch(feedUrl, {
        headers: {
          'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const buffer = await response.arrayBuffer();
      const encoding =
        getCharsetFromContentType(response.headers.get('content-type')) ||
        detectXmlEncoding(buffer) ||
        'utf-8';

      let xmlText: string;
      try {
        xmlText = new TextDecoder(encoding).decode(buffer);
      } catch (err) {
        console.warn(`Decode with ${encoding} failed, fallback to utf-8`, err);
        xmlText = new TextDecoder('utf-8').decode(buffer);
      }

      return await rssParser.parse(xmlText);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch feed: ${error.message}`);
      }
      throw new Error('Failed to fetch feed: Unknown error');
    }
  }

  async updateFeedArticles(feed: Feed): Promise<FetchResult> {
    try {
      const rssFeed = await this.fetchFeed(feed.url);

      // Get existing article GUIDs for this feed
      const existingArticles = await db.articles
        .where('feedId')
        .equals(feed.id)
        .toArray();

      const existingGuids = new Set<string>();
      for (const article of existingArticles) {
        let guid = article.guid?.trim() || article.link?.trim();
        if (!guid) {
          guid = crypto.randomUUID();
          await db.articles.update(article.id, { guid });
        }
        existingGuids.add(guid);
      }

      const normalizedItems = rssFeed.items.map(item => ({
        item,
        guid: getArticleGuidFromItem(item),
      }));

      // Filter out articles we already have
      const newItems = normalizedItems.filter(({ guid }) => !existingGuids.has(guid));

      if (newItems.length > 0) {
        // Convert RSS items to Article objects
        const newArticles = newItems.map(({ item, guid }) =>
          rssItemToArticle(item, feed.id, guid)
        );
        await addArticles(newArticles);

        // Update feed metadata
        await updateFeed(feed.id, {
          title: rssFeed.title || feed.title,
          description: rssFeed.description || feed.description,
          link: rssFeed.link || feed.link,
          lastFetchTime: Date.now(),
          lastFetchStatus: 'success',
          lastFetchError: undefined,
          unreadCount: feed.unreadCount + newItems.length,
        });
      } else {
        // No new articles, just update fetch time
        await updateFeed(feed.id, {
          lastFetchTime: Date.now(),
          lastFetchStatus: 'success',
          lastFetchError: undefined,
        });
      }

      return {
        success: true,
        feed: rssFeed,
        newArticlesCount: newItems.length,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await updateFeed(feed.id, {
        lastFetchTime: Date.now(),
        lastFetchStatus: 'error',
        lastFetchError: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  async getFeedFavicon(feedUrl: string): Promise<string | undefined> {
    try {
      const url = new URL(feedUrl);
      const faviconUrl = `${url.protocol}//${url.host}/favicon.ico`;

      // Check if favicon exists
      const response = await fetch(faviconUrl, { method: 'HEAD' });
      if (response.ok) {
        return faviconUrl;
      }
    } catch (error) {
      console.error('Failed to fetch favicon:', error);
    }
    return undefined;
  }
}

function getCharsetFromContentType(contentType: string | null): string | undefined {
  if (!contentType) return undefined;
  const match = /charset=([^;]+)/i.exec(contentType);
  if (!match) return undefined;
  return normalizeEncoding(match[1]);
}

function detectXmlEncoding(buffer: ArrayBuffer): string | undefined {
  // Decode a small slice as utf-8 to read the prolog; ascii survives even if actual charset differs.
  const sniffLength = Math.min(buffer.byteLength, 1024);
  const slice = buffer.slice(0, sniffLength);
  const text = new TextDecoder('utf-8', { fatal: false }).decode(slice);
  const match = /encoding=["']([^"']+)["']/i.exec(text);
  if (!match) return undefined;
  return normalizeEncoding(match[1]);
}

function normalizeEncoding(enc: string): string {
  const lower = enc.trim().toLowerCase();
  if (lower === 'gbk' || lower === 'gb2312') return 'gb18030';
  return lower || 'utf-8';
}

export const feedFetcher = new FeedFetcher();
