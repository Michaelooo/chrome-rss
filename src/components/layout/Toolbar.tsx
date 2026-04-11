import React, { useState } from 'react';
import { RefreshCw, Settings, Search, Upload, HardDrive } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ImportExportDialog } from '@/components/feed/ImportExportDialog';
import { StorageManagementDialog } from '@/components/feed/StorageManagementDialog';
import { useAppStore } from '@/store';

export const Toolbar: React.FC = () => {
  const { t } = useTranslation();
  const { uiState, setUIState, loadFeeds, loadFolders } = useAppStore();
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showStorageDialog, setShowStorageDialog] = useState(false);

  const handleRefresh = () => {
    loadFeeds();
  };

  const handleImportCompleted = () => {
    loadFeeds();
    loadFolders();
  };

  return (
    <>
      <div className="h-14 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex items-center px-4 gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            title={t('toolbar.refresh')}
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex-1 max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder={t('toolbar.searchPlaceholder')}
              value={uiState.searchQuery}
              onChange={(e) => setUIState({ searchQuery: e.target.value })}
              className="pl-10"
            />
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setUIState({ filterBy: 'unread' })}
            title={t('toolbar.showUnread')}
            className={uiState.filterBy === 'unread' ? 'bg-gray-100 dark:bg-gray-800 text-blue-600 dark:text-blue-400' : ''}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
              <circle cx="18.5" cy="5.5" r="3" fill="currentColor" stroke="none"/>
            </svg>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setUIState({ filterBy: 'all' })}
            title={t('toolbar.showAll')}
            className={uiState.filterBy === 'all' ? 'bg-gray-100 dark:bg-gray-800 text-blue-600 dark:text-blue-400' : ''}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowStorageDialog(true)}
            title={t('toolbar.storageManagement')}
          >
            <HardDrive className="w-4 h-4" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowImportDialog(true)}
            title={t('toolbar.importExport')}
          >
            <Upload className="w-4 h-4" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => chrome.runtime.openOptionsPage()}
            title={t('toolbar.settings')}
          >
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <ImportExportDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        onCompleted={handleImportCompleted}
      />

      <StorageManagementDialog
        open={showStorageDialog}
        onOpenChange={setShowStorageDialog}
        onCompleted={handleImportCompleted}
      />
    </>
  );
};
