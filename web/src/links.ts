import { useCallback, useEffect, useState } from 'react';
import { load, save } from './storage';

// Share links created from this browser. The token is what allows deleting a link early.
export interface SharedLink { id: string; language: string; expiresAt: number; token: string }

const KEY = 'rv-links';
const EVENT = 'rv-links-change';

const active = () => (load<SharedLink[]>(KEY) ?? []).filter(l => l.expiresAt > Date.now());

export function rememberLink(link: SharedLink) {
  save(KEY, [link, ...active().filter(l => l.id !== link.id)]);
  dispatchEvent(new Event(EVENT));
}

export function forgetLink(id: string) {
  save(KEY, active().filter(l => l.id !== id));
  dispatchEvent(new Event(EVENT));
}

export const linkUrl = (id: string) => `${location.origin}/s/${id}`;

export function useSharedLinks() {
  const [links, setLinks] = useState(active);
  const refresh = useCallback(() => setLinks(active()), []);
  useEffect(() => {
    addEventListener(EVENT, refresh);
    addEventListener('storage', refresh);
    return () => { removeEventListener(EVENT, refresh); removeEventListener('storage', refresh); };
  }, [refresh]);
  return links;
}
