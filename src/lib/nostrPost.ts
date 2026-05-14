import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import { CITADEL_FEED_RELAYS, CITADEL_PUBKEY } from '@/hooks/useCitadelFeed';

const POST_ID_PREFIX_LENGTH = 16;
const HEX_EVENT_ID_RE = /^[0-9a-f]{8,64}$/i;

export interface PostPointer {
  id?: string;
  idPrefix?: string;
  author?: string;
  relays: string[];
}

export function getPostIdPrefix(event: NostrEvent): string {
  return event.id.slice(0, POST_ID_PREFIX_LENGTH);
}

export function encodePostPath(event: NostrEvent): string {
  return `/posts/${getPostIdPrefix(event)}`;
}

export function parsePostPointer(identifier: string | undefined): PostPointer | null {
  if (!identifier) return null;

  if (HEX_EVENT_ID_RE.test(identifier)) {
    const normalized = identifier.toLowerCase();
    return normalized.length === 64
      ? {
          id: normalized,
          author: CITADEL_PUBKEY,
          relays: CITADEL_FEED_RELAYS,
        }
      : {
          idPrefix: normalized,
          author: CITADEL_PUBKEY,
          relays: CITADEL_FEED_RELAYS,
        };
  }

  try {
    const decoded = nip19.decode(identifier);

    if (decoded.type === 'note') {
      return {
        id: decoded.data,
        relays: CITADEL_FEED_RELAYS,
      };
    }

    if (decoded.type === 'nevent') {
      return {
        id: decoded.data.id,
        author: decoded.data.author,
        relays: decoded.data.relays && decoded.data.relays.length > 0 ? decoded.data.relays : CITADEL_FEED_RELAYS,
      };
    }

    return null;
  } catch {
    return null;
  }
}

export function getPreferredRelay(event: NostrEvent): string {
  const relayHint = event.tags.find(([name, , relay]) => name === 'e' && relay?.startsWith('wss://'))?.[2];
  return relayHint ?? CITADEL_FEED_RELAYS[0];
}

export function getEventCoordinate(event: NostrEvent): string | null {
  if (event.kind < 30000 || event.kind >= 40000) return null;
  const identifier = event.tags.find(([name]) => name === 'd')?.[1];
  if (!identifier) return null;
  return `${event.kind}:${event.pubkey}:${identifier}`;
}

export function buildEventReferenceTags(event: NostrEvent, relay = getPreferredRelay(event)): string[][] {
  const tags: string[][] = [
    ['e', event.id, relay, event.pubkey],
    ['p', event.pubkey, relay],
    ['k', String(event.kind)],
  ];

  const coordinate = getEventCoordinate(event);
  if (coordinate) {
    tags.push(['a', coordinate, relay, event.pubkey]);
  }

  return tags;
}

export function getReplyRootId(event: NostrEvent): string {
  const root = event.tags.find(([name, , , marker]) => name === 'e' && marker === 'root')?.[1];
  return root ?? event.id;
}

export function getDirectReplyId(event: NostrEvent): string {
  const markedReply = event.tags.find(([name, , , marker]) => name === 'e' && marker === 'reply')?.[1];
  if (markedReply) return markedReply;

  const eTags = event.tags.filter(([name]) => name === 'e');
  const lastETag = eTags[eTags.length - 1]?.[1];
  return lastETag ?? event.id;
}

export function getEventTitle(event: NostrEvent): string {
  const firstLine = event.content
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) return 'CITADEL WIRE post';
  return firstLine.length > 92 ? `${firstLine.slice(0, 89)}…` : firstLine;
}

export function useNostrEvent(pointer: PostPointer | null, initialEvent?: NostrEvent) {
  const { nostr } = useNostr();
  const relayListKey = pointer?.relays?.join('|') ?? '';
  const lookupKey = pointer?.id ?? pointer?.idPrefix ?? '';
  const relayGroup = useMemo(() => {
    const relays = pointer?.relays && pointer.relays.length > 0 ? pointer.relays : CITADEL_FEED_RELAYS;
    return nostr.group(Array.from(new Set([...relays, ...CITADEL_FEED_RELAYS])));
  }, [nostr, relayListKey]);

  return useQuery<NostrEvent | null>({
    queryKey: ['nostr', 'event', lookupKey, pointer?.author ?? '', relayListKey],
    queryFn: async () => {
      if (!pointer?.id && !pointer?.idPrefix) return initialEvent ?? null;

      const filter: NostrFilter = {
        kinds: [1],
        limit: pointer.id ? 1 : 100,
      };

      if (pointer.id) {
        filter.ids = [pointer.id];
      }

      if (pointer.author) {
        filter.authors = [pointer.author];
      }

      try {
        const events = await relayGroup.query([filter], { signal: AbortSignal.timeout(10000) });
        const event = pointer.id
          ? events.find((candidate) => candidate.id === pointer.id)
          : events.find((candidate) => candidate.id.startsWith(pointer.idPrefix ?? ''));
        return event ?? initialEvent ?? null;
      } catch (error) {
        if (initialEvent) {
          console.warn('Falling back to cached post event after relay query failed', error);
          return initialEvent;
        }
        throw error;
      }
    },
    enabled: Boolean(pointer?.id || pointer?.idPrefix),
    initialData: initialEvent,
    staleTime: initialEvent ? 10 * 1000 : 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 4000),
  });
}
