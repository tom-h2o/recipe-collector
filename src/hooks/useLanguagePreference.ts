import { useState, useCallback } from 'react';

const STORAGE_KEY = 'recipeLanguages';

export function useLanguagePreference() {
  const [recipeLanguages, setRecipeLanguagesState] = useState<Record<string, string>>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      // Support old format: a plain string (single global language)
      if (stored && !stored.startsWith('{')) return {};
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  const setRecipeLanguage = useCallback((recipeId: string, lang: string | null) => {
    setRecipeLanguagesState((prev) => {
      const next = { ...prev };
      if (lang) {
        next[recipeId] = lang;
      } else {
        delete next[recipeId];
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, []);

  return { recipeLanguages, setRecipeLanguage };
}
