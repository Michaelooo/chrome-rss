import React, { useEffect } from 'react';
import { useAppStore } from '@/store';
import { Sidebar } from './Sidebar';
import { ArticleList } from './ArticleList';
import { ArticleReader } from './ArticleReader';
import { DigestView } from './DigestView';
import { Toolbar } from './Toolbar';

export const MainLayout: React.FC = () => {
  const { loadFeeds, loadFolders, loadSettings, uiState } = useAppStore();

  useEffect(() => {
    loadFeeds();
    loadFolders();
    loadSettings();
  }, [loadFeeds, loadFolders, loadSettings]);

  const articleListWidth = Math.max(360, uiState.articleListWidth || 0);

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <Toolbar />

      <div className="flex-1 flex overflow-hidden">
        <div
          className="border-r border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/80"
          style={{ width: uiState.sidebarWidth }}
        >
          <Sidebar />
        </div>

        {uiState.specialView === 'digest' ? (
          <div className="flex-1 bg-white dark:bg-gray-900">
            <DigestView />
          </div>
        ) : (
          <>
            <div
              className="border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex-shrink-0"
              style={{ width: articleListWidth, minWidth: 320 }}
            >
              <ArticleList />
            </div>

            <div className="flex-1 bg-white dark:bg-gray-900">
              <ArticleReader />
            </div>
          </>
        )}
      </div>
    </div>
  );
};
