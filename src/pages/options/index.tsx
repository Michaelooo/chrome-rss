import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { useTranslation } from 'react-i18next';
import { getSettings, updateSettings } from '@/lib/storage/db';
import type { AIProviderSettings, Settings } from '@/types';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import i18n, { setStoredLanguage, type AppLanguage } from '@/lib/i18n';
import '@/index.css';

const Options: React.FC = () => {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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

  const isValidEndpoint = (value: string) => {
    try {
      return ['http:', 'https:'].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  };

  const updateFallbackProvider = (id: string, updates: Partial<AIProviderSettings>) => {
    if (!settings) return;
    setSettings({
      ...settings,
      aiFallbackProviders: settings.aiFallbackProviders.map(provider =>
        provider.id === id ? { ...provider, ...updates } : provider
      ),
    });
  };

  const moveFallbackProvider = (index: number, direction: -1 | 1) => {
    if (!settings) return;
    const target = index + direction;
    if (target < 0 || target >= settings.aiFallbackProviders.length) return;
    const providers = [...settings.aiFallbackProviders];
    [providers[index], providers[target]] = [providers[target], providers[index]];
    setSettings({ ...settings, aiFallbackProviders: providers });
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaveError(null);
    if (settings.enableAI) {
      if (!settings.aiPrimaryProviderName.trim() || !settings.aiApiKey.trim() || !settings.aiModel.trim()) {
        setSaveError('请完整填写主服务商名称、API Key 和模型名称');
        return;
      }
      if (!isValidEndpoint(settings.aiApiEndpoint.trim())) {
        setSaveError('主服务商 API 地址必须是有效的 HTTP(S) 地址');
        return;
      }
      const invalidFallback = settings.aiFallbackProviders.find(provider =>
        provider.enabled && (
          !provider.name.trim() ||
          !provider.apiKey.trim() ||
          !provider.model.trim() ||
          !isValidEndpoint(provider.endpoint.trim())
        )
      );
      if (invalidFallback) {
        setSaveError('请完整填写所有已启用备用服务商的名称、API 地址、API Key 和模型');
        return;
      }
    }
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

          {/* Auto Fetch Full Content */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('settings.autoFetchFullContent')}
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('settings.autoFetchFullContentDesc')}
              </p>
            </div>
            <input
              type="checkbox"
              checked={settings.autoFetchFullContent ?? true}
              onChange={(e) =>
                setSettings({ ...settings, autoFetchFullContent: e.target.checked })
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
          <div id="translation-settings" className="scroll-mt-6 border-t border-gray-200 dark:border-gray-800 pt-6">
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

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">正文翻译方式</label>
                  <select value={settings.bodyTranslationProvider} onChange={(e) => setSettings({ ...settings, bodyTranslationProvider: e.target.value as Settings['bodyTranslationProvider'] })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800">
                    <option value="ai">AI 分段翻译</option>
                    <option value="google">Google 机翻</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">默认阅读视图</label>
                  <select value={settings.defaultTranslationView} onChange={(e) => setSettings({ ...settings, defaultTranslationView: e.target.value as Settings['defaultTranslationView'] })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800">
                    <option value="original">原文</option>
                    <option value="translated">中译</option>
                    <option value="bilingual">双语对照</option>
                  </select>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">自动翻译英文标题</label>
                    <p className="text-xs text-gray-500 dark:text-gray-400">只处理最近加载且尚未翻译的英文标题。</p>
                  </div>
                  <input type="checkbox" checked={settings.aiAutoTranslateTitles} onChange={(e) => setSettings({ ...settings, aiAutoTranslateTitles: e.target.checked })} className="w-4 h-4" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">标题翻译批量上限</label>
                  <Input type="number" min="1" max="40" value={settings.aiTitleTranslationBatchLimit} onChange={(e) => setSettings({ ...settings, aiTitleTranslationBatchLimit: Math.max(1, Math.min(40, Number(e.target.value) || 40)) })} />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">长期关注点</label>
                  <textarea
                    value={settings.attentionTopics.join('\n')}
                    onChange={(e) => setSettings({ ...settings, attentionTopics: e.target.value.split('\n').map(item => item.trim()).filter(Boolean).slice(0, 20) })}
                    rows={5}
                    placeholder={'每行一个关注问题，例如：\nAI Coding 如何提升真实开发效率\n个人开发者如何验证产品需求'}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">最多 20 项。生成个性化推荐时会发送给你配置的 AI 接口。</p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"><input type="checkbox" checked={settings.showAttentionHighlights} onChange={(e) => setSettings({ ...settings, showAttentionHighlights: e.target.checked })} />显示 AI 重点高亮</label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"><input type="checkbox" checked={settings.showArticleQuality} onChange={(e) => setSettings({ ...settings, showArticleQuality: e.target.checked })} />显示文章质量依据</label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"><input type="checkbox" checked={settings.showRecommendationReasons} onChange={(e) => setSettings({ ...settings, showRecommendationReasons: e.target.checked })} />显示个性化推荐理由</label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"><input type="checkbox" checked={settings.aiAutoAnalyzeOnOpen} onChange={(e) => setSettings({ ...settings, aiAutoAnalyzeOnOpen: e.target.checked })} />打开文章时自动分析</label>
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
              <div className="space-y-5">
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-4">
                  <h3 className="font-medium text-gray-900 dark:text-gray-100">主服务商</h3>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">服务商名称</label>
                    <Input
                      value={settings.aiPrimaryProviderName}
                      onChange={(e) => setSettings({ ...settings, aiPrimaryProviderName: e.target.value })}
                      placeholder="Saturday"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">API 地址</label>
                    <Input
                      value={settings.aiApiEndpoint}
                      onChange={(e) => setSettings({ ...settings, aiApiEndpoint: e.target.value })}
                      placeholder="https://api.openai.com/v1"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">API Key</label>
                    <Input
                      type="password"
                      value={settings.aiApiKey}
                      onChange={(e) => setSettings({ ...settings, aiApiKey: e.target.value })}
                      placeholder="sk-..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">模型名称</label>
                    <Input
                      value={settings.aiModel}
                      onChange={(e) => setSettings({ ...settings, aiModel: e.target.value })}
                      placeholder="gpt-5.6-terra"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-gray-900 dark:text-gray-100">备用服务商（可选）</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400">主服务临时不可用时，按列表顺序尝试。</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSettings({
                        ...settings,
                        aiFallbackProviders: [
                          ...settings.aiFallbackProviders,
                          {
                            id: crypto.randomUUID(),
                            name: '',
                            endpoint: '',
                            apiKey: '',
                            model: '',
                            enabled: true,
                          },
                        ],
                      })}
                    >
                      <Plus className="w-4 h-4 mr-1" />添加
                    </Button>
                  </div>

                  {settings.aiFallbackProviders.length === 0 && (
                    <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-4 text-sm text-gray-500 dark:text-gray-400">
                      未配置备用服务商，主服务失败时会直接返回错误。
                    </div>
                  )}

                  {settings.aiFallbackProviders.map((provider, index) => (
                    <div key={provider.id} className={`rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3 ${provider.enabled ? '' : 'opacity-60'}`}>
                      <div className="flex items-center justify-between gap-3">
                        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                          <input
                            type="checkbox"
                            checked={provider.enabled}
                            onChange={(e) => updateFallbackProvider(provider.id, { enabled: e.target.checked })}
                            className="w-4 h-4"
                          />
                          备用 {index + 1}
                        </label>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={index === 0}
                            onClick={() => moveFallbackProvider(index, -1)}
                            className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 dark:hover:text-gray-200"
                            aria-label="上移"
                          ><ArrowUp className="w-4 h-4" /></button>
                          <button
                            type="button"
                            disabled={index === settings.aiFallbackProviders.length - 1}
                            onClick={() => moveFallbackProvider(index, 1)}
                            className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 dark:hover:text-gray-200"
                            aria-label="下移"
                          ><ArrowDown className="w-4 h-4" /></button>
                          <button
                            type="button"
                            onClick={() => setSettings({
                              ...settings,
                              aiFallbackProviders: settings.aiFallbackProviders.filter(item => item.id !== provider.id),
                            })}
                            className="p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400"
                            aria-label="删除"
                          ><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                      <Input
                        value={provider.name}
                        onChange={(e) => updateFallbackProvider(provider.id, { name: e.target.value })}
                        placeholder="服务商名称"
                      />
                      <Input
                        value={provider.endpoint}
                        onChange={(e) => updateFallbackProvider(provider.id, { endpoint: e.target.value })}
                        placeholder="https://example.com/v1"
                      />
                      <Input
                        type="password"
                        value={provider.apiKey}
                        onChange={(e) => updateFallbackProvider(provider.id, { apiKey: e.target.value })}
                        placeholder="API Key"
                      />
                      <Input
                        value={provider.model}
                        onChange={(e) => updateFallbackProvider(provider.id, { model: e.target.value })}
                        placeholder="模型名称"
                      />
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">获取新文章时自动生成摘要</label>
                  <input
                    type="checkbox"
                    checked={settings.aiAutoSummarize}
                    onChange={(e) => setSettings({ ...settings, aiAutoSummarize: e.target.checked })}
                    className="w-4 h-4"
                  />
                </div>

                <p className="text-xs text-gray-500 dark:text-gray-400">
                  网络错误、超时、限流、服务端错误或无效响应会切换到备用服务；鉴权和请求配置错误不会切换。API Key 仅存储在本地 IndexedDB，并只发送到对应的 API 地址。
                </p>
              </div>
            )}
          </div>

          {/* Save Button */}
          <div className="pt-4">
            {saveError && (
              <p className="mb-3 text-sm text-red-600 dark:text-red-400">{saveError}</p>
            )}
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
