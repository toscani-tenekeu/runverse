import { useSyncExternalStore } from 'react';

const query = '(max-width: 767px)';
const subscribe = (cb: () => void) => {
  const m = matchMedia(query);
  m.addEventListener('change', cb);
  return () => m.removeEventListener('change', cb);
};

/** Phones get a stacked layout instead of side-by-side panels. */
export const useMobile = () => useSyncExternalStore(subscribe, () => matchMedia(query).matches);
