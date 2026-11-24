import { memo, useState, useSyncExternalStore } from 'react';
import { type NostrEvent } from '@nostrify/nostrify';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow, format } from 'date-fns';
import { Bookmark, Check, Share2 } from 'lucide-react';
import { NoteContent } from '@/components/NoteContent';
import { cn } from '@/lib/utils';
import { CITADEL_FEED_RELAYS, getPostType, type PostType } from '@/hooks/useCitadelFeed';
import { encodePostPath, getPostIdPrefix, getPostUtcSlug } from '@/lib/nostrPost';

interface PostCardProps {
  event: NostrEvent;
  isFirst?: boolean;
  /** Optional precomputed PostType from the feed index to avoid re-scanning tags/content. */
  postType?: PostType;
  /** Optional active search query for inline term highlighting. */
  highlightQuery?: string;
  /** Bookmark state and toggle handler. */
  isSaved?: boolean;
  onToggleSaved?: (eventId: string) => void;
  /** Whether this card is currently focused via j/k keyboard navigation. */
  isSelected?: boolean;
}

// One clock for the whole feed. Only the small relative-time labels update;
// unrelated header/search state does not re-render every post's rich content.
const clockListeners = new Set<() => void>();
let clockTimer: ReturnType<typeof setInterval> | undefined;
const getMinute = () => Math.floor(Date.now() / 60_000);
function subscribeToClock(listener: () => void) {
  clockListeners.add(listener);
  if (!clockTimer) {
    clockTimer = setInterval(() => clockListeners.forEach((notify) => notify()), 60_000);
  }
  return () => {
    clockListeners.delete(listener);
    if (clockListeners.size === 0) {
      clearInterval(clockTimer);
      clockTimer = undefined;
    }
  };
}

const RelativeTimestamp = memo(function RelativeTimestamp({ timestamp }: { timestamp: number }) {
  useSyncExternalStore(subscribeToClock, getMinute, getMinute);
  return (
    <span className="shrink-0 text-[11px] text-muted-foreground/40">
      {formatDistanceToNow(new Date(timestamp * 1000), { addSuffix: true })}
    </span>
  );
});

function isInteractiveElement(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('a, button, input, textarea, select, [role="button"]'));
}

const POST_TYPE_STYLES: Record<PostType, string | null> = {
  'standard': null,
  'live-wire': 'text-red-300',
  'code-wire': 'text-yellow-300',
  'daily-wire': 'text-emerald-300',
  'weekly-wire': 'text-sky-300',
  'forward-wire': 'text-orange-300',
  'editor-wire': 'text-cyan-300',
};

/** Subtle left accent stripe + faint tint so special editions stand out at a glance. */
const POST_TYPE_CARD_ACCENT: Record<PostType, string | null> = {
  'standard': null,
  'live-wire': 'border-l-2 border-l-red-400/70 bg-red-500/[0.03]',
  'code-wire': 'border-l-2 border-l-yellow-400/60 bg-yellow-500/[0.02]',
  'daily-wire': 'border-l-2 border-l-emerald-400/70 bg-emerald-500/[0.03]',
  'weekly-wire': 'border-l-2 border-l-sky-400/70 bg-sky-500/[0.03]',
  'forward-wire': 'border-l-2 border-l-orange-400/70 bg-orange-500/[0.03]',
  'editor-wire': 'border-l-2 border-l-cyan-400/80 bg-cyan-500/[0.04]',
};

export const PostCard = memo(function PostCard({
  event,
  isFirst,
  postType: providedPostType,
  highlightQuery,
  isSaved = false,
  onToggleSaved,
  isSelected = false,
}: PostCardProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const absolute = format(new Date(event.created_at * 1000), 'MMM d, yyyy · h:mm a');
  const postPath = encodePostPath(event);
  const postType = providedPostType ?? getPostType(event);
  const postTypeClassName = POST_TYPE_STYLES[postType];
  const cardAccentClassName = POST_TYPE_CARD_ACCENT[postType];

  const getShareUrl = () => {
    if (typeof window === 'undefined') return postPath;
    return new URL(postPath, window.location.origin).toString();
  };

  const handleShare = async (shareEvent: React.MouseEvent<HTMLButtonElement>) => {
    shareEvent.preventDefault();
    shareEvent.stopPropagation();

    try {
      await navigator.clipboard.writeText(getShareUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const handleBookmark = (bookmarkEvent: React.MouseEvent<HTMLButtonElement>) => {
    bookmarkEvent.preventDefault();
    bookmarkEvent.stopPropagation();
    onToggleSaved?.(event.id);
  };

  const openPost = () => {
    const relayListKey = CITADEL_FEED_RELAYS.join('|');
    queryClient.setQueryData(['nostr', 'event', `utc:${event.created_at}`, event.pubkey, relayListKey], event);
    queryClient.setQueryData(['nostr', 'event', getPostUtcSlug(event), event.pubkey, relayListKey], event);
    queryClient.setQueryData(['nostr', 'event', getPostIdPrefix(event), event.pubkey, relayListKey], event);
    queryClient.setQueryData(['nostr', 'event', event.id, event.pubkey, relayListKey], event);
    navigate(postPath, { state: { event, fromFeed: true } });
  };

  return (
    <article
      data-wire-id={event.id}
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
        !isFirst && 'wire-post-deferred border-t border-border/40',
        cardAccentClassName,
        isSelected && 'ring-1 ring-inset ring-amber-400/50 bg-amber-500/[0.04]',
      )}
      aria-label="Open post discussion"
    >
      {/* Timestamp + bookmark + share */}
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <time
            dateTime={new Date(event.created_at * 1000).toISOString()}
            className={cn(
              'truncate text-[11px] font-medium tracking-wide uppercase',
              postTypeClassName ? `font-bold tracking-tight ${postTypeClassName}` : 'text-muted-foreground/50',
            )}
            title={absolute}
          >
            {postTypeClassName ? postType.replace('-', ' ').toUpperCase() : absolute}
          </time>
          <span className="text-[11px] text-muted-foreground/30">·</span>
          <RelativeTimestamp timestamp={event.created_at} />
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {onToggleSaved && (
            <button
              type="button"
              onClick={handleBookmark}
              aria-pressed={isSaved}
              aria-label={isSaved ? 'Remove bookmark' : 'Save wire for later'}
              title={isSaved ? 'Saved — click to remove' : 'Save wire for later'}
              className={cn(
                'inline-flex shrink-0 items-center justify-center rounded-full border p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/40',
                isSaved
                  ? 'border-amber-500/50 bg-amber-500/15 text-amber-400'
                  : 'border-border/40 bg-background/45 text-muted-foreground/55 opacity-80 hover:border-amber-400/30 hover:bg-amber-400/10 hover:text-amber-300',
              )}
            >
              <Bookmark className={cn('h-3.5 w-3.5', isSaved && 'fill-current')} />
            </button>
          )}
          <button
            type="button"
            onClick={handleShare}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/40 bg-background/45 px-2 py-1 text-[11px] font-semibold text-muted-foreground/55 opacity-80 transition-colors hover:border-amber-400/30 hover:bg-amber-400/10 hover:text-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/40"
            aria-label="Copy post link"
            title="Copy post link"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Share2 className="h-3.5 w-3.5" />}
            <span>{copied ? 'Copied' : 'Share'}</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <NoteContent
        event={event}
        className="text-[15px] sm:text-[15px] text-foreground/95 leading-[1.75] tracking-[-0.01em]"
        titleClassName={postTypeClassName ? `font-black tracking-tight ${postTypeClassName}` : undefined}
        editorWire={postType === 'editor-wire'}
        highlightQuery={highlightQuery}
        showMoreInfo
      />

    </article>
  );
});
