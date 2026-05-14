import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { getEventCoordinate, getReplyRootId } from '@/lib/nostrPost';

export interface PostEngagement {
  replies: NostrEvent[];
  comments: NostrEvent[];
  likes: NostrEvent[];
  reposts: NostrEvent[];
  quoteReposts: NostrEvent[];
  zaps: NostrEvent[];
  likePubkeys: Set<string>;
  repostPubkeys: Set<string>;
  totalZapSats: number;
}

function getZapSats(zap: NostrEvent): number {
  const amountTag = zap.tags.find(([name]) => name === 'amount')?.[1];
  if (amountTag) {
    const amount = Number.parseInt(amountTag, 10);
    if (Number.isFinite(amount) && amount > 0) return Math.floor(amount / 1000);
  }

  const description = zap.tags.find(([name]) => name === 'description')?.[1];
  if (!description) return 0;

  try {
    const zapRequest = JSON.parse(description) as { tags?: string[][] };
    const requestAmount = zapRequest.tags?.find(([name]) => name === 'amount')?.[1];
    if (!requestAmount) return 0;
    const amount = Number.parseInt(requestAmount, 10);
    return Number.isFinite(amount) && amount > 0 ? Math.floor(amount / 1000) : 0;
  } catch {
    return 0;
  }
}

function uniqueById(events: NostrEvent[]): NostrEvent[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    if (seen.has(event.id)) return false;
    seen.add(event.id);
    return true;
  });
}

function isDirectReply(event: NostrEvent, rootId: string): boolean {
  if (event.kind !== 1 || event.id === rootId) return false;
  return getReplyRootId(event) === rootId || event.tags.some(([name, value]) => name === 'e' && value === rootId);
}

function isLike(event: NostrEvent): boolean {
  return event.kind === 7 && (event.content === '+' || event.content === '');
}

export function usePostEngagement(root: NostrEvent | null | undefined, enabled = true) {
  const { nostr } = useNostr();

  return useQuery<PostEngagement>({
    queryKey: ['nostr', 'post-engagement', root?.id ?? ''],
    queryFn: async () => {
      if (!root) {
        return {
          replies: [],
          comments: [],
          likes: [],
          reposts: [],
          quoteReposts: [],
          zaps: [],
          likePubkeys: new Set<string>(),
          repostPubkeys: new Set<string>(),
          totalZapSats: 0,
        };
      }

      const coordinate = getEventCoordinate(root);
      const signal = AbortSignal.timeout(7000);
      const filters = [
        { kinds: [1, 6, 7, 16, 9735], '#e': [root.id], limit: 500 },
        { kinds: [1], '#q': [root.id], limit: 100 },
        { kinds: [1111], '#E': [root.id], limit: 500 },
        ...(coordinate
          ? [
              { kinds: [16, 9735], '#a': [coordinate], limit: 250 },
              { kinds: [1], '#q': [coordinate], limit: 100 },
              { kinds: [1111], '#A': [coordinate], limit: 500 },
            ]
          : []),
      ];

      const events = uniqueById(await nostr.query(filters, { signal }));
      const replies = events
        .filter((event) => isDirectReply(event, root.id) && !event.tags.some(([name, value]) => name === 'q' && (value === root.id || value === coordinate)))
        .sort((a, b) => a.created_at - b.created_at);
      const comments = events
        .filter((event) => event.kind === 1111)
        .sort((a, b) => a.created_at - b.created_at);
      const likes = events.filter(isLike);
      const reposts = events.filter((event) => event.kind === 6 || event.kind === 16);
      const quoteReposts = events
        .filter((event) => event.kind === 1 && event.tags.some(([name, value]) => name === 'q' && (value === root.id || value === coordinate)))
        .sort((a, b) => b.created_at - a.created_at);
      const zaps = events.filter((event) => event.kind === 9735).sort((a, b) => b.created_at - a.created_at);

      return {
        replies,
        comments,
        likes,
        reposts,
        quoteReposts,
        zaps,
        likePubkeys: new Set(likes.map((event) => event.pubkey)),
        repostPubkeys: new Set(reposts.map((event) => event.pubkey)),
        totalZapSats: zaps.reduce((total, zap) => total + getZapSats(zap), 0),
      };
    },
    enabled: enabled && Boolean(root?.id),
    staleTime: 30 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
  });
}
