import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Rss, Star, Trash2, Folder, ChevronRight, ChevronDown, Plus, FolderPlus, Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ContextMenu } from '@/components/ui/ContextMenu';
import { useAppStore } from '@/store';
import { cn } from '@/lib/utils';
import type { Feed, Folder as FolderType } from '@/types';
import {
  updateFeedSortOrders,
  db,
  deleteFeed,
  recalcAllFeedUnreadCounts,
  reorderFolders,
} from '@/lib/storage/db';
import { subscribeArticleUpdated } from '@/lib/events/articles';
import { AddFolderDialog } from '@/components/feed/AddFolderDialog';
import { AddFeedDialog } from '@/components/feed/AddFeedDialog';
import { FolderRenameDialog } from '@/components/feed/FolderRenameDialog';
import { EditFeedDialog } from '@/components/feed/EditFeedDialog';

type DragPayload = { type: 'feed'; id: string } | { type: 'folder'; id: string };

function CountBadge({ count, tone = 'primary' }: { count: number; tone?: 'primary' | 'starred' }) {
  if (count <= 0) return null;

  return (
    <span
      className={cn(
        'flex-shrink-0 inline-flex min-w-[22px] justify-center px-1.5 text-[11px] font-medium rounded',
        tone === 'primary'
          ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-200'
          : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-200'
      )}
    >
      {count}
    </span>
  );
}

export const Sidebar: React.FC = () => {
  const { t } = useTranslation();
  const {
    feeds,
    folders,
    uiState,
    setUIState,
    loadFeeds,
    loadFolders,
    updateFolder,
    deleteFolder,
    moveFeedToFolder,
  } = useAppStore();
  const [orderedFolders, setOrderedFolders] = useState<FolderType[]>(folders);
  const [orderedFeedsByFolder, setOrderedFeedsByFolder] = useState<Map<string | 'root', Feed[]>>(
    new Map()
  );
  const [dragging, setDragging] = useState<DragPayload | null>(null);
  const [dropTarget, setDropTarget] = useState<{ type: 'folder' | 'root'; id?: string } | null>(
    null
  );
  const [starredCount, setStarredCount] = useState<number>(0);
  const [showAddFolder, setShowAddFolder] = useState(false);
  const [showAddFeed, setShowAddFeed] = useState(false);
  const [renameFolder, setRenameFolder] = useState<FolderType | null>(null);
  const [editingFeed, setEditingFeed] = useState<Feed | null>(null);
  const droppedRef = useRef(false);

  const rootFeeds = useMemo(
    () => feeds.filter(f => !f.folderId).sort((a, b) => (a.sortOrder ?? a.createdAt) - (b.sortOrder ?? b.createdAt)),
    [feeds]
  );

  const feedsByFolderId = useMemo(() => {
    const map = new Map<string, Feed[]>();
    for (const feed of feeds) {
      if (feed.folderId) {
        const list = map.get(feed.folderId) || [];
        list.push(feed);
        map.set(feed.folderId, list);
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.sortOrder ?? a.createdAt) - (b.sortOrder ?? b.createdAt));
    }
    return map;
  }, [feeds]);

  useEffect(() => {
    setOrderedFolders(folders);
  }, [folders]);

  useEffect(() => {
    const next = new Map<string | 'root', Feed[]>();
    next.set('root', rootFeeds);
    for (const [folderId, list] of feedsByFolderId) {
      next.set(folderId, list);
    }
    setOrderedFeedsByFolder(next);
  }, [rootFeeds, feedsByFolderId]);

  useEffect(() => {
    let isMounted = true;
    const fetchCount = async () => {
      try {
        const count = await db.articles.filter(article => article.isStarred === true).count();
        if (isMounted) setStarredCount(count);
      } catch (error) {
        console.error('Failed to count starred articles:', error);
      }
    };
    fetchCount();
    const unsubscribe = subscribeArticleUpdated(detail => {
      if (typeof detail.updates.isStarred === 'boolean') fetchCount();
    });
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const totalUnread = useMemo(
    () => feeds.reduce((sum, feed) => sum + (feed.unreadCount || 0), 0),
    [feeds]
  );

  const isAllItemsSelected =
    uiState.filterBy === 'unread' && !uiState.selectedFeedId && !uiState.selectedFolderId;
  const isStarredSelected =
    uiState.filterBy === 'starred' && !uiState.selectedFeedId && !uiState.selectedFolderId;

  const handleFeedClick = (feedId: string) => {
    setUIState({
      selectedFeedId: feedId,
      selectedFolderId: undefined,
      selectedArticleId: undefined,
    });
  };

  const handleFolderClick = (folderId: string) => {
    setUIState({
      selectedFolderId: folderId,
      selectedFeedId: undefined,
      selectedArticleId: undefined,
    });
  };

  const handleToggleFolderExpand = async (folder: FolderType) => {
    await updateFolder(folder.id, { isExpanded: !folder.isExpanded });
  };

  const handleAllItemsClick = () => {
    setUIState({
      selectedFeedId: undefined,
      selectedFolderId: undefined,
      selectedArticleId: undefined,
      filterBy: 'unread',
    });
  };

  const handleStarredClick = () => {
    setUIState({
      selectedFeedId: undefined,
      selectedFolderId: undefined,
      selectedArticleId: undefined,
      filterBy: 'starred',
    });
  };

  const handleDragStart = (e: React.DragEvent, payload: DragPayload) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/json', JSON.stringify(payload));
    e.dataTransfer.setData('text/plain', payload.id);
    setDragging(payload);
  };

  const handleDragOver = (e: React.DragEvent, target: { type: 'folder' | 'root' | 'feed'; id?: string }) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dragging) return;

    if (dragging.type === 'folder') {
      if (target.type === 'folder' && target.id) {
        setDropTarget({ type: 'folder', id: target.id });
      } else if (target.type === 'root') {
        setDropTarget({ type: 'root' });
      }
      return;
    }

    // Dragging feed
    if (target.type === 'folder' && target.id) {
      setDropTarget({ type: 'folder', id: target.id });
    } else if (target.type === 'root') {
      setDropTarget({ type: 'root' });
    } else if (target.type === 'feed' && target.id && dragging.id !== target.id) {
      setDropTarget(null);
      // Reorder within same level
      const sourceFeed = feeds.find(f => f.id === dragging.id);
      const targetFeed = feeds.find(f => f.id === target.id);
      if (!sourceFeed || !targetFeed) return;
      const sameFolder =
        (sourceFeed.folderId ?? 'root') === (targetFeed.folderId ?? 'root');
      if (sameFolder) {
        const list = orderedFeedsByFolder.get(sourceFeed.folderId ?? 'root') ?? [];
        const srcIdx = list.findIndex(f => f.id === dragging.id);
        const tgtIdx = list.findIndex(f => f.id === target.id);
        if (srcIdx === -1 || tgtIdx === -1) return;
        const next = [...list];
        const [moved] = next.splice(srcIdx, 1);
        next.splice(tgtIdx, 0, moved);
        const key = sourceFeed.folderId ?? 'root';
        setOrderedFeedsByFolder(prev => new Map(prev).set(key, next));
      }
    }
  };

  const handleDragLeave = () => {
    setDropTarget(null);
  };

  const handleDrop = async (e: React.DragEvent, target: { type: 'folder' | 'root'; id?: string }) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);
    droppedRef.current = true;

    let payload: DragPayload | null = null;
    try {
      const raw = e.dataTransfer.getData('application/json');
      if (raw) payload = JSON.parse(raw) as DragPayload;
    } catch {
      const id = e.dataTransfer.getData('text/plain');
      if (id) payload = { type: 'feed', id };
    }

    if (!payload) {
      setDragging(null);
      return;
    }

    if (payload.type === 'feed') {
      if (target.type === 'folder' && target.id) {
        await moveFeedToFolder(payload.id, target.id);
      } else if (target.type === 'root') {
        await moveFeedToFolder(payload.id, undefined);
      }
    } else if (payload.type === 'folder' && target.type === 'folder' && target.id) {
      const srcIdx = orderedFolders.findIndex(f => f.id === payload!.id);
      const tgtIdx = orderedFolders.findIndex(f => f.id === target.id);
      if (srcIdx === -1 || tgtIdx === -1) return;
      const next = [...orderedFolders];
      const [moved] = next.splice(srcIdx, 1);
      next.splice(tgtIdx, 0, moved);
      setOrderedFolders(next);
      await reorderFolders(next.map(f => f.id));
    } else if (payload.type === 'folder' && target.type === 'root') {
      const srcIdx = orderedFolders.findIndex(f => f.id === payload!.id);
      if (srcIdx === -1) return;
      const next = [...orderedFolders];
      const [moved] = next.splice(srcIdx, 1);
      next.push(moved);
      setOrderedFolders(next);
      await reorderFolders(next.map(f => f.id));
    }

    setDragging(null);
  };

  const handleDragEnd = async () => {
    if (droppedRef.current) {
      droppedRef.current = false;
      setDragging(null);
      return;
    }

    if (!dragging || dragging.type !== 'feed') {
      setDragging(null);
      return;
    }

    const feed = feeds.find(f => f.id === dragging.id);
    if (!feed) {
      setDragging(null);
      return;
    }

    const key = feed.folderId ?? 'root';
    const currentList = orderedFeedsByFolder.get(key);
    if (currentList && currentList.length > 0) {
      const updates = currentList.map((f, i) => ({ id: f.id, sortOrder: i + 1 }));
      await updateFeedSortOrders(updates);
      await loadFeeds();
    }

    setDragging(null);
  };

  const handleDeleteFeed = async (feedId: string) => {
    if (!confirm(t('sidebar.confirmDeleteFeed'))) {
      return;
    }

    try {
      await deleteFeed(feedId);
      if (uiState.selectedFeedId === feedId) {
        setUIState({
          selectedFeedId: undefined,
          selectedArticleId: undefined,
        });
      }
      await loadFeeds();
      await recalcAllFeedUnreadCounts();
    } catch (error) {
      console.error('删除订阅源失败:', error);
      alert(t('sidebar.deleteFeedFailed'));
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    if (!confirm(t('sidebar.confirmDeleteFolder'))) return;
    try {
      await deleteFolder(folderId);
      if (uiState.selectedFolderId === folderId) {
        setUIState({
          selectedFolderId: undefined,
          selectedArticleId: undefined,
        });
      }
      await loadFeeds();
      await loadFolders();
    } catch (error) {
      console.error('删除文件夹失败:', error);
      alert(t('sidebar.deleteFolderFailed'));
    }
  };

  const renderFeedItem = (feed: Feed, indent = false) => (
    <ContextMenu
      key={feed.id}
      items={[
        {
          label: t('sidebar.edit'),
          icon: <Pencil className="w-4 h-4" />,
          onClick: () => setEditingFeed(feed),
        },
        {
          label: t('sidebar.deleteFeed'),
          icon: <Trash2 className="w-4 h-4" />,
          onClick: () => handleDeleteFeed(feed.id),
          variant: 'destructive',
        },
      ]}
    >
      <button
        draggable
        onDragStart={e => handleDragStart(e, { type: 'feed', id: feed.id })}
        onDragOver={e => handleDragOver(e, { type: 'feed', id: feed.id })}
        onDragEnd={handleDragEnd}
        onDrop={e => e.preventDefault()}
        onClick={() => handleFeedClick(feed.id)}
        className={cn(
          'w-full max-w-full min-w-0 flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
          indent && 'pl-8',
          'hover:bg-gray-100 dark:hover:bg-gray-800',
          uiState.selectedFeedId === feed.id
            ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
            : 'text-gray-700 dark:text-gray-300',
          dragging?.type === 'feed' && dragging.id === feed.id && 'cursor-grabbing opacity-80'
        )}
      >
        {feed.favicon ? (
          <img src={feed.favicon} alt="" className="w-4 h-4 flex-shrink-0" />
        ) : (
          <Rss className="w-4 h-4 flex-shrink-0" />
        )}
        <span className="min-w-0 flex-1 text-left truncate">{feed.title}</span>
        <CountBadge count={feed.unreadCount ?? 0} />
      </button>
    </ContextMenu>
  );

  const renderFolder = (folder: FolderType) => {
    const folderFeeds = orderedFeedsByFolder.get(folder.id) ?? [];
    const isExpanded = folder.isExpanded ?? true;
    const isSelected = uiState.selectedFolderId === folder.id;
    const isDropTarget = dropTarget?.type === 'folder' && dropTarget.id === folder.id;

    return (
      <div key={folder.id} className="w-full max-w-full overflow-hidden space-y-0">
        <ContextMenu
          items={[
            {
              label: t('sidebar.rename'),
              icon: <Folder className="w-4 h-4" />,
              onClick: () => setRenameFolder(folder),
            },
            {
              label: t('sidebar.deleteFolder'),
              icon: <Trash2 className="w-4 h-4" />,
              onClick: () => handleDeleteFolder(folder.id),
              variant: 'destructive',
            },
          ]}
        >
          <div
            draggable
            onDragStart={e => handleDragStart(e, { type: 'folder', id: folder.id })}
            onDragOver={e => handleDragOver(e, { type: 'folder', id: folder.id })}
            onDragLeave={handleDragLeave}
            onDrop={e => handleDrop(e, { type: 'folder', id: folder.id })}
            onDragEnd={() => dragging?.type === 'folder' && setDragging(null)}
            className={cn(
              'flex w-full max-w-full min-w-0 overflow-hidden items-center gap-1 rounded-md text-sm transition-colors',
              'hover:bg-gray-100 dark:hover:bg-gray-800',
              isSelected && 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400',
              isDropTarget && 'ring-2 ring-primary-500/50',
              'cursor-pointer'
            )}
          >
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                handleToggleFolderExpand(folder);
              }}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-gray-500" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-500" />
              )}
            </button>
            <button
              type="button"
              onClick={() => handleFolderClick(folder.id)}
              className="flex-1 min-w-0 flex items-center gap-2 pl-1 pr-3 py-2 text-left"
            >
              <Folder className="w-4 h-4 flex-shrink-0 text-gray-500" />
              <span className="min-w-0 flex-1 truncate">{folder.name}</span>
              <CountBadge count={folderFeeds.reduce((s, f) => s + (f.unreadCount || 0), 0)} />
            </button>
          </div>
        </ContextMenu>
        {isExpanded && (
          <div className="w-full max-w-full overflow-hidden space-y-0">
            {folderFeeds.map(feed => renderFeedItem(feed, true))}
          </div>
        )}
      </div>
    );
  };

  const rootDropZone = (
    <div
      onDragOver={e => handleDragOver(e, { type: 'root' })}
      onDragLeave={handleDragLeave}
      onDrop={e => handleDrop(e, { type: 'root' })}
      className={cn(
        'rounded-md border-2 border-dashed py-2 px-3 text-sm text-gray-500 transition-colors min-h-[32px]',
        dropTarget?.type === 'root'
          ? 'border-primary-500 bg-primary-50/50 dark:bg-primary-900/10'
          : rootFeeds.length > 0
            ? 'bg-gray-100/60 dark:bg-gray-800/40 border-gray-200 dark:border-gray-700'
            : 'border-transparent'
      )}
    >
      {rootFeeds.length > 0 && t('sidebar.uncategorized')}
    </div>
  );

  return (
    <div className="h-full w-full max-w-full min-w-0 overflow-hidden flex flex-col">
      <div className="p-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
        <h2 className="font-semibold text-sm text-gray-900 dark:text-gray-100">{t('sidebar.feeds')}</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowAddFeed(true)}
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
            title={t('sidebar.addFeed')}
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setShowAddFolder(true)}
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
            title={t('sidebar.addFolder')}
          >
            <FolderPlus className="w-4 h-4" />
          </button>
        </div>
      </div>

        <div className="w-full min-w-0 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-width:thin] [scrollbar-color:theme(colors.gray.300)_transparent] dark:[scrollbar-color:theme(colors.gray.700)_transparent]">
        <div className="w-full overflow-x-hidden space-y-3 p-2">
          <div className="w-full max-w-full rounded-lg bg-white/80 dark:bg-gray-800/80 p-1.5 space-y-0.5 shadow-sm">
            <button
              onClick={handleAllItemsClick}
              className={cn(
                'w-full max-w-full min-w-0 flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                'hover:bg-gray-100 dark:hover:bg-gray-700',
                isAllItemsSelected
                  ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                  : 'text-gray-700 dark:text-gray-300'
              )}
            >
              <Rss className="w-4 h-4 flex-shrink-0" />
              <span className="min-w-0 flex-1 text-left truncate">{t('sidebar.myUnread')}</span>
              <CountBadge count={totalUnread} />
            </button>

            <button
              onClick={handleStarredClick}
              className={cn(
                'w-full max-w-full min-w-0 flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                'hover:bg-gray-100 dark:hover:bg-gray-700',
                isStarredSelected
                  ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                  : 'text-gray-700 dark:text-gray-300'
              )}
            >
              <Star className="w-4 h-4 flex-shrink-0" />
              <span className="min-w-0 flex-1 text-left truncate">{t('sidebar.myStarred')}</span>
              <CountBadge count={starredCount} tone="starred" />
            </button>
          </div>

          <div className="w-full max-w-full overflow-hidden space-y-1">
            {orderedFolders.map(folder => renderFolder(folder))}

            {rootDropZone}
            {rootFeeds.map(feed => renderFeedItem(feed))}
          </div>
        </div>
        </div>

        <AddFolderDialog
          open={showAddFolder}
          onOpenChange={setShowAddFolder}
          onFolderAdded={loadFolders}
        />
        <AddFeedDialog
          open={showAddFeed}
          onOpenChange={setShowAddFeed}
          onFeedAdded={loadFeeds}
        />
        <FolderRenameDialog
          open={!!renameFolder}
          onOpenChange={open => !open && setRenameFolder(null)}
          folder={renameFolder}
          onRenamed={() => setRenameFolder(null)}
        />
        <EditFeedDialog
          open={!!editingFeed}
          onOpenChange={open => !open && setEditingFeed(null)}
          feed={editingFeed}
          onSaved={() => {
            setEditingFeed(null);
            loadFeeds();
          }}
        />
    </div>
  );
};
