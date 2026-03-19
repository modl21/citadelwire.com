import type { NostrEvent } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { SUPPORTER_KIND, SUPPORTER_SITE_ID } from '@/lib/publishSupporter';

export interface Supporter {
  pubkey: string;
  totalSats: number;
  latestAt: number;
}

function parseAmount(content: string): number | null {
  const trimmed = content.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const amount = Number.parseInt(trimmed, 10);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

/** Pubkeys excluded from the supporters list. */
const EXCLUDED_PUBKEYS = new Set([
  'a341f45ff9758f570a21b000c17d4e53a3a497c8397f26c0e6d61e5acffc7a98', // Michael Saylor
]);

function aggregateSupporters(events: NostrEvent[]): Supporter[] {
  const map = new Map<string, { totalSats: number; latestAt: number }>();

  for (const event of events) {
    const pTag = event.tags.find(([name]) => name === 'p')?.[1];
    if (!pTag || !/^[0-9a-f]{64}$/.test(pTag)) continue;
    if (EXCLUDED_PUBKEYS.has(pTag)) continue;

    const sats = parseAmount(event.content);
    if (!sats) continue;

    const existing = map.get(pTag);
    if (existing) {
      existing.totalSats += sats;
      if (event.created_at > existing.latestAt) {
        existing.latestAt = event.created_at;
      }
    } else {
      map.set(pTag, { totalSats: sats, latestAt: event.created_at });
    }
  }

  return Array.from(map.entries())
    .map(([pubkey, data]) => ({ pubkey, ...data }))
    .sort((a, b) => b.totalSats - a.totalSats);
}

export function useTopSupporters(limit: number = 10) {
  const { nostr } = useNostr();

  return useQuery<Supporter[]>({
    queryKey: ['top-supporters'],
    queryFn: async () => {
      const events = await nostr.query([
        {
          kinds: [SUPPORTER_KIND],
          '#d': [SUPPORTER_SITE_ID],
          limit: 200,
        },
      ]);

      return aggregateSupporters(events).slice(0, limit);
    },
    staleTime: 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
    retry: 1,
  });
}
