import { useState, useCallback } from 'react';

const STORAGE_KEY = 'preferredLanguage';

export function useLanguagePreference() {
  const [preferredLanguage, setPreferredLanguageState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });

  const setPreferredLanguage = useCallback((lang: string | null) => {
    setPreferredLanguageState(lang);
    try {
      if (lang) {
        localStorage.setItem(STORAGE_KEY, lang);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  return { preferredLanguage, setPreferredLanguage };
}
