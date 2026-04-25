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

  return useQuery<NostrEvent[]>({
    queryKey: ['citadel-feed', CITADEL_FEED_RELAYS],
    queryFn: async () => {
      const relayGroup = nostr.group(CITADEL_FEED_RELAYS);
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
    retry: 3,
  });
}
