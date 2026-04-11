import React, { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAppStore } from '@/store';
import type { Folder } from '@/types';

interface FolderRenameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folder: Folder | null;
  onRenamed: () => void;
}

export const FolderRenameDialog: React.FC<FolderRenameDialogProps> = ({
  open,
  onOpenChange,
  folder,
  onRenamed,
}) => {
  const { t } = useTranslation();
  const { updateFolder } = useAppStore();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (folder) {
      setName(folder.name);
      setError('');
    }
  }, [folder, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folder) return;

    setError('');
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t('renameFolder.nameRequired'));
      return;
    }

    setLoading(true);
    try {
      await updateFolder(folder.id, { name: trimmed });
      onOpenChange(false);
      onRenamed();
    } catch (err) {
      console.error('Failed to rename folder:', err);
      setError(t('renameFolder.renameFailed'));
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
              {t('renameFolder.title')}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X className="w-5 h-5" />
              </button>
            </Dialog.Close>
          </div>

          <Dialog.Description className="sr-only">
            {t('renameFolder.description')}
          </Dialog.Description>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="folder-rename"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                {t('renameFolder.nameLabel')}
              </label>
              <Input
                id="folder-rename"
                type="text"
                placeholder={t('renameFolder.namePlaceholder')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
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
                {loading ? t('renameFolder.saving') : t('renameFolder.save')}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
