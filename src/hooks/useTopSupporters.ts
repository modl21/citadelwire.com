import { NSchema as n, type NostrEvent, type NostrMetadata } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

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

const SUPPORTER_RELAYS = [
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

function parseMetadata(content: string): NostrMetadata | undefined {
  try {
    return n.json().pipe(n.metadata()).parse(content);
  } catch {
    return undefined;
  }
}

function getSatsFromAmountTag(event: NostrEvent): number | null {
  const amountTag = getTagValue(event, 'amount');
  if (!amountTag) return null;

  const millisats = Number.parseInt(amountTag, 10);
  if (!Number.isSafeInteger(millisats) || millisats <= 0) return null;

  return Math.floor(millisats / 1000);
}

function validateSupporterTotalEvent(event: NostrEvent): Omit<Supporter, 'metadata'> | null {
  if (event.kind !== SUPPORTER_TOTAL_KIND) return null;

  const d = getTagValue(event, 'd');
  const supporterPubkey = getTagValue(event, 'p');
  if (!isHexPubkey(d) || !isHexPubkey(supporterPubkey) || d !== supporterPubkey) return null;

  const totalSats = getSatsFromAmountTag(event);
  if (!totalSats) return null;

  return {
    pubkey: supporterPubkey,
    totalSats,
    latestAt: Number.parseInt(getTagValue(event, 'last_payment_at') ?? String(event.created_at), 10) || event.created_at,
  };
}

function validateSupporterDonationEvent(event: NostrEvent): Omit<Supporter, 'metadata'> & { paymentKey: string } | null {
  if (event.kind !== SUPPORTER_DONATION_KIND) return null;

  const supporterPubkey = getTagValue(event, 'p');
  if (!isHexPubkey(supporterPubkey)) return null;

  const totalSats = getSatsFromAmountTag(event);
  if (!totalSats) return null;

  const bolt11 = getTagValue(event, 'bolt11')?.trim().toLowerCase();
  const paymentKey = bolt11 ? `bolt11:${bolt11}` : `event:${event.id}`;

  return {
    pubkey: supporterPubkey,
    totalSats,
    latestAt: event.created_at,
    paymentKey,
  };
}

function getSupporterTotals(events: NostrEvent[]): Omit<Supporter, 'metadata'>[] {
  const latestTotalByPubkey = new Map<string, Omit<Supporter, 'metadata'>>();
  const donationTotalsByPubkey = new Map<string, { totalSats: number; latestAt: number }>();
  const countedPayments = new Set<string>();

  for (const event of events) {
    const supporterTotal = validateSupporterTotalEvent(event);
    if (supporterTotal) {
      const current = latestTotalByPubkey.get(supporterTotal.pubkey);
      if (!current || supporterTotal.latestAt > current.latestAt) {
        latestTotalByPubkey.set(supporterTotal.pubkey, supporterTotal);
      }
      continue;
    }

    const supporterDonation = validateSupporterDonationEvent(event);
    if (!supporterDonation) continue;
    if (countedPayments.has(supporterDonation.paymentKey)) continue;
    countedPayments.add(supporterDonation.paymentKey);

    const current = donationTotalsByPubkey.get(supporterDonation.pubkey);
    if (current) {
      current.totalSats += supporterDonation.totalSats;
      current.latestAt = Math.max(current.latestAt, supporterDonation.latestAt);
    } else {
      donationTotalsByPubkey.set(supporterDonation.pubkey, {
        totalSats: supporterDonation.totalSats,
        latestAt: supporterDonation.latestAt,
      });
    }
  }

  for (const [pubkey, donationTotal] of donationTotalsByPubkey.entries()) {
    const current = latestTotalByPubkey.get(pubkey);
    if (!current) {
      latestTotalByPubkey.set(pubkey, { pubkey, ...donationTotal });
    }
  }

  return Array.from(latestTotalByPubkey.values()).sort((a, b) => b.totalSats - a.totalSats);
}

async function attachSupporterMetadata(
  nostr: ReturnType<typeof useNostr>['nostr'],
  totals: Omit<Supporter, 'metadata'>[],
  limit: number,
): Promise<Supporter[]> {
  if (totals.length === 0) return [];

  const relayGroup = nostr.group(SUPPORTER_RELAYS);
  const pubkeys = totals.map((supporter) => supporter.pubkey);
  const metadataEvents = await relayGroup.query(
    [{ kinds: [0], authors: pubkeys, limit: Math.max(pubkeys.length * 3, 50) }],
    { signal: AbortSignal.timeout(6000) },
  ).catch(() => []);

  const metadataByPubkey = new Map<string, SupporterMetadata>();
  for (const event of metadataEvents.sort((a, b) => b.created_at - a.created_at)) {
    if (metadataByPubkey.has(event.pubkey)) continue;

    const metadata = parseMetadata(event.content);
    if (!metadata?.picture) continue;

    metadataByPubkey.set(event.pubkey, {
      name: metadata.name,
      display_name: metadata.display_name,
      picture: metadata.picture,
    });
  }

  return totals
    .map((supporter) => {
      const metadata = metadataByPubkey.get(supporter.pubkey);
      if (!metadata) return null;
      return { ...supporter, metadata };
    })
    .filter((supporter): supporter is Supporter => supporter !== null)
    .slice(0, limit);
}

export function useTopSupporters(limit: number = 10) {
  const { nostr } = useNostr();

  return useQuery<Supporter[]>({
    queryKey: ['top-supporters', SUPPORTER_TOTAL_KIND, SUPPORTER_DONATION_KIND, limit],
    queryFn: async () => {
      const relayGroup = nostr.group(SUPPORTER_RELAYS);
      const events = await relayGroup.query([
        {
          kinds: [SUPPORTER_TOTAL_KIND, SUPPORTER_DONATION_KIND],
          '#t': ['supporter-total', 'supporter-donation'],
          limit: 200,
        },
      ]);

      const totals = getSupporterTotals(events);
      return attachSupporterMetadata(nostr, totals, limit);
    },
    staleTime: 15 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
    retry: 1,
    refetchOnMount: false,
  });
}
