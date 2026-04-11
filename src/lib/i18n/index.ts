import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zh from './zh.json';
import en from './en.json';

const LANG_KEY = 'rss-reader-language';

export type AppLanguage = 'zh' | 'en';

export function getStoredLanguage(): AppLanguage {
  const stored = localStorage.getItem(LANG_KEY);
  return (stored === 'en' ? 'en' : 'zh') as AppLanguage;
}

export function setStoredLanguage(lang: AppLanguage): void {
  localStorage.setItem(LANG_KEY, lang);
}

i18n.use(initReactI18next).init({
  resources: {
    zh: { translation: zh },
    en: { translation: en },
  },
  lng: getStoredLanguage(),
  fallbackLng: 'zh',
  interpolation: {
    escapeValue: false,
  },
});

// Keep language in sync across tabs: when options page writes to localStorage,
// other open pages (main, popup) hear the storage event and switch immediately.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === LANG_KEY && event.newValue) {
      const lang: AppLanguage = event.newValue === 'en' ? 'en' : 'zh';
      if (lang !== i18n.language) {
        i18n.changeLanguage(lang);
      }
    }
  });
}

export default i18n;
