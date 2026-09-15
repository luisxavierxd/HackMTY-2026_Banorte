import { useState, useEffect } from 'react';

export type Theme = 'dark' | 'light';

function getStored(): Theme {
  try {
    const v = localStorage.getItem('bn-theme');
    if (v === 'light' || v === 'dark') return v;
  } catch {}
  return 'dark';
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const t = getStored();
    document.documentElement.setAttribute('data-theme', t);
    return t;
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('bn-theme', theme); } catch {}
  }, [theme]);

  const toggle = () => setTheme(t => t === 'dark' ? 'light' : 'dark');
  return { theme, toggle };
}
