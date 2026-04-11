import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Rss, Settings, ExternalLink, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { db, getRecentUnreadArticles, recalcFeedUnreadCount, getSettings } from '@/lib/storage/db';
import type { Article } from '@/types';
import { formatRelativeTime } from '@/lib/utils';
import { updateUnreadBadge } from '@/lib/chrome/badge';
import '@/index.css';

const Popup: React.FC = () => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [recentUnread, setRecentUnread] = useState<Article[]>([]);
  const [feedTitles, setFeedTitles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async (showSpinner = false) => {
    if (showSpinner) {
      setLoading(true);
    }

    // 并行加载数据，减少等待时间
    const [feeds, articles] = await Promise.all([
      db.feeds.toArray(),
      getRecentUnreadArticles(10),
    ]);

    const map: Record<string, string> = {};
    feeds.forEach(feed => {
      map[feed.id] = feed.title || feed.url;
    });

    setFeedTitles(map);
    setUnreadCount(feeds.reduce((sum, feed) => sum + (feed.unreadCount || 0), 0));
    setRecentUnread(articles);
    setLoading(false);
  };

  useEffect(() => {
    loadData(true).catch(error => console.error('Failed to load popup data:', error));
    // Apply theme
    getSettings().then(s => {
      const isDark = s.theme === 'dark' ||
        (s.theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', isDark);
    });
  }, []);

  const handleOpenMain = () => {
    chrome.tabs.create({ url: 'index.html' });
  };

  const handleOpenOptions = () => {
    chrome.runtime.openOptionsPage();
  };

  const handleRefreshAll = () => {
    setRefreshing(true);
    chrome.runtime.sendMessage({ type: 'UPDATE_ALL_FEEDS' }, async () => {
      setRefreshing(false);
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError.message);
      }
      await loadData();
      await updateUnreadBadge();
    });
  };

  const handleOpenArticle = async (article: Article) => {
    if (article.link) {
      chrome.tabs.create({ url: article.link });
    } else {
      handleOpenMain();
    }

    const timestamp = Date.now();
    await db.articles.update(article.id, {
      isRead: true,
      readAt: timestamp,
    });

    await recalcFeedUnreadCount(article.feedId);

    setRecentUnread(prev => prev.filter(item => item.id !== article.id));
    setUnreadCount(prev => Math.max(0, prev - 1));
    await updateUnreadBadge();
    await loadData();
  };

  return (
    <div className="flex h-full w-full flex-col gap-4 bg-white p-4 dark:bg-gray-900">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-600">
            <Rss className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">RSS 阅读器</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">轻松管理您的订阅</p>
          </div>
        </div>

        <span className="inline-flex items-center rounded-full bg-primary-100 px-3 py-1 text-xs font-semibold text-primary-700 dark:bg-primary-900/40 dark:text-primary-200">
          未读 {unreadCount}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 justify-center gap-2"
          onClick={handleOpenMain}
        >
          <ExternalLink className="h-4 w-4" />
          主页
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="flex-1 justify-center gap-2"
          onClick={handleRefreshAll}
          disabled={refreshing}
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          刷新
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="flex-1 justify-center gap-2"
          onClick={handleOpenOptions}
        >
          <Settings className="h-4 w-4" />
          设置
        </Button>
      </div>

      <div className="flex-1 overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-950">
        <div className="border-b border-gray-200 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:border-gray-700 dark:text-gray-400">
          最近未读
        </div>
        <div className="flex-1 overflow-y-auto p-2 min-h-0">
          {loading ? (
            <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
              正在加载...
            </p>
          ) : recentUnread.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
              没有新的未读内容
            </p>
          ) : (
            <div className="space-y-2">
              {recentUnread.map(article => (
                <button
                  key={article.id}
                  className="w-full rounded-lg border border-transparent px-3 py-2 text-left transition hover:border-primary-200 hover:bg-primary-50/60 dark:hover:border-primary-700 dark:hover:bg-primary-900/20"
                  onClick={() => handleOpenArticle(article)}
                >
                  <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                    <span className="truncate font-semibold text-gray-700 dark:text-gray-300">
                      {feedTitles[article.feedId] || '订阅源'}
                    </span>
                    <span>{formatRelativeTime(article.pubDate)}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                    {article.title || '未命名文章'}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>
);
