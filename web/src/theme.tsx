import { useState } from 'react';
import { save } from './storage';

// Same storage key as the landing page, so the choice carries over between them.
const KEY = 'rv-theme';

const systemDark = () => matchMedia('(prefers-color-scheme: dark)').matches;

export function useTheme() {
  const [dark, setDark] = useState(() => {
    const t = document.documentElement.dataset.theme;
    return t ? t === 'dark' : systemDark();
  });

  const setTheme = (next: 'light' | 'dark') => {
    document.documentElement.dataset.theme = next;
    save(KEY, next);
    setDark(next === 'dark');
  };

  return { dark, setTheme };
}
