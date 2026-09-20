import { useMemo, useSyncExternalStore } from 'react';

const MOBILE_QUERY = '(max-width: 767px)';

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
