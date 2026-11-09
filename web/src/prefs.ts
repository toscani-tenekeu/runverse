import { useSyncExternalStore } from 'react';
import { load, save } from './storage';

// Editor preferences, shared by the editor and the settings dialog and remembered between visits.
export interface EditorPrefs { fontSize: number; wrap: boolean }

const KEY = 'rv-prefs';
export const FONT_MIN = 11;
export const FONT_MAX = 24;
const DEFAULTS: EditorPrefs = { fontSize: 14, wrap: false };

const clampSize = (n: number) => Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(n)));

let current: EditorPrefs = (() => {
  const stored = load<Partial<EditorPrefs>>(KEY);
  return { fontSize: clampSize(stored?.fontSize ?? DEFAULTS.fontSize), wrap: stored?.wrap ?? DEFAULTS.wrap };
})();
const listeners = new Set<() => void>();

export function setPrefs(change: Partial<EditorPrefs>) {
  current = { ...current, ...change, fontSize: clampSize(change.fontSize ?? current.fontSize) };
  save(KEY, current);
  listeners.forEach(l => l());
}

export const useEditorPrefs = () =>
  useSyncExternalStore(
    cb => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => current,
  );
