import { type NostrEvent } from '@nostrify/nostrify';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow, format } from 'date-fns';
import { NoteContent } from '@/components/NoteContent';
import { PostActionBar } from '@/components/PostActionBar';
import { cn } from '@/lib/utils';
import { CITADEL_FEED_RELAYS } from '@/hooks/useCitadelFeed';
import { encodePostPath, getPostIdPrefix, getPostUtcSlug } from '@/lib/nostrPost';

interface PostCardProps {
  event: NostrEvent;
  isFirst?: boolean;
}

function formatTimestamp(unixTimestamp: number): { relative: string; absolute: string } {
  const date = new Date(unixTimestamp * 1000);
  return {
    relative: formatDistanceToNow(date, { addSuffix: true }),
    absolute: format(date, 'MMM d, yyyy · h:mm a'),
  };
}

function isInteractiveElement(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('a, button, input, textarea, select, [role="button"]'));
}

export function PostCard({ event, isFirst }: PostCardProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { relative, absolute } = formatTimestamp(event.created_at);
  const postPath = encodePostPath(event);

  const openPost = () => {
    const relayListKey = CITADEL_FEED_RELAYS.join('|');
    queryClient.setQueryData(['nostr', 'event', `utc:${event.created_at}`, event.pubkey, relayListKey], event);
    queryClient.setQueryData(['nostr', 'event', getPostUtcSlug(event), event.pubkey, relayListKey], event);
    queryClient.setQueryData(['nostr', 'event', getPostIdPrefix(event), event.pubkey, relayListKey], event);
    queryClient.setQueryData(['nostr', 'event', event.id, event.pubkey, relayListKey], event);
    navigate(postPath, { state: { event } });
  };

  return (
    <article
      role="link"
      tabIndex={0}
      onClick={(clickEvent) => {
        if (isInteractiveElement(clickEvent.target)) return;
        openPost();
      }}
      onKeyDown={(keyboardEvent) => {
        if (keyboardEvent.key !== 'Enter' && keyboardEvent.key !== ' ') return;
        keyboardEvent.preventDefault();
        openPost();
      }}
      className={cn(
        'group relative block cursor-pointer py-4 sm:py-5 px-4 sm:px-6 transition-colors duration-200 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/40',
        !isFirst && 'border-t border-border/40',
      )}
      aria-label="Open post discussion"
    >
      {/* Timestamp */}
      <div className="flex items-center gap-1.5 mb-2">
        <time
          dateTime={new Date(event.created_at * 1000).toISOString()}
          className="text-[11px] font-medium text-muted-foreground/50 tracking-wide uppercase"
          title={absolute}
        >
          {absolute}
        </time>
        <span className="text-[11px] text-muted-foreground/30">·</span>
        <span className="text-[11px] text-muted-foreground/40">{relative}</span>
      </div>

      {/* Content */}
      <NoteContent
        event={event}
        className="text-[15px] sm:text-[15px] text-foreground/95 leading-[1.75] tracking-[-0.01em]"
      />

      <PostActionBar event={event} className="mt-3 justify-start gap-1 opacity-80 transition-opacity group-hover:opacity-100" onComment={openPost} />
    </article>
  );
}
