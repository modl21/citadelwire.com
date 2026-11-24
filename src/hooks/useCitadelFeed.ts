import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { readCachedCitadelFeedState, readCachedCitadelPosts, writeCachedCitadelPosts } from '@/lib/citadelFeedStore';

/** The pubkey for CITADEL WIRE */
export const CITADEL_PUBKEY = '01d077c7b21bfee89a6883edabcd408ef324e9ab431f46bf57d5860430bcb97c';

/**
 * Relays that are known to carry CITADEL WIRE posts.
 *
 * Some posts are only visible on Primal's premium relay, so the fixed wire feed
 * should not depend solely on the visitor's personal relay list.
 */
export const CITADEL_FEED_RELAYS = [
  'wss://premium.primal.net',
  'wss://relay.primal.net',
  'wss://relay.ditto.pub',
  'wss://nos.lol',
  'wss://antiprimal.net',
];

/** Single relay REQ page size (most Nostr relays cap single-filter limits at 500). */
export const CITADEL_RELAY_PAGE_SIZE = 500;

/** Target number of wires auto-backfilled in the background and persisted in IndexedDB. */
export const CITADEL_FEED_LIMIT = 2000;

export type PostType = 'standard' | 'live-wire' | 'code-wire' | 'daily-wire' | 'weekly-wire' | 'forward-wire' | 'editor-wire';

export function getPostType(event: NostrEvent): PostType {
  const tags = event.tags.map((tag) => tag[1]?.toLowerCase()).filter(Boolean);
  const firstLine = event.content.split('\n')[0]?.toLowerCase() ?? '';
  const contentStart = event.content.trimStart().toLowerCase();

  // Editor wires are detected first so they take classification precedence.
  if (
    tags.includes('editor-wire') ||
    tags.includes('editorwire') ||
    firstLine.includes('editor wire') ||
    firstLine.includes('editorwire') ||
    contentStart.startsWith('editor wire') ||
    contentStart.startsWith('editorwire')
  ) {
    return 'editor-wire';
  }

  if (
    tags.includes('daily-wire') ||
    tags.includes('dailywire') ||
    firstLine.includes('daily wire') ||
    firstLine.includes('dailywire') ||
    contentStart.startsWith('daily wire') ||
    contentStart.startsWith('dailywire')
  ) {
    return 'daily-wire';
  }

  if (
    tags.includes('weekly-wire') ||
    tags.includes('weeklywire') ||
    firstLine.includes('weekly wire') ||
    firstLine.includes('weeklywire') ||
    contentStart.startsWith('weekly wire') ||
    contentStart.startsWith('weeklywire')
  ) {
    return 'weekly-wire';
  }

  if (
    tags.includes('forward-wire') ||
    tags.includes('forwardwire') ||
    firstLine.includes('forward wire') ||
    firstLine.includes('forwardwire') ||
    contentStart.startsWith('forward wire') ||
    contentStart.startsWith('forwardwire')
  ) {
    return 'forward-wire';
  }

  if (
    tags.includes('code-wire') ||
    tags.includes('codewire') ||
    firstLine.includes('code wire') ||
    firstLine.includes('codewire') ||
    contentStart.startsWith('code wire') ||
    contentStart.startsWith('codewire')
  ) {
    return 'code-wire';
  }

  if (
    tags.includes('live-wire') ||
    tags.includes('livewire') ||
    firstLine.includes('live wire') ||
    firstLine.includes('livewire') ||
    contentStart.startsWith('live wire') ||
    contentStart.startsWith('livewire')
  ) {
    return 'live-wire';
  }

  return 'standard';
}

const FEED_QUERY_KEY = ['citadel-feed', CITADEL_FEED_RELAYS] as const;

function mergeFeedPosts(...sources: NostrEvent[][]): NostrEvent[] {
  const events = new Map<string, NostrEvent>();
  for (const source of sources) {
    for (const event of source) {
      if (event.kind === 1 && event.pubkey === CITADEL_PUBKEY) events.set(event.id, event);
    }
  }
  return Array.from(events.values())
    .sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id));
}

export function useCitadelFeed() {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();
  const hasFullHistoryRef = useRef(false);
  const hasStartedBackfillRef = useRef(false);
  const isLoadingOlderRef = useRef(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const relayGroup = useMemo(() => nostr.group(CITADEL_FEED_RELAYS), [nostr]);

  const query = useQuery<NostrEvent[]>({
    queryKey: FEED_QUERY_KEY,
    queryFn: async ({ signal }) => {
      const [storedPosts, cachedState] = await Promise.all([
        readCachedCitadelPosts(),
        readCachedCitadelFeedState(),
      ]);
      signal.throwIfAborted();
      const cachedPosts = mergeFeedPosts(storedPosts);
      hasFullHistoryRef.current = cachedState?.hasFullHistory === true;

      // Show the local cache immediately, while the same query syncs with relays.
      if (cachedPosts.length && !queryClient.getQueryData(FEED_QUERY_KEY)) {
        queryClient.setQueryData(FEED_QUERY_KEY, cachedPosts);
      }
      const newestCachedAt = cachedPosts[0]?.created_at;
      const shouldIncrementalSync = typeof newestCachedAt === 'number' && hasFullHistoryRef.current;
      const events = await relayGroup.query([
        {
          kinds: [1],
          authors: [CITADEL_PUBKEY],
          // Include the boundary second so simultaneous posts cannot be missed.
          ...(shouldIncrementalSync
            ? { since: newestCachedAt, limit: CITADEL_RELAY_PAGE_SIZE }
            : { limit: CITADEL_RELAY_PAGE_SIZE }),
        },
      ], { signal });
      hasFullHistoryRef.current = true;

      // Keep any live events that arrived while the historical query was running.
      return mergeFeedPosts(cachedPosts, events, queryClient.getQueryData<NostrEvent[]>(FEED_QUERY_KEY) ?? []);
    },
    placeholderData: (previousData) => previousData,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 10 * 60 * 1000,
    retry: 1,
    refetchOnMount: false,
  });

  const fetchOlderPage = useCallback(async (signal?: AbortSignal): Promise<number> => {
    const current = queryClient.getQueryData<NostrEvent[]>(FEED_QUERY_KEY) ?? [];
    const oldest = current[current.length - 1];
    if (!oldest) return 0;

    const events = await relayGroup.query([
      {
        kinds: [1],
        authors: [CITADEL_PUBKEY],
        until: oldest.created_at - 1,
        limit: CITADEL_RELAY_PAGE_SIZE,
      },
    ], { signal: signal ?? AbortSignal.timeout(8000) });

    if (signal?.aborted) return 0;

    const latest = queryClient.getQueryData<NostrEvent[]>(FEED_QUERY_KEY) ?? current;
    const merged = mergeFeedPosts(latest, events);
    const addedCount = merged.length - latest.length;

    if (addedCount > 0) {
      queryClient.setQueryData(FEED_QUERY_KEY, merged);
    } else {
      setHasMoreOlder(false);
    }

    return addedCount;
  }, [queryClient, relayGroup]);

  /** Manually fetch the next 500 older wires from relays on demand. */
  const loadOlderWires = useCallback(async () => {
    if (isLoadingOlderRef.current || !hasMoreOlder) return;
    isLoadingOlderRef.current = true;
    setIsLoadingOlder(true);
    try {
      await fetchOlderPage();
    } catch (error) {
      console.warn('Failed to load older CITADEL WIRE posts', error);
    } finally {
      isLoadingOlderRef.current = false;
      setIsLoadingOlder(false);
    }
  }, [fetchOlderPage, hasMoreOlder]);

  // Quietly backfill older pages in the background until reaching CITADEL_FEED_LIMIT (2,000),
  // once the initial feed has settled and the browser is idle.
  const canBackfill = query.data !== undefined && !query.isFetching;
  useEffect(() => {
    if (!canBackfill || hasStartedBackfillRef.current || !hasMoreOlder) return;
    const initialCount = queryClient.getQueryData<NostrEvent[]>(FEED_QUERY_KEY)?.length ?? 0;
    if (initialCount === 0 || initialCount >= CITADEL_FEED_LIMIT) return;

    hasStartedBackfillRef.current = true;
    const controller = new AbortController();
    let timerId: ReturnType<typeof setTimeout> | undefined;
    let idleId: number | undefined;

    const runBackfill = async () => {
      try {
        while (!controller.signal.aborted) {
          const currentCount = queryClient.getQueryData<NostrEvent[]>(FEED_QUERY_KEY)?.length ?? 0;
          if (currentCount >= CITADEL_FEED_LIMIT) break;

          // Wait if a manual "Load older wires" fetch is already running
          if (isLoadingOlderRef.current) {
            await new Promise((resolve) => setTimeout(resolve, 400));
            continue;
          }

          isLoadingOlderRef.current = true;
          let added = 0;
          try {
            added = await fetchOlderPage(controller.signal);
          } finally {
            isLoadingOlderRef.current = false;
          }

          if (added <= 0 || controller.signal.aborted) break;

          // Brief pause between pages so relay traffic & UI stay completely uncontended
          await new Promise((resolve) => setTimeout(resolve, 350));
        }
      } catch {
        // Ignore background backfill aborts or transient relay errors
      }
    };

    const ric = typeof window !== 'undefined'
      ? (window as Window & {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
        cancelIdleCallback?: (id: number) => void;
      })
      : undefined;

    if (ric?.requestIdleCallback) {
      idleId = ric.requestIdleCallback(() => { void runBackfill(); }, { timeout: 2500 });
    } else {
      timerId = setTimeout(() => { void runBackfill(); }, 1500);
    }

    return () => {
      controller.abort();
      if (timerId !== undefined) clearTimeout(timerId);
      if (idleId !== undefined) ric?.cancelIdleCallback?.(idleId);
    };
  }, [canBackfill, hasMoreOlder, queryClient, fetchOlderPage]);

  // Persist up to CITADEL_FEED_LIMIT newest wires after rendering, coalescing bursts into one write.
  useEffect(() => {
    if (!query.data || query.isFetching) return;
    const postsToCache = query.data.slice(0, CITADEL_FEED_LIMIT);
    const timer = setTimeout(() => {
      void (async () => {
        const hasFullHistory = hasFullHistoryRef.current || (await readCachedCitadelFeedState())?.hasFullHistory === true;
        await writeCachedCitadelPosts(postsToCache, hasFullHistory);
      })();
    }, 250);
    return () => clearTimeout(timer);
  }, [query.data, query.isFetching]);

  const canSubscribe = query.data !== undefined && !query.isFetching;
  useEffect(() => {
    if (!canSubscribe) return;
    const newestSeenAt = queryClient.getQueryData<NostrEvent[]>(FEED_QUERY_KEY)?.[0]?.created_at
      ?? Math.floor(Date.now() / 1000);
    const controller = new AbortController();
    const subscription = relayGroup.req([
      {
        kinds: [1],
        authors: [CITADEL_PUBKEY],
        since: newestSeenAt,
        limit: CITADEL_RELAY_PAGE_SIZE,
      },
    ], { signal: controller.signal });
    let isActive = true;

    void (async () => {
      try {
        for await (const msg of subscription) {
          if (!isActive) break;
          if (msg[0] !== 'EVENT') continue;

          const event = msg[2];
          if (event.kind !== 1 || event.pubkey !== CITADEL_PUBKEY) continue;
          if (event.created_at < newestSeenAt) continue;

          const current = queryClient.getQueryData<NostrEvent[]>(FEED_QUERY_KEY);
          if (current?.some((post) => post.id === event.id)) continue;
          queryClient.setQueryData(FEED_QUERY_KEY, mergeFeedPosts(current ?? [], [event]));

          // Refresh other visible widgets only when their existing freshness
          // windows have expired, rather than downloading everything again.
          void queryClient.refetchQueries({ type: 'active', stale: true });
        }
      } catch (error) {
        if (isActive) {
          console.warn('Citadel feed live subscription failed', error);
        }
      }
    })();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [relayGroup, queryClient, canSubscribe]);

  return {
    ...query,
    loadOlderWires,
    isLoadingOlder,
    hasMoreOlder,
  };
}
