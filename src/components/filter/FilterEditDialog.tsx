import React, { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FilterConditionRow } from './FilterConditionRow';
import type { FeedFilter, FilterCondition, FilterAction } from '@/types';

interface FilterEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filter: FeedFilter | null;
  feedOptions: { id: string; title: string }[];
  onSave: (data: Omit<FeedFilter, 'id' | 'createdAt' | 'updatedAt'>) => void;
}

function createEmptyCondition(): FilterCondition {
  return {
    id: crypto.randomUUID(),
    field: 'title',
    operator: 'contains',
    value: '',
    isRegex: false,
  };
}

const AVAILABLE_ACTIONS: { type: FilterAction['type']; label: string }[] = [
  { type: 'mark-read', label: '标记已读' },
  { type: 'star', label: '加星' },
  { type: 'delete', label: '删除' },
  { type: 'add-tag', label: '添加标签' },
];

export const FilterEditDialog: React.FC<FilterEditDialogProps> = ({
  open,
  onOpenChange,
  filter,
  feedOptions,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [feedId, setFeedId] = useState<string | undefined>(undefined);
  const [operator, setOperator] = useState<'AND' | 'OR'>('AND');
  const [conditions, setConditions] = useState<FilterCondition[]>([createEmptyCondition()]);
  const [actions, setActions] = useState<FilterAction[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [tagValue, setTagValue] = useState('');

  useEffect(() => {
    if (filter) {
      setName(filter.name);
      setFeedId(filter.feedId);
      setOperator(filter.conditionOperator);
      setConditions(filter.conditions.length > 0 ? filter.conditions : [createEmptyCondition()]);
      setActions(filter.actions);
      setEnabled(filter.enabled);
      const tagAction = filter.actions.find(a => a.type === 'add-tag');
      setTagValue(tagAction?.value || '');
    } else {
      setName('');
      setFeedId(undefined);
      setOperator('AND');
      setConditions([createEmptyCondition()]);
      setActions([]);
      setEnabled(true);
      setTagValue('');
    }
  }, [filter, open]);

  const handleConditionChange = (index: number, updated: FilterCondition) => {
    setConditions(prev => prev.map((c, i) => (i === index ? updated : c)));
  };

  const handleConditionRemove = (index: number) => {
    setConditions(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddCondition = () => {
    setConditions(prev => [...prev, createEmptyCondition()]);
  };

  const toggleAction = (type: FilterAction['type']) => {
    setActions(prev => {
      const exists = prev.find(a => a.type === type);
      if (exists) {
        return prev.filter(a => a.type !== type);
      }
      return [...prev, { type, value: type === 'add-tag' ? tagValue : undefined }];
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName) return;

    const validConditions = conditions.filter(c => c.value.trim() !== '');
    if (validConditions.length === 0) return;

    const finalActions = actions.map(a =>
      a.type === 'add-tag' ? { ...a, value: tagValue } : a
    );

    onSave({
      name: trimmedName,
      feedId: feedId || undefined,
      enabled,
      conditionOperator: operator,
      conditions: validConditions,
      actions: finalActions,
    });

    onOpenChange(false);
  };

  const isActionChecked = (type: FilterAction['type']) => actions.some(a => a.type === type);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-900 rounded-lg shadow-xl p-6 w-full max-w-lg z-50 max-h-[85vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {filter ? '编辑规则' : '新建规则'}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X className="w-5 h-5" />
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Rule name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                规则名称
              </label>
              <Input
                type="text"
                placeholder="例如：过滤广告"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>

            {/* Scope */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                作用范围
              </label>
              <select
                value={feedId || ''}
                onChange={(e) => setFeedId(e.target.value || undefined)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              >
                <option value="">全局（所有订阅源）</option>
                {feedOptions.map(f => (
                  <option key={f.id} value={f.id}>{f.title}</option>
                ))}
              </select>
            </div>

            {/* Conditions */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  匹配条件
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setOperator('AND')}
                    className={`px-2 py-0.5 text-xs rounded ${operator === 'AND' ? 'bg-primary-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
                  >
                    全部满足
                  </button>
                  <button
                    type="button"
                    onClick={() => setOperator('OR')}
                    className={`px-2 py-0.5 text-xs rounded ${operator === 'OR' ? 'bg-primary-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
                  >
                    任一满足
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {conditions.map((condition, index) => (
                  <FilterConditionRow
                    key={condition.id}
                    condition={condition}
                    onChange={(updated) => handleConditionChange(index, updated)}
                    onRemove={() => handleConditionRemove(index)}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={handleAddCondition}
                className="mt-2 flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400"
              >
                <Plus className="w-4 h-4" />
                添加条件
              </button>
            </div>

            {/* Actions */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                执行动作
              </label>
              <div className="space-y-2">
                {AVAILABLE_ACTIONS.map(({ type, label }) => (
                  <label key={type} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={isActionChecked(type)}
                      onChange={() => toggleAction(type)}
                      className="rounded"
                    />
                    {label}
                    {type === 'add-tag' && isActionChecked(type) && (
                      <Input
                        type="text"
                        placeholder="标签名"
                        value={tagValue}
                        onChange={(e) => setTagValue(e.target.value)}
                        className="ml-2 w-32 text-sm"
                      />
                    )}
                  </label>
                ))}
              </div>
            </div>

            {/* Enabled toggle */}
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="rounded"
              />
              启用此规则
            </label>

            {/* Buttons */}
            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
              >
                取消
              </Button>
              <Button type="submit" disabled={!name.trim() || conditions.every(c => !c.value.trim())}>
                {filter ? '保存' : '创建'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
