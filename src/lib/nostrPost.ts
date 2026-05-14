import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import { CITADEL_FEED_RELAYS } from '@/hooks/useCitadelFeed';

export interface PostPointer {
  id?: string;
  author?: string;
  relays: string[];
}

export function encodePostPath(event: NostrEvent): string {
  return `/posts/${nip19.neventEncode({
    id: event.id,
    author: event.pubkey,
    relays: CITADEL_FEED_RELAYS,
  })}`;
}

export function parsePostPointer(identifier: string | undefined): PostPointer | null {
  if (!identifier) return null;

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

export function useNostrEvent(pointer: PostPointer | null) {
  const { nostr } = useNostr();
  const relayGroup = useMemo(() => {
    const relays = pointer?.relays && pointer.relays.length > 0 ? pointer.relays : CITADEL_FEED_RELAYS;
    return nostr.group(Array.from(new Set([...relays, ...CITADEL_FEED_RELAYS])));
  }, [nostr, pointer?.relays]);

  return useQuery<NostrEvent | null>({
    queryKey: ['nostr', 'event', pointer?.id ?? '', pointer?.author ?? '', pointer?.relays ?? []],
    queryFn: async () => {
      if (!pointer?.id) return null;

      const filter: NostrFilter = {
        ids: [pointer.id],
        limit: 1,
      };

      if (pointer.author) {
        filter.authors = [pointer.author];
      }

      const events = await relayGroup.query([filter], { signal: AbortSignal.timeout(7000) });
      return events[0] ?? null;
    },
    enabled: Boolean(pointer?.id),
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
  });
}
