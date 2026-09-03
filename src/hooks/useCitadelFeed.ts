import { useEffect, useMemo, useRef } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
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
  'wss://relay.damus.io',
  'wss://antiprimal.net',
];

export const CITADEL_FEED_LIMIT = 2400;

export type PostType = 'standard' | 'live-wire' | 'code-wire' | 'daily-wire' | 'weekly-wire' | 'forward-wire';

export function getPostType(event: NostrEvent): PostType {
  const tags = event.tags.map((tag) => tag[1]?.toLowerCase()).filter(Boolean);
  const firstLine = event.content.split('\n')[0]?.toLowerCase() ?? '';
  const contentStart = event.content.trimStart().toLowerCase();

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

export function useCitadelFeed() {
  const { nostr } = useNostr();

  const relayGroup = useMemo(() => nostr.group(CITADEL_FEED_RELAYS), [nostr]);

  const query = useQuery<NostrEvent[]>({
    queryKey: ['citadel-feed', CITADEL_FEED_RELAYS],
    queryFn: async () => {
      const [cachedPosts, cachedState] = await Promise.all([
        readCachedCitadelPosts(),
        readCachedCitadelFeedState(),
      ]);
      const newestCachedAt = cachedPosts[0]?.created_at;
      const shouldIncrementalSync = typeof newestCachedAt === 'number' && cachedState?.hasFullHistory === true;

      const events = await relayGroup.query([
        {
          kinds: [1],
          authors: [CITADEL_PUBKEY],
          ...(shouldIncrementalSync ? { since: newestCachedAt + 1 } : { limit: CITADEL_FEED_LIMIT }),
        },
      ]);

      const mergedEvents = new Map<string, NostrEvent>();
      if (shouldIncrementalSync) {
        for (const event of cachedPosts) mergedEvents.set(event.id, event);
      }
      for (const event of events) mergedEvents.set(event.id, event);

      // Sort chronologically — newest first
      const sortedEvents = Array.from(mergedEvents.values())
        .sort((a, b) => b.created_at - a.created_at)
        .slice(0, CITADEL_FEED_LIMIT);
      await writeCachedCitadelPosts(sortedEvents, true);
      return sortedEvents;
    },
    placeholderData: (previousData) => previousData,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 10 * 60 * 1000,
    retry: 1,
    refetchOnMount: false,
  });

  const newestSeenAtRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const newestCreatedAt = query.data?.[0]?.created_at;
    if (newestCreatedAt) {
      newestSeenAtRef.current = Math.max(newestSeenAtRef.current ?? 0, newestCreatedAt);
    }
  }, [query.data]);

  useEffect(() => {
    const newestSeenAt = newestSeenAtRef.current;
    if (!newestSeenAt) return;

    const subscription = relayGroup.req([
      {
        kinds: [1],
        authors: [CITADEL_PUBKEY],
        since: newestSeenAt + 1,
      },
    ]);
    let isActive = true;

    void (async () => {
      try {
        for await (const msg of subscription) {
          if (!isActive) break;
          if (msg[0] !== 'EVENT') continue;

          const event = msg[2];
          if (event.kind !== 1 || event.pubkey !== CITADEL_PUBKEY) continue;
          if (event.created_at <= (newestSeenAtRef.current ?? 0)) continue;

          newestSeenAtRef.current = event.created_at;
          window.location.reload();
          break;
        }
      } catch (error) {
        if (isActive) {
          console.warn('Citadel feed live subscription failed', error);
        }
      }
    })();

    return () => {
      isActive = false;
      try {
        subscription.close();
      } catch (error) {
        console.warn('Citadel feed live subscription cleanup failed', error);
      }
    };
  }, [relayGroup, query.data]);

  return query;
}
