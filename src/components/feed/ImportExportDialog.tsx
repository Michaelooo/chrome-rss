import React, { useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Upload, Download, X, FileText, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  addArticles,
  addFeed,
  addFolder,
  getAllFeeds,
  getFeedByUrl,
  getRootFolders,
} from '@/lib/storage/db';
import { feedFetcher, rssItemToArticle } from '@/lib/fetcher/feed-fetcher';
import { parseOpmlWithStructure, generateOpml } from '@/lib/opml';
import { updateUnreadBadge } from '@/lib/chrome/badge';

interface ImportExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted?: () => void;
}

interface ImportStats {
  imported: number;
  skipped: number;
  failed: number;
}

export const ImportExportDialog: React.FC<ImportExportDialogProps> = ({
  open,
  onOpenChange,
  onCompleted,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importStats, setImportStats] = useState<ImportStats | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const runImport = async (text: string) => {
    const result = parseOpmlWithStructure(text);
    const totalFeeds =
      result.rootFeeds.length + result.folders.reduce((s, f) => s + f.feeds.length, 0);
    if (totalFeeds === 0) {
      throw new Error('未在 OPML 文件中找到有效的订阅源。');
    }

    let imported = 0;
    let skipped = 0;
    let failed = 0;

    const processEntry = async (
      entry: { title: string; xmlUrl: string; htmlUrl?: string },
      folderId?: string
    ) => {
      const url = entry.xmlUrl;
      if (!url) {
        failed++;
        return;
      }
      try {
        const existing = await getFeedByUrl(url);
        if (existing) {
          skipped++;
          return;
        }

        const rssFeed = await feedFetcher.fetchFeed(url);
        const favicon = await feedFetcher.getFeedFavicon(url);

        const feedId = await addFeed({
          url,
          title: rssFeed.title || entry.title || url,
          description: rssFeed.description || undefined,
          link: rssFeed.link || entry.htmlUrl,
          favicon,
          folderId,
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

        imported++;
      } catch (error) {
        console.error('Failed to import feed from OPML entry:', error);
        failed++;
      }
    };

    const existingFolderCount = await getRootFolders().then(f => f.length);
    let order = existingFolderCount;

    for (const folder of result.folders) {
      const folderId = await addFolder({
        name: folder.name,
        order: order++,
        isExpanded: true,
      });
      for (const entry of folder.feeds) {
        await processEntry(entry, folderId);
      }
    }

    for (const entry of result.rootFeeds) {
      await processEntry(entry);
    }

    return { imported, skipped, failed };
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportError(null);
    setImportStats(null);

    try {
      const text = await file.text();
      const stats = await runImport(text);
      setImportStats(stats);
      onCompleted?.();
      await updateUnreadBadge();
    } catch (error) {
      const message = error instanceof Error ? error.message : '导入失败，请稍后重试。';
      setImportError(message);
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDefaultImport = async () => {
    setImporting(true);
    setImportError(null);
    setImportStats(null);

    try {
      const url = chrome.runtime.getURL('default-subscriptions.opml');
      const res = await fetch(url);
      if (!res.ok) throw new Error('无法加载默认订阅配置');
      const text = await res.text();
      const stats = await runImport(text);
      setImportStats(stats);
      onCompleted?.();
      await updateUnreadBadge();
    } catch (error) {
      const message = error instanceof Error ? error.message : '导入失败，请稍后重试。';
      setImportError(message);
    } finally {
      setImporting(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    setExportError(null);

    try {
      const [feeds, folders] = await Promise.all([getAllFeeds(), getRootFolders()]);
      if (feeds.length === 0) {
        throw new Error('当前没有可导出的订阅源。');
      }

      const opml = generateOpml(feeds, folders);
      const blob = new Blob([opml], { type: 'text/xml' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `rss-reader-subscriptions-${new Date().toISOString().slice(0, 10)}.opml`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      const message = error instanceof Error ? error.message : '导出失败，请稍后重试。';
      setExportError(message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-xl dark:bg-gray-900">
          <div className="mb-6 flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              导入 / 导出订阅源
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="text-gray-400 transition hover:text-gray-600 dark:hover:text-gray-300">
                <X className="h-5 w-5" />
              </button>
            </Dialog.Close>
          </div>

          <Dialog.Description className="sr-only">
            导入或导出 OPML 格式的订阅源文件
          </Dialog.Description>

          <div className="space-y-6">
            <section className="rounded-lg border border-dashed border-gray-200 p-4 dark:border-gray-700">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600 dark:bg-primary-900/40 dark:text-primary-200">
                  <Upload className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    导入 OPML 文件
                  </h3>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    选择本地的 OPML 文件，一次性导入多个订阅源。
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleImportClick}
                      disabled={importing}
                    >
                      {importing ? '正在导入...' : '选择文件'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleDefaultImport}
                      disabled={importing}
                    >
                      <Sparkles className="mr-2 h-4 w-4" />
                      使用默认订阅配置
                    </Button>
                    <Input
                      ref={fileInputRef}
                      type="file"
                      accept=".opml,.xml"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </div>
                  {importStats && (
                    <div className="mt-3 rounded-lg bg-gray-100 px-3 py-2 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                      <p>成功导入：{importStats.imported}</p>
                      <p>已存在：{importStats.skipped}</p>
                      <p>失败条目：{importStats.failed}</p>
                    </div>
                  )}
                  {importError && (
                    <p className="mt-3 text-xs text-red-500 dark:text-red-400">{importError}</p>
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600 dark:bg-primary-900/40 dark:text-primary-200">
                  <Download className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    导出当前订阅
                  </h3>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    将所有订阅源导出为 OPML 文件，方便备份或迁移到其他 RSS 阅读器。
                  </p>
                  <div className="mt-4 flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleExport}
                      disabled={exporting}
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      {exporting ? '正在导出...' : '导出 OPML'}
                    </Button>
                  </div>
                  {exportError && (
                    <p className="mt-3 text-xs text-red-500 dark:text-red-400">{exportError}</p>
                  )}
                </div>
              </div>
            </section>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
