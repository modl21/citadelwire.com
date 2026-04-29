import { NSchema as n, type NostrEvent, type NostrMetadata } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { CITADEL_PUBKEY } from '@/hooks/useCitadelFeed';
import { SUPPORTER_KIND, SUPPORTER_SITE_ID } from '@/lib/publishSupporter';

export interface Supporter {
  pubkey: string;
  totalSats: number;
  latestAt: number;
  metadata: NostrMetadata;
}

type CandidateSupporter = Omit<Supporter, 'metadata'>;
type NostrClient = ReturnType<typeof useNostr>['nostr'];

const ZAP_RECEIPT_RELAYS = [
  'wss://relay.primal.net',
  'wss://relay.damus.io',
  'wss://relay.ditto.pub',
  'wss://nos.lol',
  'wss://relay.nostr.band',
  'wss://antiprimal.net',
];

const PROFILE_RELAYS = [
  'wss://purplepag.es',
  'wss://relay.nostr.band',
  'wss://relay.primal.net',
  'wss://premium.primal.net',
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://antiprimal.net',
];

/** Pubkeys excluded from the supporters list. */
const EXCLUDED_PUBKEYS = new Set([
  'a341f45ff9758f570a21b000c17d4e53a3a497c8397f26c0e6d61e5acffc7a98', // Michael Saylor
  CITADEL_PUBKEY, // Don't show the recipient as a supporter of themselves
]);

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

/** Extract the sender pubkey from a kind 9735 zap receipt. */
function getZapSender(event: NostrEvent): string | null {
  // First try the P tag (uppercase P = sender pubkey per NIP-57)
  const bigPTag = getTagValue(event, 'P');
  if (isHexPubkey(bigPTag)) {
    return bigPTag;
  }

  // Fall back to parsing the embedded zap request from the description tag
  const descriptionTag = getTagValue(event, 'description');
  if (descriptionTag) {
    try {
      const zapRequest = JSON.parse(descriptionTag) as { pubkey?: unknown };
      if (isHexPubkey(zapRequest.pubkey)) {
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
  const amountTag = getTagValue(event, 'amount');
  if (amountTag) {
    const msats = Number.parseInt(amountTag, 10);
    if (Number.isSafeInteger(msats) && msats > 0) {
      return Math.floor(msats / 1000);
    }
  }

  // Fall back to parsing the bolt11 invoice for the amount
  const bolt11 = getTagValue(event, 'bolt11');
  if (bolt11) {
    return parseBolt11Amount(bolt11);
  }

  // Last resort: check the zap request's amount tag
  const descriptionTag = getTagValue(event, 'description');
  if (descriptionTag) {
    try {
      const zapRequest = JSON.parse(descriptionTag) as { tags?: string[][] };
      const reqAmount = zapRequest.tags?.find((t) => t[0] === 'amount')?.[1];
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
    case 'u': return value * 100; // micro-BTC → sats
    case 'n': return Math.floor(value / 10); // nano-BTC → sats
    case 'p': return Math.floor(value / 10000); // pico-BTC → sats
    case '': return value * 100000000; // whole BTC → sats
    default: return null;
  }
}

function getSupporterEventPubkey(event: NostrEvent): string | null {
  const pubkey = getTagValue(event, 'p');
  return isHexPubkey(pubkey) ? pubkey : null;
}

function getSupporterEventAmount(event: NostrEvent): number | null {
  const amountTag = getTagValue(event, 'amount');
  if (amountTag) {
    const msats = Number.parseInt(amountTag, 10);
    if (Number.isSafeInteger(msats) && msats > 0) {
      return Math.floor(msats / 1000);
    }
  }

  const sats = Number.parseInt(event.content.trim(), 10);
  return Number.isSafeInteger(sats) && sats > 0 ? sats : null;
}

function getTrackingKey(event: NostrEvent): string {
  const bolt11 = getTagValue(event, 'bolt11')?.trim().toLowerCase();
  return bolt11 ? `bolt11:${bolt11}` : `event:${event.id}`;
}

function aggregateSupporters(events: NostrEvent[]): CandidateSupporter[] {
  const map = new Map<string, { totalSats: number; latestAt: number }>();
  const countedPayments = new Set<string>();

  for (const event of events) {
    let sender: string | null = null;
    let sats: number | null = null;

    if (event.kind === 9735) {
      sender = getZapSender(event);
      sats = getZapAmount(event);
    } else if (event.kind === SUPPORTER_KIND && getTagValue(event, 'd') === SUPPORTER_SITE_ID) {
      sender = getSupporterEventPubkey(event);
      sats = getSupporterEventAmount(event);
    }

    if (!sender) continue;
    if (EXCLUDED_PUBKEYS.has(sender)) continue;
    if (!sats || sats <= 0) continue;

    const trackingKey = getTrackingKey(event);
    if (countedPayments.has(trackingKey)) continue;
    countedPayments.add(trackingKey);

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

async function filterEligibleSupporters(
  nostr: NostrClient,
  candidates: CandidateSupporter[],
  limit: number,
): Promise<Supporter[]> {
  if (candidates.length === 0) return [];

  const profileRelayGroup = nostr.group(PROFILE_RELAYS);
  const candidatePubkeys = candidates.map(({ pubkey }) => pubkey);

  const metadataEvents = await profileRelayGroup.query(
    [{ kinds: [0], authors: candidatePubkeys, limit: candidatePubkeys.length * 3 }],
    { signal: AbortSignal.timeout(6000) },
  ).catch(() => []);

  const metadataByPubkey = new Map<string, NostrMetadata>();
  for (const event of metadataEvents.sort((a, b) => b.created_at - a.created_at)) {
    if (metadataByPubkey.has(event.pubkey)) continue;
    const metadata = parseMetadata(event.content);
    if (metadata?.picture) {
      metadataByPubkey.set(event.pubkey, metadata);
    }
  }

  const pubkeysWithPictures = candidatePubkeys.filter((pubkey) => metadataByPubkey.has(pubkey));
  if (pubkeysWithPictures.length === 0) return [];

  const postEvents = await profileRelayGroup.query(
    [{ kinds: [1], authors: pubkeysWithPictures, limit: Math.max(200, pubkeysWithPictures.length * 25) }],
    { signal: AbortSignal.timeout(6000) },
  ).catch(() => []);
  const pubkeysWithPosts = new Set(postEvents.map((event) => event.pubkey));

  return candidates
    .map((candidate) => {
      const metadata = metadataByPubkey.get(candidate.pubkey);
      if (!metadata || !pubkeysWithPosts.has(candidate.pubkey)) return null;
      return { ...candidate, metadata };
    })
    .filter((supporter): supporter is Supporter => supporter !== null)
    .slice(0, limit);
}

export function useTopSupporters(limit: number = 10) {
  const { nostr } = useNostr();

  return useQuery<Supporter[]>({
    queryKey: ['top-supporters', CITADEL_PUBKEY, limit],
    queryFn: async () => {
      const zapRelayGroup = nostr.group(ZAP_RECEIPT_RELAYS);
      const [zapReceipts, supporterEvents] = await Promise.all([
        zapRelayGroup.query([
          {
            kinds: [9735],
            '#p': [CITADEL_PUBKEY],
            limit: 1000,
          },
        ]),
        nostr.query([
          {
            kinds: [SUPPORTER_KIND],
            '#d': [SUPPORTER_SITE_ID],
            limit: 1000,
          },
        ]),
      ]);

      const seen = new Set<string>();
      const dedupedEvents: NostrEvent[] = [];
      for (const event of [...zapReceipts, ...supporterEvents]) {
        if (seen.has(event.id)) continue;
        seen.add(event.id);
        dedupedEvents.push(event);
      }

      const candidateLimit = Math.max(limit * 5, 30);
      const candidates = aggregateSupporters(dedupedEvents).slice(0, candidateLimit);
      return filterEligibleSupporters(nostr, candidates, limit);
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    retry: 1,
    refetchOnMount: false,
  });
}
