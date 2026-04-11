import React from 'react';
import ReactDOM from 'react-dom/client';
import { MainLayout } from '@/components/layout/MainLayout';
import '@/index.css';
import { initializeSettings } from '@/lib/storage/db';
import '@/lib/i18n'; // initialize i18n and cross-tab language sync

initializeSettings().catch(console.error);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MainLayout />
  </React.StrictMode>
);
