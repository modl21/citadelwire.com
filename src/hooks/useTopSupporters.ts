import type { NostrEvent } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { CITADEL_PUBKEY } from '@/hooks/useCitadelFeed';

export interface Supporter {
  pubkey: string;
  totalSats: number;
  latestAt: number;
}

/** Pubkeys excluded from the supporters list. */
const EXCLUDED_PUBKEYS = new Set([
  'a341f45ff9758f570a21b000c17d4e53a3a497c8397f26c0e6d61e5acffc7a98', // Michael Saylor
  CITADEL_PUBKEY, // Don't show the recipient as a supporter of themselves
]);

/** Extract the sender pubkey from a kind 9735 zap receipt. */
function getZapSender(event: NostrEvent): string | null {
  // First try the P tag (uppercase P = sender pubkey per NIP-57)
  const bigPTag = event.tags.find(([name]) => name === 'P')?.[1];
  if (bigPTag && /^[0-9a-f]{64}$/.test(bigPTag)) {
    return bigPTag;
  }

  // Fall back to parsing the embedded zap request from the description tag
  const descriptionTag = event.tags.find(([name]) => name === 'description')?.[1];
  if (descriptionTag) {
    try {
      const zapRequest = JSON.parse(descriptionTag);
      if (zapRequest.pubkey && /^[0-9a-f]{64}$/.test(zapRequest.pubkey)) {
        return zapRequest.pubkey;
      }
    } catch {
      // Invalid JSON, skip
    }
  }

  return null;
}

/** Extract the amount in sats from a kind 9735 zap receipt. */
function getZapAmount(event: NostrEvent): number | null {
  // Try the amount tag first (millisats as string)
  const amountTag = event.tags.find(([name]) => name === 'amount')?.[1];
  if (amountTag) {
    const msats = Number.parseInt(amountTag, 10);
    if (Number.isSafeInteger(msats) && msats > 0) {
      return Math.floor(msats / 1000);
    }
  }

  // Fall back to parsing the bolt11 invoice for the amount
  const bolt11 = event.tags.find(([name]) => name === 'bolt11')?.[1];
  if (bolt11) {
    return parseBolt11Amount(bolt11);
  }

  // Last resort: check the zap request's amount tag
  const descriptionTag = event.tags.find(([name]) => name === 'description')?.[1];
  if (descriptionTag) {
    try {
      const zapRequest = JSON.parse(descriptionTag);
      const reqAmount = zapRequest.tags?.find((t: string[]) => t[0] === 'amount')?.[1];
      if (reqAmount) {
        const msats = Number.parseInt(reqAmount, 10);
        if (Number.isSafeInteger(msats) && msats > 0) {
          return Math.floor(msats / 1000);
        }
      }
    } catch {
      // Invalid JSON, skip
    }
  }

  return null;
}

/** Parse amount in sats from a bolt11 invoice string. */
function parseBolt11Amount(bolt11: string): number | null {
  const lower = bolt11.toLowerCase();
  // bolt11 format: lnbc<amount><multiplier>1...
  const match = lower.match(/^lnbc(\d+)([munp]?)/);
  if (!match) return null;

  const value = Number.parseInt(match[1], 10);
  if (!Number.isSafeInteger(value) || value <= 0) return null;

  const multiplier = match[2];
  switch (multiplier) {
    case 'm': return value * 100000; // milli-BTC → sats
    case 'u': return value * 100;    // micro-BTC → sats
    case 'n': return Math.floor(value / 10); // nano-BTC → sats
    case 'p': return Math.floor(value / 10000); // pico-BTC → sats
    case '': return value * 100000000; // whole BTC → sats
    default: return null;
  }
}

function aggregateZapSupporters(events: NostrEvent[]): Supporter[] {
  const map = new Map<string, { totalSats: number; latestAt: number }>();

  for (const event of events) {
    if (event.kind !== 9735) continue;

    const sender = getZapSender(event);
    if (!sender) continue;
    if (EXCLUDED_PUBKEYS.has(sender)) continue;

    const sats = getZapAmount(event);
    if (!sats || sats <= 0) continue;

    const existing = map.get(sender);
    if (existing) {
      existing.totalSats += sats;
      if (event.created_at > existing.latestAt) {
        existing.latestAt = event.created_at;
      }
    } else {
      map.set(sender, { totalSats: sats, latestAt: event.created_at });
    }
  }

  return Array.from(map.entries())
    .map(([pubkey, data]) => ({ pubkey, ...data }))
    .sort((a, b) => b.totalSats - a.totalSats);
}

export function useTopSupporters(limit: number = 10) {
  const { nostr } = useNostr();

  return useQuery<Supporter[]>({
    queryKey: ['top-supporters', CITADEL_PUBKEY],
    queryFn: async () => {
      const events = await nostr.query([
        {
          kinds: [9735],
          '#p': [CITADEL_PUBKEY],
          limit: 500,
        },
      ]);

      return aggregateZapSupporters(events).slice(0, limit);
    },
    staleTime: 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
    retry: 1,
  });
}
