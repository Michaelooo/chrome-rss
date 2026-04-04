import React, { useEffect, useState } from 'react';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/store';
import { getDigestByDate } from '@/lib/storage/db';
import { generateDigest } from '@/lib/ai';
import { cn } from '@/lib/utils';
import type { Digest } from '@/types';

export const DigestView: React.FC = () => {
  const { setUIState } = useAppStore();
  const [digest, setDigest] = useState<Digest | undefined>();
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    loadDigest();
  }, []);

  const loadDigest = async () => {
    setLoading(true);
    try {
      const d = await getDigestByDate(today);
      setDigest(d);
    } catch (err) {
      console.error('Failed to load digest:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setGenerating(true);
    setError(null);
    try {
      const d = await generateDigest();
      setDigest(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate digest');
    } finally {
      setGenerating(false);
    }
  };

  const handleArticleClick = (articleId: string) => {
    setUIState({
      specialView: undefined,
      selectedArticleId: articleId,
    });
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        加载中...
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">今日简报</h2>
        <div className="flex items-center gap-2">
          {digest && (
            <span className="text-sm text-gray-500">
              {new Date(digest.generatedAt).toLocaleTimeString()}
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={generating}>
            {generating ? '生成中...' : '刷新简报'}
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-4 max-w-4xl mx-auto">
          {error && (
            <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {digest?.items.map((item) => (
            <div
              key={item.articleId}
              className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start gap-3">
                <span className={cn(
                  'mt-1 rounded-full px-2 py-0.5 text-xs font-medium flex-shrink-0',
                  item.importance === 'high' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                  item.importance === 'medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' :
                  'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                )}>
                  {item.importance === 'high' ? '重要' : item.importance === 'medium' ? '推荐' : '一般'}
                </span>
                <div className="flex-1 min-w-0">
                  <button
                    onClick={() => handleArticleClick(item.articleId)}
                    className="text-left w-full"
                  >
                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 hover:text-primary-600 dark:hover:text-primary-400">
                      {item.title}
                    </h3>
                  </button>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{item.summary}</p>
                  <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                    <span>{item.feedTitle}</span>
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-600 hover:underline"
                      onClick={e => e.stopPropagation()}
                    >
                      查看原文
                    </a>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {!digest && !loading && !error && (
            <div className="text-center py-12 text-gray-500">
              <p>暂无简报</p>
              <p className="text-sm mt-1">点击"刷新简报"生成今日简报</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};
