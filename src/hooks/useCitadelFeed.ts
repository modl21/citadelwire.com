import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

/** The pubkey for CITADEL WIRE */
export const CITADEL_PUBKEY = '01d077c7b21bfee89a6883edabcd408ef324e9ab431f46bf57d5860430bcb97c';

export function useCitadelFeed() {
  const { nostr } = useNostr();

  return useQuery<NostrEvent[]>({
    queryKey: ['citadel-feed'],
    queryFn: async () => {
      const events = await nostr.query([
        {
          kinds: [1],
          authors: [CITADEL_PUBKEY],
          limit: 50,
        },
      ]);

      // Sort chronologically — newest first
      return events.sort((a, b) => b.created_at - a.created_at);
    },
    staleTime: 60 * 1000, // 1 minute
    retry: 3,
  });
}
