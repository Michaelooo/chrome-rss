import React, { useState, useEffect, useMemo } from 'react';
import { HardDrive, Trash2, Calendar, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { db, deleteOldArticles } from '@/lib/storage/db';

interface StorageInfo {
  totalArticles: number;
  starredArticles: number;
  estimatedSize: string;
  oldestArticle?: Date;
  newestArticle?: Date;
}

interface CleanupOption {
  label: string;
  days: number;
  description: string;
}

interface StorageManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted?: () => void;
}

const CLEANUP_DAYS = [30, 90, 180, 365];

export const StorageManagementDialog: React.FC<StorageManagementDialogProps> = ({
  open,
  onOpenChange,
  onCompleted
}) => {
  const { t } = useTranslation();
  const cleanupOptions = useMemo<CleanupOption[]>(() => [
    { days: 30,  label: t('storage.cleanup30Label'),  description: t('storage.cleanup30Desc') },
    { days: 90,  label: t('storage.cleanup90Label'),  description: t('storage.cleanup90Desc') },
    { days: 180, label: t('storage.cleanup180Label'), description: t('storage.cleanup180Desc') },
    { days: 365, label: t('storage.cleanup365Label'), description: t('storage.cleanup365Desc') },
  ], [t]);
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [cleanupLoading, setCleanupLoading] = useState<number | null>(null);

  const fetchStorageInfo = async () => {
    try {
      setLoading(true);

      const [totalArticles, starredArticles, allArticles] = await Promise.all([
        db.articles.count(),
        db.articles.filter(article => article.isStarred === true).count(),
        db.articles.orderBy('pubDate').toArray()
      ]);

      // 估算存储大小（粗略计算）
      const estimatedSizeBytes = totalArticles * 2048; // 假设每篇文章平均2KB
      const estimatedSize = formatBytes(estimatedSizeBytes);

      const oldestArticle = allArticles.length > 0 ? new Date(allArticles[0].pubDate) : undefined;
      const newestArticle = allArticles.length > 0 ? new Date(allArticles[allArticles.length - 1].pubDate) : undefined;

      setStorageInfo({
        totalArticles,
        starredArticles,
        estimatedSize,
        oldestArticle,
        newestArticle
      });
    } catch (error) {
      console.error('获取存储信息失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleCleanup = async (days: number) => {
    const confirmMessage = t('storage.confirmCleanup', { days });

    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      setCleanupLoading(days);
      const deletedCount = await deleteOldArticles(days);

      alert(t('storage.cleanupSuccess', { count: deletedCount }));

      // 重新获取存储信息
      await fetchStorageInfo();

      // 通知父组件刷新
      onCompleted?.();
    } catch (error) {
      console.error('清理数据失败:', error);
      alert(t('storage.cleanupFailed'));
    } finally {
      setCleanupLoading(null);
    }
  };

  const getArticlesCountForPeriod = async (days: number): Promise<number> => {
    try {
      const cutoffDate = Date.now() - days * 24 * 60 * 60 * 1000;
      return await db.articles
        .where('pubDate')
        .below(cutoffDate)
        .and(article => !article.isStarred)
        .count();
    } catch {
      return 0;
    }
  };

  const [periodCounts, setPeriodCounts] = useState<Record<number, number>>({});

  useEffect(() => {
    if (open) {
      fetchStorageInfo();

      // 获取各个时间段的文章数量
      Promise.all(
        CLEANUP_DAYS.map(async days => {
          const count = await getArticlesCountForPeriod(days);
          return { days, count };
        })
      ).then(results => {
        const counts: Record<number, number> = {};
        results.forEach(({ days, count }) => {
          counts[days] = count;
        });
        setPeriodCounts(counts);
      });
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl mx-4">
        <div className="flex items-center gap-3 p-6 border-b border-gray-200 dark:border-gray-700">
          <HardDrive className="w-5 h-5 text-primary-600 dark:text-primary-400" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {t('storage.title')}
          </h2>
          <button
            onClick={() => onOpenChange(false)}
            className="ml-auto text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* 存储信息概览 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  {t('storage.totalArticles')}
                </span>
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {loading ? '...' : storageInfo?.totalArticles?.toLocaleString()}
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Star className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  {t('storage.starredArticles')}
                </span>
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {loading ? '...' : storageInfo?.starredArticles?.toLocaleString()}
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <HardDrive className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  {t('storage.estimatedSize')}
                </span>
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {loading ? '...' : storageInfo?.estimatedSize}
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  {t('storage.dataRange')}
                </span>
              </div>
              <div className="text-sm text-gray-900 dark:text-gray-100">
                {loading ? '...' : (
                  storageInfo?.oldestArticle && storageInfo?.newestArticle ? (
                    `${storageInfo.oldestArticle.toLocaleDateString()} - ${storageInfo.newestArticle.toLocaleDateString()}`
                  ) : t('storage.noData')
                )}
              </div>
            </div>
          </div>

          {/* 清理选项 */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
              {t('storage.cleanupTitle')}
            </h3>
            <div className="space-y-3">
              {cleanupOptions.map((option) => (
                <div
                  key={option.days}
                  className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
                >
                  <div className="flex-1">
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      {option.label}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {option.description}
                    </div>
                    {periodCounts[option.days] !== undefined && (
                      <div className="text-xs text-gray-500 mt-1">
                      {t('storage.cleanupPeriod', { count: periodCounts[option.days].toLocaleString() })}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleCleanup(option.days)}
                    disabled={cleanupLoading === option.days || (periodCounts[option.days] === 0)}
                    className="ml-4"
                  >
                    {cleanupLoading === option.days ? (
                      t('storage.cleaning')
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4 mr-2" />
                        {t('storage.clean')}
                      </>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* 注意事项 */}
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <h4 className="font-medium text-yellow-800 dark:text-yellow-200 mb-2">
              {t('storage.notes')}
            </h4>
            <ul className="text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
              <li>• {t('storage.note1')}</li>
              <li>• {t('storage.note2')}</li>
              <li>• {t('storage.note3')}</li>
              <li>• {t('storage.note4')}</li>
            </ul>
          </div>
        </div>

        <div className="flex justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t('storage.close')}
          </Button>
          <Button
            onClick={fetchStorageInfo}
            disabled={loading}
          >
            {loading ? t('storage.refreshing') : t('storage.refreshInfo')}
          </Button>
        </div>
      </div>
    </div>
  );
};