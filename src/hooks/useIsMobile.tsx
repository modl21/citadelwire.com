import { useMemo, useSyncExternalStore } from 'react';

// Treat a viewport as mobile only in portrait. A landscape viewport that is
// at least 640px wide — e.g. a foldable's inside screen rotated landscape —
// has enough horizontal room for the desktop layout, so don't serve it the
// mobile UI (bottom sheets, single-row previews, etc.).
const MOBILE_QUERY = '(max-width: 767px) and (orientation: portrait), (max-width: 639px)';

/** Subscribe only to breakpoint changes, rather than every window resize. */
export function useMediaQuery(query: string): boolean {
  const store = useMemo(() => {
    const media = typeof window === 'undefined' ? undefined : window.matchMedia(query);
    return {
      subscribe(callback: () => void) {
        media?.addEventListener('change', callback);
        return () => media?.removeEventListener('change', callback);
      },
      getSnapshot: () => media?.matches ?? false,
    };
  }, [query]);

  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => false);
}

export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY);
}
