import React, { useState } from 'react';
import { RefreshCw, Settings, Search, Upload, HardDrive } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ImportExportDialog } from '@/components/feed/ImportExportDialog';
import { StorageManagementDialog } from '@/components/feed/StorageManagementDialog';
import { useAppStore } from '@/store';

export const Toolbar: React.FC = () => {
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
            title="刷新"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex-1 max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="搜索文章"
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
            onClick={() => setShowStorageDialog(true)}
            title="存储空间管理"
          >
            <HardDrive className="w-4 h-4" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowImportDialog(true)}
            title="导入/导出"
          >
            <Upload className="w-4 h-4" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => chrome.runtime.openOptionsPage()}
            title="设置"
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
