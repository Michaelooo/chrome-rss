import React, { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { FilterEditDialog } from './FilterEditDialog';
import type { FeedFilter } from '@/types';

interface FilterListProps {
  filters: FeedFilter[];
  feedOptions: { id: string; title: string }[];
  onAdd: (data: Omit<FeedFilter, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdate: (id: string, data: Partial<FeedFilter>) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
}

export const FilterList: React.FC<FilterListProps> = ({
  filters,
  feedOptions,
  onAdd,
  onUpdate,
  onDelete,
  onToggle,
}) => {
  const [editFilter, setEditFilter] = useState<FeedFilter | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const getScopeLabel = (filter: FeedFilter) => {
    if (!filter.feedId) return '全局';
    const feed = feedOptions.find(f => f.id === filter.feedId);
    return feed?.title || '未知订阅源';
  };

  const getActionLabels = (filter: FeedFilter) => {
    const map: Record<string, string> = {
      'mark-read': '已读',
      'star': '加星',
      'delete': '删除',
      'add-tag': '标签',
    };
    return filter.actions.map(a => map[a.type] || a.type).join('、');
  };

  const handleSave = (data: Omit<FeedFilter, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (editFilter) {
      onUpdate(editFilter.id, data);
    } else {
      onAdd(data);
    }
    setEditFilter(null);
    setShowCreate(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
          过滤规则
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setEditFilter(null);
            setShowCreate(true);
          }}
          className="gap-1"
        >
          <Plus className="w-3.5 h-3.5" />
          添加规则
        </Button>
      </div>

      {filters.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
          暂无过滤规则，点击上方按钮创建
        </p>
      ) : (
        <div className="space-y-2">
          {filters.map(filter => (
            <div
              key={filter.id}
              className={`rounded-lg border p-3 transition-colors ${
                filter.enabled
                  ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                  : 'border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 opacity-60'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <input
                    type="checkbox"
                    checked={filter.enabled}
                    onChange={(e) => onToggle(filter.id, e.target.checked)}
                    className="rounded flex-shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {filter.name}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                        {getScopeLabel(filter)}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {filter.conditionOperator === 'AND' ? '全部满足' : '任一满足'}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        → {getActionLabels(filter)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => {
                      setEditFilter(filter);
                      setShowCreate(true);
                    }}
                    className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onDelete(filter.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <FilterEditDialog
        open={showCreate}
        onOpenChange={(open) => {
          setShowCreate(open);
          if (!open) setEditFilter(null);
        }}
        filter={editFilter}
        feedOptions={feedOptions}
        onSave={handleSave}
      />
    </div>
  );
};
