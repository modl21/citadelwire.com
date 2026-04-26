import { useEffect, useMemo, useRef } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

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

export function useCitadelFeed() {
  const { nostr } = useNostr();

  const relayGroup = useMemo(() => nostr.group(CITADEL_FEED_RELAYS), [nostr]);

  const query = useQuery<NostrEvent[]>({
    queryKey: ['citadel-feed', CITADEL_FEED_RELAYS],
    queryFn: async () => {
      const events = await relayGroup.query([
        {
          kinds: [1],
          authors: [CITADEL_PUBKEY],
          limit: 100,
        },
      ]);

      // Sort chronologically — newest first
      return events.sort((a, b) => b.created_at - a.created_at);
    },
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
      subscription.close();
    };
  }, [relayGroup, query.data]);

  return query;
}
