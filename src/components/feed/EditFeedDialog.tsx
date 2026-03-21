import React, { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { Feed } from '@/types';
import { updateFeed } from '@/lib/storage/db';

interface EditFeedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feed: Feed | null;
  onSaved: () => void;
}

export const EditFeedDialog: React.FC<EditFeedDialogProps> = ({
  open,
  onOpenChange,
  feed,
  onSaved,
}) => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (feed) {
      setName(feed.title);
      setUrl(feed.url);
      setError('');
    }
  }, [feed, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feed) return;

    const trimmedName = name.trim();
    const trimmedUrl = url.trim();

    if (!trimmedName || !trimmedUrl) {
      setError(t('editFeed.nameUrlRequired'));
      return;
    }

    try {
      new URL(trimmedUrl);
    } catch {
      setError(t('editFeed.urlInvalid'));
      return;
    }

    setLoading(true);
    setError('');
    try {
      await updateFeed(feed.id, { title: trimmedName, url: trimmedUrl });
      onOpenChange(false);
      onSaved();
    } catch (err) {
      console.error('Failed to update feed:', err);
      setError(t('editFeed.saveFailed'));
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
              {t('editFeed.title')}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X className="w-5 h-5" />
              </button>
            </Dialog.Close>
          </div>

          <Dialog.Description className="sr-only">
            {t('editFeed.description')}
          </Dialog.Description>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="feed-name"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                {t('editFeed.nameLabel')}
              </label>
              <Input
                id="feed-name"
                type="text"
                placeholder={t('editFeed.namePlaceholder')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>

            <div>
              <label
                htmlFor="feed-url-edit"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                {t('editFeed.urlLabel')}
              </label>
              <Input
                id="feed-url-edit"
                type="url"
                placeholder="https://example.com/feed.xml"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
              />
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
                {loading ? t('editFeed.saving') : t('editFeed.save')}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
