import { type NostrEvent } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import { formatDistanceToNow, format } from 'date-fns';
import { NoteContent } from '@/components/NoteContent';
import { cn } from '@/lib/utils';

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

function getNeventUrl(event: NostrEvent): string {
  const nevent = nip19.neventEncode({ id: event.id, author: event.pubkey });
  return `https://primal.net/e/${nevent}`;
}

export function PostCard({ event, isFirst }: PostCardProps) {
  const { relative, absolute } = formatTimestamp(event.created_at);
  const neventUrl = getNeventUrl(event);

  return (
    <a
      href={neventUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'group relative block py-5 px-4 sm:px-6 transition-colors duration-200 hover:bg-muted/40',
        !isFirst && 'border-t border-border/60',
      )}
    >
      {/* Timestamp */}
      <div className="flex items-center gap-2 mb-2.5">
        <time
          dateTime={new Date(event.created_at * 1000).toISOString()}
          className="text-xs font-medium text-muted-foreground/70 tracking-wide uppercase"
          title={absolute}
        >
          {absolute}
        </time>
        <span className="text-xs text-muted-foreground/40">·</span>
        <span className="text-xs text-muted-foreground/50">{relative}</span>
      </div>

      {/* Content */}
      <div className="leading-relaxed">
        <NoteContent event={event} className="text-[15px] sm:text-base text-foreground/90 leading-[1.7]" />
      </div>
    </a>
  );
}
