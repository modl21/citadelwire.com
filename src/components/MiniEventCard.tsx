import { formatDistanceToNow } from 'date-fns';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { NoteContent } from '@/components/NoteContent';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';

interface MiniEventCardProps {
  event: NostrEvent;
  label?: string;
}

export function MiniEventCard({ event, label }: MiniEventCardProps) {
  const author = useAuthor(event.pubkey);
  const metadata: NostrMetadata | undefined = author.data?.metadata;
  const name = metadata?.display_name ?? metadata?.name ?? genUserName(event.pubkey);
  const timeAgo = formatDistanceToNow(new Date(event.created_at * 1000), { addSuffix: true });

  return (
    <Card className="border-border/50 bg-card/55 transition-colors hover:bg-muted/20">
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <Avatar className="h-8 w-8 shrink-0 border border-border/60">
              <AvatarImage src={metadata?.picture} alt={name} />
              <AvatarFallback className="text-[10px]">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground/90">{name}</div>
              <div className="text-xs text-muted-foreground/60">{timeAgo}</div>
            </div>
          </div>
          {label && (
            <span className="shrink-0 rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300/80">
              {label}
            </span>
          )}
        </div>
        <NoteContent event={event} className="text-sm leading-6 text-foreground/86" />
      </CardContent>
    </Card>
  );
}
