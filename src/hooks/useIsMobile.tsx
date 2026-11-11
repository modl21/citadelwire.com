import { useMemo, useSyncExternalStore } from 'react';

// Treat a viewport as mobile only in portrait. A landscape viewport that is
// at least 640px wide — e.g. a foldable's inside screen rotated landscape —
// has enough horizontal room for the desktop layout, so don't serve it the
// mobile UI (bottom sheets, single-row previews, etc.).
const MOBILE_QUERY = '(max-width: 767px) and (orientation: portrait), (max-width: 639px)';

interface MediaQueryStore {
  subscribe: (callback: () => void) => () => void;
  getSnapshot: () => boolean;
}

// All consumers of a query share one native listener. No resize/scroll polling.
const mediaQueryStores = new Map<string, MediaQueryStore>();
const getServerSnapshot = () => false;

function getMediaQueryStore(query: string): MediaQueryStore {
  const existing = mediaQueryStores.get(query);
  if (existing) return existing;

  let media: MediaQueryList | undefined;
  const listeners = new Set<() => void>();
  const getMedia = () => {
    if (!media && typeof window !== 'undefined') media = window.matchMedia(query);
    return media;
  };
  const notify = () => listeners.forEach((listener) => listener());
  const store: MediaQueryStore = {
    subscribe(callback) {
      if (listeners.size === 0) getMedia()?.addEventListener('change', notify);
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
        if (listeners.size === 0) {
          media?.removeEventListener('change', notify);
          media = undefined;
        }
      };
    },
    getSnapshot: () => getMedia()?.matches ?? false,
  };
  mediaQueryStores.set(query, store);
  return store;
}

/** Subscribe only to breakpoint changes, rather than every window resize. */
export function useMediaQuery(query: string): boolean {
  const store = useMemo(() => getMediaQueryStore(query), [query]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, getServerSnapshot);
}

export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY);
}
