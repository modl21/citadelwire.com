import type { NostrEvent } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { CITADEL_PUBKEY } from '@/hooks/useCitadelFeed';

export interface SupporterMetadata {
  name?: string;
  display_name?: string;
  picture: string;
}

export interface Supporter {
  pubkey: string;
  totalSats: number;
  latestAt: number;
  metadata: SupporterMetadata;
}

export const SUPPORTER_TOTAL_KIND = 36497;
export const SUPPORTER_DONATION_KIND = 9703;
export const SUPPORTER_TOTAL_PUBLISHER_PUBKEY = CITADEL_PUBKEY;

const SUPPORTER_TOTAL_RELAYS = [
  'wss://premium.primal.net',
  'wss://relay.primal.net',
  'wss://relay.ditto.pub',
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
  'wss://antiprimal.net',
];

function isHexPubkey(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

function getTagValue(event: NostrEvent, tagName: string): string | undefined {
  return event.tags.find(([name]) => name === tagName)?.[1];
}

function validateSupporterTotalEvent(event: NostrEvent): Supporter | null {
  if (event.kind !== SUPPORTER_TOTAL_KIND) return null;
  if (event.pubkey !== SUPPORTER_TOTAL_PUBLISHER_PUBKEY) return null;

  const d = getTagValue(event, 'd');
  const supporterPubkey = getTagValue(event, 'p');
  if (!isHexPubkey(d) || !isHexPubkey(supporterPubkey) || d !== supporterPubkey) return null;

  const amountTag = getTagValue(event, 'amount');
  if (!amountTag) return null;

  const millisats = Number.parseInt(amountTag, 10);
  if (!Number.isSafeInteger(millisats) || millisats <= 0) return null;

  const picture = getTagValue(event, 'picture');
  if (!picture) return null;

  const metadata: SupporterMetadata = {
    name: getTagValue(event, 'name'),
    display_name: getTagValue(event, 'display_name'),
    picture,
  };

  return {
    pubkey: supporterPubkey,
    totalSats: Math.floor(millisats / 1000),
    latestAt: Number.parseInt(getTagValue(event, 'last_payment_at') ?? String(event.created_at), 10) || event.created_at,
    metadata,
  };
}

function getLatestSupporterTotals(events: NostrEvent[]): Supporter[] {
  const latestByPubkey = new Map<string, NostrEvent>();

  for (const event of events) {
    const supporterPubkey = getTagValue(event, 'p');
    if (!isHexPubkey(supporterPubkey)) continue;

    const current = latestByPubkey.get(supporterPubkey);
    if (!current || event.created_at > current.created_at) {
      latestByPubkey.set(supporterPubkey, event);
    }
  }

  return Array.from(latestByPubkey.values())
    .map(validateSupporterTotalEvent)
    .filter((supporter): supporter is Supporter => supporter !== null)
    .sort((a, b) => b.totalSats - a.totalSats);
}

export function useTopSupporters(limit: number = 10) {
  const { nostr } = useNostr();

  return useQuery<Supporter[]>({
    queryKey: ['top-supporters', SUPPORTER_TOTAL_KIND, SUPPORTER_TOTAL_PUBLISHER_PUBKEY, limit],
    queryFn: async () => {
      const relayGroup = nostr.group(SUPPORTER_TOTAL_RELAYS);
      const events = await relayGroup.query([
        {
          kinds: [SUPPORTER_TOTAL_KIND],
          authors: [SUPPORTER_TOTAL_PUBLISHER_PUBKEY],
          '#t': ['supporter-total'],
          limit: 100,
        },
      ]);

      return getLatestSupporterTotals(events).slice(0, limit);
    },
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchInterval: 60 * 1000,
    retry: 1,
    refetchOnMount: false,
  });
}
