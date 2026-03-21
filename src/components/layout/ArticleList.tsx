import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { Star, Circle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/store';
import {
  db,
  getArticlesByFeed,
  getArticlesByFeedIds,
  getFeedsByFolder,
  bulkUpdateArticlesReadStatus,
} from '@/lib/storage/db';
import type { Article } from '@/types';
import { cn, formatRelativeTime, stripHtml, truncateText } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { updateUnreadBadge } from '@/lib/chrome/badge';
import { emitArticleUpdated, subscribeArticleUpdated } from '@/lib/events/articles';

export const ArticleList: React.FC = () => {
  const { t } = useTranslation();
  const { uiState, setUIState, feeds, updateFeedLocal, loadFeeds, settings } = useAppStore();
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(false);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [singleProcessing, setSingleProcessing] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const markingRef = useRef<Set<string>>(new Set());

  // Stable Scroller reference so Virtuoso never unmounts/remounts its scroll container
  // (an inline component object would create a new type on every render, resetting scroll to 0).
  const VirtuosoScroller = useMemo(
    () =>
      React.forwardRef<HTMLDivElement>((props, ref) => (
        <div
          {...props}
          ref={(node: HTMLDivElement | null) => {
            scrollerRef.current = node;
            if (typeof ref === 'function') ref(node);
            else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
          }}
        />
      )),
    []
  );

  const feedTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    feeds.forEach(feed => {
      map.set(feed.id, feed.title || feed.url);
    });
    return map;
  }, [feeds]);

  const feedIdentityKey = useMemo(
    () => feeds.map(feed => `${feed.id}:${feed.title || feed.url || ''}`).join('|'),
    [feeds]
  );

  const articleMap = useMemo(() => new Map(articles.map(a => [a.id, a])), [articles]);


  const selectedArticle = uiState.selectedArticleId
    ? articles.find(article => article.id === uiState.selectedArticleId)
    : undefined;

  useEffect(() => {
    loadArticles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    uiState.selectedFeedId,
    uiState.selectedFolderId,
    uiState.filterBy,
    uiState.searchQuery,
    feedIdentityKey,
  ]);

  useEffect(() => {
    const unsubscribe = subscribeArticleUpdated(({ id, updates }) => {
      setArticles(prev => {
        let affected = false;
        let next = prev.map(article => {
          if (article.id !== id) {
            return article;
          }
          affected = true;
          return { ...article, ...updates };
        });

        if (!affected) {
          if (uiState.filterBy === 'starred' && updates.isStarred) {
            loadArticles();
          }
          return prev;
        }

        if (uiState.filterBy === 'starred' && updates.isStarred === false) {
          next = next.filter(article => article.id !== id);
        }

        if (uiState.filterBy === 'unread' && updates.isRead === true) {
          if (settings?.removeScrollReadInUnreadMode) {
            next = next.filter(article => article.id !== id);
          }
        }

        return next;
      });
    });

    return () => {
      unsubscribe();
    };
  }, [uiState.filterBy, settings?.removeScrollReadInUnreadMode]);

  useEffect(() => {
    if (!settings?.markAsReadOnScroll) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const handle = () => maybeAutoRead();
    scroller.addEventListener('scroll', handle, { passive: true });
    // run once on mount/data change
    requestAnimationFrame(() => maybeAutoRead());

    return () => {
      scroller.removeEventListener('scroll', handle);
    };
  }, [settings?.markAsReadOnScroll, articles, uiState.selectedFeedId, uiState.selectedFolderId, uiState.filterBy]);

  const loadArticles = async () => {
    setLoading(true);
    try {
      const applySearchFilter = (list: Article[]) => {
        const query = uiState.searchQuery.trim().toLowerCase();
        if (!query) {
          return list;
        }

        return list.filter(article => {
          const baseTexts = [
            article.title,
            stripHtml(article.description || ''),
            stripHtml(article.content || ''),
            article.author || '',
            feedTitleMap.get(article.feedId) || '',
          ];

          return baseTexts.some(text => text.toLowerCase().includes(query));
        });
      };

      if (uiState.selectedFeedId) {
        const feedArticles = await getArticlesByFeed(uiState.selectedFeedId, {
          unreadOnly: uiState.filterBy === 'unread',
        });
        const filtered = applySearchFilter(feedArticles);
        setArticles(filtered);
        if (
          uiState.selectedArticleId &&
          !filtered.some(article => article.id === uiState.selectedArticleId)
        ) {
          setUIState({ selectedArticleId: undefined });
        }
      } else if (uiState.selectedFolderId) {
        const folderFeeds = await getFeedsByFolder(uiState.selectedFolderId);
        const feedIds = folderFeeds.map(f => f.id);
        const folderArticles = await getArticlesByFeedIds(feedIds, {
          unreadOnly: uiState.filterBy === 'unread',
          starredOnly: uiState.filterBy === 'starred',
        });
        const filtered = applySearchFilter(folderArticles);
        setArticles(filtered);
        if (
          uiState.selectedArticleId &&
          !filtered.some(article => article.id === uiState.selectedArticleId)
        ) {
          setUIState({ selectedArticleId: undefined });
        }
      } else {
        let allArticles = await db.articles.toArray();

        if (uiState.filterBy === 'unread') {
          allArticles = allArticles.filter(a => !a.isRead);
        } else if (uiState.filterBy === 'starred') {
          allArticles = allArticles.filter(a => a.isStarred);
        }

        allArticles.sort((a, b) => b.pubDate - a.pubDate);
        const filtered = applySearchFilter(allArticles);
        setArticles(filtered);
        if (
          uiState.selectedArticleId &&
          !filtered.some(article => article.id === uiState.selectedArticleId)
        ) {
          setUIState({ selectedArticleId: undefined });
        }
      }
    } catch (error) {
      console.error('Failed to load articles:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleArticleClick = async (article: Article) => {
    setUIState({ selectedArticleId: article.id });

    if (!article.isRead) {
      const timestamp = Date.now();
      await db.articles.update(article.id, { isRead: true, readAt: timestamp });

      setArticles(prev =>
        prev.map(a => (a.id === article.id ? { ...a, isRead: true, readAt: timestamp } : a))
      );

      const feed = feeds.find(f => f.id === article.feedId);
      if (feed) {
        const unreadCount = Math.max(0, feed.unreadCount - 1);
        await db.feeds.update(feed.id, { unreadCount });
        updateFeedLocal(feed.id, { unreadCount });
      }

      emitArticleUpdated(article.id, { isRead: true, readAt: timestamp }, { isRead: false });
      await updateUnreadBadge();
    }
  };

  const markArticleAsRead = async (article: Article) => {
    if (!settings?.markAsReadOnScroll || article.isRead) return;

    const timestamp = Date.now();
    try {
      await db.articles.update(article.id, { isRead: true, readAt: timestamp });

      setArticles(prev =>
        prev.map(a => (a.id === article.id ? { ...a, isRead: true, readAt: timestamp } : a))
      );

      const feed = feeds.find(f => f.id === article.feedId);
      if (feed) {
        const unreadCount = Math.max(0, feed.unreadCount - 1);
        await db.feeds.update(feed.id, { unreadCount });
        updateFeedLocal(feed.id, { unreadCount });
      }


      emitArticleUpdated(article.id, { isRead: true, readAt: timestamp }, { isRead: false }, 'scroll');
      await updateUnreadBadge();
    } catch (error) {
      console.error('Failed to auto-mark read:', error);
    }
  };

  const markArticleAsReadById = (id: string) => {
    const article = articleMap.get(id);
    if (!article || article.isRead) return;
    if (markingRef.current.has(id)) return;
    markingRef.current.add(id);
    markArticleAsRead(article).finally(() => markingRef.current.delete(id));
  };

  const maybeAutoRead = () => {
    if (!settings?.markAsReadOnScroll) return;
    const threshold = headerRef.current?.getBoundingClientRect().bottom ?? 0;
    itemRefs.current.forEach((node, id) => {
      if (!node) return;
      const top = node.getBoundingClientRect().top;
      if (top <= threshold) {
        markArticleAsReadById(id);
      }
    });
  };

  const handleBulkMark = async (isRead: boolean) => {
    if (bulkProcessing || articles.length === 0) return;

    const targets = articles.filter(article => article.isRead !== isRead);
    if (targets.length === 0) return;

    setBulkProcessing(true);
    try {
      const timestamp = isRead ? Date.now() : undefined;
      const unreadMap = await bulkUpdateArticlesReadStatus(targets, isRead);

      if (uiState.filterBy === 'unread' && isRead) {
        await loadArticles();
      } else {
        const targetIds = new Set(targets.map(article => article.id));
        setArticles(prev =>
          prev.map(article =>
            targetIds.has(article.id)
              ? {
                  ...article,
                  isRead,
                  readAt: timestamp,
                }
              : article
          )
        );
      }

      unreadMap.forEach((count, feedId) => {
        updateFeedLocal(feedId, { unreadCount: count });
      });

      await updateUnreadBadge();

      if (uiState.selectedArticleId) {
        const selectedTarget = targets.find(
          article => article.id === uiState.selectedArticleId
        );
        if (selectedTarget && selectedTarget.isRead !== isRead) {
          emitArticleUpdated(
            selectedTarget.id,
            { isRead, readAt: timestamp },
            { isRead: selectedTarget.isRead }
          );
        }
      }
    } catch (error) {
      console.error('Failed to update articles read status:', error);
      await loadFeeds();
    } finally {
      setBulkProcessing(false);
      if (uiState.filterBy === 'unread' && isRead) {
        setUIState({ selectedArticleId: undefined });
      }
    }
  };

  const handleSingleMark = async (isRead: boolean) => {
    if (!selectedArticle || singleProcessing || selectedArticle.isRead === isRead) {
      return;
    }

    const prevIsRead = selectedArticle.isRead;
    const timestamp = isRead ? Date.now() : undefined;

    setSingleProcessing(true);
    try {
      await db.articles.update(selectedArticle.id, {
        isRead,
        readAt: timestamp,
      });

      setArticles(prev =>
        prev
          .map(article =>
            article.id === selectedArticle.id
              ? { ...article, isRead, readAt: timestamp }
              : article
          )
          .filter(article => {
            if (uiState.filterBy === 'unread' && isRead) {
              return article.id !== selectedArticle.id;
            }
            return true;
          })
      );

      const feed = feeds.find(f => f.id === selectedArticle.feedId);
      if (feed && prevIsRead !== isRead) {
        const delta = isRead ? -1 : 1;
        const unreadCount = Math.max(0, feed.unreadCount + delta);
        await db.feeds.update(feed.id, { unreadCount });
        updateFeedLocal(feed.id, { unreadCount });
      }

      if (uiState.filterBy === 'unread' && isRead) {
        setUIState({ selectedArticleId: undefined });
      }

      emitArticleUpdated(
        selectedArticle.id,
        { isRead, readAt: timestamp },
        { isRead: prevIsRead }
      );
      await updateUnreadBadge();
    } catch (error) {
      console.error('Failed to update article status:', error);
    } finally {
      setSingleProcessing(false);
    }
  };

  const handleToggleStar = async (article: Article) => {
    const newStarred = !article.isStarred;
    const updates: Partial<Article> = {
      isStarred: newStarred,
      starredAt: newStarred ? Date.now() : undefined,
    };

    try {
      await db.articles.update(article.id, updates);
      setArticles(prev => {
        let next = prev.map(item =>
          item.id === article.id ? { ...item, ...updates } : item
        );

        if (!newStarred && uiState.filterBy === 'starred') {
          next = next.filter(item => item.id !== article.id);
        }

        return next;
      });

      emitArticleUpdated(article.id, updates, { isStarred: article.isStarred });

      if (
        !newStarred &&
        uiState.filterBy === 'starred' &&
        uiState.selectedArticleId === article.id
      ) {
        setUIState({ selectedArticleId: undefined });
      }
    } catch (error) {
      console.error('Failed to update star status:', error);
    }
  };

  const unreadCount = useMemo(() => articles.filter(a => !a.isRead).length, [articles]);
  const hasUnread = unreadCount > 0;
  const hasRead = articles.some(article => article.isRead);
  const showBulkActions = !selectedArticle;

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        {t('common.loading')}
      </div>
    );
  }

  if (articles.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        {t('articleList.noArticles')}
      </div>
    );
  }

  return (
    <div className="h-full">
      <div
        ref={headerRef}
        className="p-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between gap-2"
      >
        <h2 className="font-semibold text-sm text-gray-900 dark:text-gray-100">
          {t('articleList.articlesHeader', { count: unreadCount })}
        </h2>

        {showBulkActions ? (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="px-2 text-xs"
              disabled={bulkProcessing || !hasUnread}
              onClick={() => handleBulkMark(true)}
            >
              {t('articleList.markAllRead')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="px-2 text-xs"
              disabled={bulkProcessing || !hasRead}
              onClick={() => handleBulkMark(false)}
            >
              {t('articleList.markAllUnread')}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="px-2 text-xs"
              disabled={singleProcessing || !selectedArticle || selectedArticle.isRead}
              onClick={() => handleSingleMark(true)}
            >
              {t('articleList.markRead')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="px-2 text-xs"
              disabled={singleProcessing || !selectedArticle || !selectedArticle.isRead}
              onClick={() => handleSingleMark(false)}
            >
              {t('articleList.markUnread')}
            </Button>
          </div>
        )}
      </div>

      <Virtuoso
        style={{ height: 'calc(100% - 57px)' }}
        data={articles}
        components={{ Scroller: VirtuosoScroller }}
        itemContent={(_index, article) => (
          <ArticleItem
            key={article.id}
            article={article}
            isSelected={uiState.selectedArticleId === article.id}
            onClick={() => handleArticleClick(article)}
            onToggleStar={() => handleToggleStar(article)}
            onAutoRead={() => markArticleAsRead(article)}
            registerRef={node => {
              if (node) itemRefs.current.set(article.id, node);
              else itemRefs.current.delete(article.id);
            }}
            enableAutoRead={!!settings?.markAsReadOnScroll}
            getThreshold={() => headerRef.current?.getBoundingClientRect().bottom ?? 0}
          />
        )}
      />
    </div>
  );
};

interface ArticleItemProps {
  article: Article;
  isSelected: boolean;
  onClick: () => void;
  onToggleStar: () => void;
  onAutoRead: () => void;
  registerRef: (node: HTMLDivElement | null) => void;
  enableAutoRead: boolean;
  getThreshold: () => number;
}

const ArticleItem: React.FC<ArticleItemProps> = ({
  article,
  isSelected,
  onClick,
  onToggleStar,
  onAutoRead,
  enableAutoRead,
  registerRef,
  getThreshold,
}) => {
  const itemRef = useRef<HTMLDivElement | null>(null);
  const hasMarkedRef = useRef(false);

  useEffect(() => {
    if (!enableAutoRead) return;
    const node = itemRef.current;
    if (!node) return;

    hasMarkedRef.current = article.isRead;

    const check = () => {
      if (hasMarkedRef.current || article.isRead) return;
      const top = node.getBoundingClientRect().top;
      if (top <= getThreshold()) {
        hasMarkedRef.current = true;
        onAutoRead();
      }
    };

    const observer = new IntersectionObserver(() => check(), {
      root: null,
      threshold: 0,
    });
    observer.observe(node);
    check();

    return () => observer.disconnect();
  }, [article.isRead, enableAutoRead, onAutoRead, getThreshold]);

  const handleStarClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleStar();
  };

  const description = article.description || article.content || '';
  const plainText = stripHtml(description);
  const excerpt = truncateText(plainText, 120);

  return (
    <div
      ref={node => {
        itemRef.current = node;
        registerRef(node);
      }}
      onClick={onClick}
      className={cn(
        'p-3 border-b border-gray-200 dark:border-gray-800 cursor-pointer transition-colors',
        'hover:bg-gray-50 dark:hover:bg-gray-800',
        isSelected && 'bg-primary-50 dark:bg-primary-900/20',
        !article.isRead && 'font-semibold'
      )}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {!article.isRead && (
              <Circle className="w-2 h-2 fill-primary-600 text-primary-600 flex-shrink-0" />
            )}
            <h3 className="text-sm text-gray-900 dark:text-gray-100 truncate">
              {article.title}
            </h3>
          </div>

          <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mb-2">
            {excerpt}
          </p>

          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>{formatRelativeTime(article.pubDate)}</span>
            {article.author && (
              <>
                <span>•</span>
                <span className="truncate">{article.author}</span>
              </>
            )}
          </div>
        </div>

        <button
          onClick={handleStarClick}
          className="flex-shrink-0 p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
        >
          <Star
            className={cn(
              'w-4 h-4',
              article.isStarred
                ? 'fill-yellow-500 text-yellow-500'
                : 'text-gray-400'
            )}
          />
        </button>
      </div>
    </div>
  );
};
