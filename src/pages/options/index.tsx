import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { getSettings, updateSettings } from '@/lib/storage/db';
import type { Settings } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import '@/index.css';

const Options: React.FC = () => {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const settings = await getSettings();
    setSettings(settings);
  };

  const handleSave = async () => {
    if (!settings) return;

    await updateSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!settings) {
    return <div className="p-8">加载中...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-8">
          设置
        </h1>

        <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-6 space-y-6">
          {/* Theme */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              主题
            </label>
            <select
              value={settings.theme}
              onChange={(e) =>
                setSettings({ ...settings, theme: e.target.value as any })
              }
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
            >
              <option value="light">浅色</option>
              <option value="dark">深色</option>
              <option value="auto">跟随系统</option>
            </select>
          </div>

          {/* Update Interval */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              默认更新间隔（分钟）
            </label>
            <Input
              type="number"
              min="5"
              value={settings.defaultUpdateInterval}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  defaultUpdateInterval: parseInt(e.target.value),
                })
              }
            />
          </div>

          {/* Notifications */}
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              开启通知
            </label>
            <input
              type="checkbox"
              checked={settings.enableNotifications}
              onChange={(e) =>
                setSettings({ ...settings, enableNotifications: e.target.checked })
              }
              className="w-4 h-4"
            />
          </div>

          {/* Max Articles Per Feed */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              每个订阅保留的最大文章数
            </label>
            <Input
              type="number"
              min="50"
              max="1000"
              value={settings.maxArticlesPerFeed}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  maxArticlesPerFeed: parseInt(e.target.value),
                })
              }
            />
          </div>

          {/* Article Retention */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              文章保留时间（天）
            </label>
            <Input
              type="number"
              min="1"
              max="365"
              value={settings.articleRetentionDays}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  articleRetentionDays: parseInt(e.target.value),
                })
              }
            />
          </div>

          {/* Reading Style */}
          <div className="border-t border-gray-200 dark:border-gray-800 pt-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              阅读样式
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  文章字号
                </label>
                <select
                  value={settings.fontSize}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      fontSize: e.target.value as Settings['fontSize'],
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
                >
                  <option value="small">小</option>
                  <option value="medium">标准</option>
                  <option value="large">大</option>
                  <option value="xlarge">超大</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  内容宽度
                </label>
                <select
                  value={settings.contentWidth}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      contentWidth: e.target.value as Settings['contentWidth'],
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
                >
                  <option value="narrow">窄</option>
                  <option value="standard">标准</option>
                  <option value="wide">宽</option>
                  <option value="xwide">超宽</option>
                </select>
              </div>
            </div>
          </div>

          {/* Translation */}
          <div className="border-t border-gray-200 dark:border-gray-800 pt-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">翻译</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  使用浏览器内置的 Google Translate 翻译文章内容。
                </p>
              </div>
              <input
                type="checkbox"
                checked={settings.enableTranslation}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    enableTranslation: e.target.checked,
                  })
                }
                className="w-4 h-4"
              />
            </div>

            {settings.enableTranslation && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    目标语言（如 zh-CN）
                  </label>
                  <Input
                    value={settings.translationTargetLanguage}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        translationTargetLanguage: e.target.value,
                      })
                    }
                    placeholder="例如 zh-CN"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    源语言（可选，留空表示自动检测）
                  </label>
                  <Input
                    value={settings.translationSourceLanguage ?? ''}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        translationSourceLanguage: e.target.value,
                      })
                    }
                    placeholder="例如 en"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    打开文章时自动翻译
                  </label>
                  <input
                    type="checkbox"
                    checked={settings.translationAutoFetch}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        translationAutoFetch: e.target.checked,
                      })
                    }
                    className="w-4 h-4"
                  />
                </div>

                <p className="text-xs text-gray-500 dark:text-gray-400">
                  免费翻译服务存在频率限制，如遇翻译失败请稍后重试。
                </p>
              </div>
            )}
          </div>

          {/* Save Button */}
          <div className="pt-4">
            <Button onClick={handleSave} className="w-full">
              {saved ? '已保存' : '保存设置'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Options />
  </React.StrictMode>
);
