import React from 'react';
import { Trash2 } from 'lucide-react';
import type { FilterCondition } from '@/types';
import { Input } from '@/components/ui/Input';

interface FilterConditionRowProps {
  condition: FilterCondition;
  onChange: (updated: FilterCondition) => void;
  onRemove: () => void;
}

export const FilterConditionRow: React.FC<FilterConditionRowProps> = ({
  condition,
  onChange,
  onRemove,
}) => {
  return (
    <div className="flex items-center gap-2">
      <select
        value={condition.field}
        onChange={(e) => onChange({ ...condition, field: e.target.value as FilterCondition['field'] })}
        className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
      >
        <option value="title">标题</option>
        <option value="content">内容</option>
        <option value="author">作者</option>
        <option value="url">链接</option>
      </select>

      <select
        value={condition.operator}
        onChange={(e) => onChange({ ...condition, operator: e.target.value as FilterCondition['operator'] })}
        className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
      >
        <option value="contains">包含</option>
        <option value="not_contains">不包含</option>
        <option value="equals">等于</option>
        <option value="matches">匹配</option>
      </select>

      <Input
        type="text"
        placeholder="关键词..."
        value={condition.value}
        onChange={(e) => onChange({ ...condition, value: e.target.value })}
        className="flex-1 text-sm"
      />

      <label className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
        <input
          type="checkbox"
          checked={condition.isRegex}
          onChange={(e) => onChange({ ...condition, isRegex: e.target.checked })}
          className="rounded"
        />
        正则
      </label>

      <button
        type="button"
        onClick={onRemove}
        className="p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
};
