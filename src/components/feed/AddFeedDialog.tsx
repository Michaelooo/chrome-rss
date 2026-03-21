import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { addFeed, addArticles } from '@/lib/storage/db';
import { feedFetcher, rssItemToArticle } from '@/lib/fetcher/feed-fetcher';
import { updateUnreadBadge } from '@/lib/chrome/badge';
import { useAppStore } from '@/store';
import { cn } from '@/lib/utils';

interface AddFeedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFeedAdded: () => void;
}

export const AddFeedDialog: React.FC<AddFeedDialogProps> = ({
  open,
  onOpenChange,
  onFeedAdded,
}) => {
  const { t } = useTranslation();
  const { folders } = useAppStore();
  const [url, setUrl] = useState('');
  const [folderId, setFolderId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Fetch and validate the feed
      const rssFeed = await feedFetcher.fetchFeed(url);
      const favicon = await feedFetcher.getFeedFavicon(url);

      // Add feed to database
      const feedId = await addFeed({
        url,
        title: rssFeed.title,
        description: rssFeed.description,
        link: rssFeed.link,
        favicon,
        folderId: folderId || undefined,
        updateInterval: 30,
        lastFetchTime: Date.now(),
        lastFetchStatus: 'success',
        unreadCount: rssFeed.items.length,
        sortOrder: Date.now(),
      });

      if (rssFeed.items.length > 0) {
        const articles = rssFeed.items.map(item => rssItemToArticle(item, feedId));
        await addArticles(articles);
      }

      // Reset form
      setUrl('');
      onOpenChange(false);
      onFeedAdded();
      await updateUnreadBadge();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add feed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-900 rounded-lg shadow-xl p-6 w-full max-w-md z-50">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {t('addFeed.title')}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X className="w-5 h-5" />
              </button>
            </Dialog.Close>
          </div>

          <Dialog.Description className="sr-only">
            {t('addFeed.description')}
          </Dialog.Description>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="feed-url"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                {t('addFeed.urlLabel')}
              </label>
              <Input
                id="feed-url"
                type="url"
                placeholder="https://example.com/feed.xml"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div>
              <label
                htmlFor="feed-folder"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                {t('addFeed.folderLabel')}
              </label>
              <select
                id="feed-folder"
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
                className={cn(
                  'flex h-10 w-full rounded-md border border-gray-300 dark:border-gray-700',
                  'bg-white dark:bg-gray-900 px-3 py-2 text-sm',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500'
                )}
              >
                <option value="">{t('sidebar.uncategorized')}</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            </div>

            {error && (
              <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
            )}

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? t('addFeed.adding') : t('addFeed.submit')}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
