import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { useTranslation } from 'react-i18next';
import { getSettings, updateSettings } from '@/lib/storage/db';
import type { Settings } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import i18n, { setStoredLanguage, type AppLanguage } from '@/lib/i18n';
import '@/index.css';

const Options: React.FC = () => {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const loaded = await getSettings();
    setSettings(loaded);
    // Sync i18next with the persisted language preference
    if (loaded.language && loaded.language !== i18n.language) {
      i18n.changeLanguage(loaded.language);
      setStoredLanguage(loaded.language);
    }
  };

  const handleLanguageChange = async (lang: AppLanguage) => {
    if (!settings) return;
    const updated = { ...settings, language: lang };
    setSettings(updated);
    i18n.changeLanguage(lang);
    setStoredLanguage(lang);
    // Persist immediately so the choice survives a page reload without pressing Save
    await updateSettings({ language: lang });
  };

  const handleSave = async () => {
    if (!settings) return;
    await updateSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!settings) {
    return <div className="p-8">{t('common.loading')}</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-8">
          {t('settings.title')}
        </h1>

        <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-6 space-y-6">
          {/* Language */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('settings.language')}
            </label>
            <select
              value={settings.language ?? 'zh'}
              onChange={(e) => handleLanguageChange(e.target.value as AppLanguage)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
            >
              <option value="zh">{t('settings.langZh')}</option>
              <option value="en">{t('settings.langEn')}</option>
            </select>
          </div>

          {/* Theme */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('settings.theme')}
            </label>
            <select
              value={settings.theme}
              onChange={async (e) => {
                const theme = e.target.value as Settings['theme'];
                setSettings({ ...settings, theme });
                const isDark = theme === 'dark' ||
                  (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
                document.documentElement.classList.toggle('dark', isDark);
                await updateSettings({ theme });
              }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
            >
              <option value="light">{t('settings.themeLight')}</option>
              <option value="dark">{t('settings.themeDark')}</option>
              <option value="auto">{t('settings.themeAuto')}</option>
            </select>
          </div>

          {/* Update Interval */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('settings.updateInterval')}
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
              {t('settings.enableNotifications')}
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
              {t('settings.maxArticlesPerFeed')}
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
              {t('settings.articleRetentionDays')}
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

          {/* Default Article Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('settings.defaultArticleFilter')}
            </label>
            <select
              value={settings.defaultArticleFilter ?? 'all'}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  defaultArticleFilter: e.target.value as Settings['defaultArticleFilter'],
                })
              }
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
            >
              <option value="all">{t('settings.defaultArticleFilterAll')}</option>
              <option value="unread">{t('settings.defaultArticleFilterUnread')}</option>
            </select>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {t('settings.defaultArticleFilterDesc')}
            </p>
          </div>

          {/* Reading Style */}
          <div className="border-t border-gray-200 dark:border-gray-800 pt-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              {t('settings.readingStyle')}
            </h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('settings.markAsReadOnScroll')}
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t('settings.markAsReadOnScrollDesc')}
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.markAsReadOnScroll}
                  onChange={(e) =>
                    setSettings({ ...settings, markAsReadOnScroll: e.target.checked })
                  }
                  className="w-4 h-4"
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('settings.removeScrollReadInUnreadMode')}
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t('settings.removeScrollReadInUnreadModeDesc')}
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.removeScrollReadInUnreadMode ?? false}
                  onChange={(e) =>
                    setSettings({ ...settings, removeScrollReadInUnreadMode: e.target.checked })
                  }
                  className="w-4 h-4"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('settings.fontSize')}
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
                  <option value="small">{t('settings.fontSizeSmall')}</option>
                  <option value="medium">{t('settings.fontSizeMedium')}</option>
                  <option value="large">{t('settings.fontSizeLarge')}</option>
                  <option value="xlarge">{t('settings.fontSizeXLarge')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('settings.contentWidth')}
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
                  <option value="narrow">{t('settings.contentWidthNarrow')}</option>
                  <option value="standard">{t('settings.contentWidthStandard')}</option>
                  <option value="wide">{t('settings.contentWidthWide')}</option>
                  <option value="xwide">{t('settings.contentWidthXWide')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('settings.articleTitleLines')}
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  {t('settings.articleTitleLinesDesc')}
                </p>
                <select
                  value={settings.articleTitleLines ?? 1}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      articleTitleLines: parseInt(e.target.value) as 1 | 2 | 3,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
                >
                  <option value={1}>{t('settings.linesCount1')}</option>
                  <option value={2}>{t('settings.linesCount2')}</option>
                  <option value={3}>{t('settings.linesCount3')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('settings.articleExcerptLines')}
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  {t('settings.articleExcerptLinesDesc')}
                </p>
                <select
                  value={settings.articleExcerptLines ?? 2}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      articleExcerptLines: parseInt(e.target.value) as 1 | 2 | 3,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
                >
                  <option value={1}>{t('settings.linesCount1')}</option>
                  <option value={2}>{t('settings.linesCount2')}</option>
                  <option value={3}>{t('settings.linesCount3')}</option>
                </select>
              </div>
            </div>
          </div>

          {/* Translation */}
          <div className="border-t border-gray-200 dark:border-gray-800 pt-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {t('settings.translation')}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t('settings.translationDesc')}
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
                    {t('settings.translationTargetLanguage')}
                  </label>
                  <Input
                    value={settings.translationTargetLanguage}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        translationTargetLanguage: e.target.value,
                      })
                    }
                    placeholder={t('settings.translationTargetPlaceholder')}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {t('settings.translationSourceLanguage')}
                  </label>
                  <Input
                    value={settings.translationSourceLanguage ?? ''}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        translationSourceLanguage: e.target.value,
                      })
                    }
                    placeholder={t('settings.translationSourcePlaceholder')}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('settings.translationAutoFetch')}
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
                  {t('settings.translationNote')}
                </p>
              </div>
            )}
          </div>

          {/* AI Summary */}
          <div className="border-t border-gray-200 dark:border-gray-800 pt-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">AI 摘要</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  使用 OpenAI 兼容 API 自动生成文章摘要和关键词。支持 OpenAI、DeepSeek、Ollama 等。
                </p>
              </div>
              <input
                type="checkbox"
                checked={settings.enableAI}
                onChange={(e) =>
                  setSettings({ ...settings, enableAI: e.target.checked })
                }
                className="w-4 h-4"
              />
            </div>

            {settings.enableAI && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    API 地址
                  </label>
                  <Input
                    value={settings.aiApiEndpoint}
                    onChange={(e) =>
                      setSettings({ ...settings, aiApiEndpoint: e.target.value })
                    }
                    placeholder="https://api.openai.com/v1"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    API Key
                  </label>
                  <Input
                    type="password"
                    value={settings.aiApiKey}
                    onChange={(e) =>
                      setSettings({ ...settings, aiApiKey: e.target.value })
                    }
                    placeholder="sk-..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    模型名称
                  </label>
                  <Input
                    value={settings.aiModel}
                    onChange={(e) =>
                      setSettings({ ...settings, aiModel: e.target.value })
                    }
                    placeholder="gpt-4o-mini"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    获取新文章时自动生成摘要
                  </label>
                  <input
                    type="checkbox"
                    checked={settings.aiAutoSummarize}
                    onChange={(e) =>
                      setSettings({ ...settings, aiAutoSummarize: e.target.checked })
                    }
                    className="w-4 h-4"
                  />
                </div>

                <p className="text-xs text-gray-500 dark:text-gray-400">
                  API Key 仅存储在本地 IndexedDB 中，不会传输到除你配置的 API 地址以外的任何服务器。
                </p>
              </div>
            )}
          </div>

          {/* Save Button */}
          <div className="pt-4">
            <Button onClick={handleSave} className="w-full">
              {saved ? t('common.saved') : t('common.save')}
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
