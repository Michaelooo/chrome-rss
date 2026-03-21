import React, { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '@/store';
import { Sidebar } from './Sidebar';
import { ArticleList } from './ArticleList';
import { ArticleReader } from './ArticleReader';
import { Toolbar } from './Toolbar';
import i18n, { setStoredLanguage } from '@/lib/i18n';

const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 480;
const ARTICLE_LIST_MIN = 280;
const ARTICLE_LIST_MAX = 700;

export const MainLayout: React.FC = () => {
  const { loadFeeds, loadFolders, loadSettings, uiState, settings, setUIState } = useAppStore();

  useEffect(() => {
    loadFeeds();
    loadFolders();
    loadSettings();
  }, [loadFeeds, loadFolders, loadSettings]);

  // Sync i18n to the language stored in DB settings (handles first load and
  // cases where DB and localStorage are out of sync).
  useEffect(() => {
    if (settings?.language && settings.language !== i18n.language) {
      i18n.changeLanguage(settings.language);
      setStoredLanguage(settings.language);
    }
  }, [settings?.language]);

  const articleListWidth = Math.max(ARTICLE_LIST_MIN, uiState.articleListWidth || 0);
  const sidebarWidth = Math.max(SIDEBAR_MIN, uiState.sidebarWidth || 0);

  const dragging = useRef<{ type: 'sidebar' | 'articleList'; startX: number; startWidth: number } | null>(null);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging.current) return;
    const delta = e.clientX - dragging.current.startX;
    if (dragging.current.type === 'sidebar') {
      const newWidth = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, dragging.current.startWidth + delta));
      setUIState({ sidebarWidth: newWidth });
    } else {
      const newWidth = Math.min(ARTICLE_LIST_MAX, Math.max(ARTICLE_LIST_MIN, dragging.current.startWidth + delta));
      setUIState({ articleListWidth: newWidth });
    }
  }, [setUIState]);

  const onMouseUp = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  const startDrag = useCallback((type: 'sidebar' | 'articleList', startX: number, startWidth: number) => {
    dragging.current = { type, startX, startWidth };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <Toolbar />

      <div className="flex-1 flex overflow-hidden">
        <div
          className="bg-gray-50/80 dark:bg-gray-900/80 flex-shrink-0"
          style={{ width: sidebarWidth }}
        >
          <Sidebar />
        </div>

        {/* Sidebar resize handle */}
        <div
          className="flex-shrink-0 cursor-col-resize bg-gray-200 dark:bg-gray-800 hover:bg-blue-400 dark:hover:bg-blue-600 active:bg-blue-500 transition-colors"
          style={{ width: 2 }}
          onMouseDown={(e) => {
            e.preventDefault();
            startDrag('sidebar', e.clientX, sidebarWidth);
          }}
        />

        <div
          className="bg-white dark:bg-gray-900 flex-shrink-0"
          style={{ width: articleListWidth }}
        >
          <ArticleList />
        </div>

        {/* ArticleList resize handle */}
        <div
          className="flex-shrink-0 cursor-col-resize bg-gray-200 dark:bg-gray-800 hover:bg-blue-400 dark:hover:bg-blue-600 active:bg-blue-500 transition-colors"
          style={{ width: 2 }}
          onMouseDown={(e) => {
            e.preventDefault();
            startDrag('articleList', e.clientX, articleListWidth);
          }}
        />

        <div className="flex-1 bg-white dark:bg-gray-900 min-w-0">
          <ArticleReader />
        </div>
      </div>
    </div>
  );
};
