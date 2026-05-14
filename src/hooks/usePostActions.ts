import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { buildEventReferenceTags, getPreferredRelay } from '@/lib/nostrPost';

export function useLikePost() {
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (event: NostrEvent) => publishEvent({
      kind: 7,
      content: '+',
      tags: buildEventReferenceTags(event),
    }),
    onSuccess: (_, event) => {
      queryClient.invalidateQueries({ queryKey: ['nostr', 'post-engagement', event.id] });
    },
  });
}

export function useRepostPost() {
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (event: NostrEvent) => {
      const relay = getPreferredRelay(event);
      const isKindOne = event.kind === 1;
      return publishEvent({
        kind: isKindOne ? 6 : 16,
        content: JSON.stringify(event),
        tags: buildEventReferenceTags(event, relay),
      });
    },
    onSuccess: (_, event) => {
      queryClient.invalidateQueries({ queryKey: ['nostr', 'post-engagement', event.id] });
    },
  });
}
