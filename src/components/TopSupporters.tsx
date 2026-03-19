import { useTopSupporters } from '@/hooks/useTopSupporters';
import { useAuthor } from '@/hooks/useAuthor';
import { DonateButton } from '@/components/DonateButton';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Zap } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { cn } from '@/lib/utils';

function SupporterAvatar({ pubkey, totalSats, rank }: { pubkey: string; totalSats: number; rank: number }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const npub = nip19.npubEncode(pubkey);
  const displayName = metadata?.display_name || metadata?.name || npub.slice(0, 12) + '...';

  return (
    <a
      href={`https://primal.net/p/${npub}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col items-center gap-1.5 group shrink-0"
      title={`${displayName} — ${totalSats.toLocaleString('en-US')} sats`}
    >
      <div className="relative">
        <Avatar className={cn(
          'ring-2 transition-transform group-hover:scale-110',
          rank === 0 ? 'h-10 w-10 ring-amber-500/60' :
          rank <= 2 ? 'h-9 w-9 ring-amber-500/40' :
          'h-8 w-8 ring-border/40',
        )}>
          {metadata?.picture ? (
            <AvatarImage src={metadata.picture} alt={displayName} />
          ) : null}
          <AvatarFallback className="text-[10px] font-bold bg-muted text-muted-foreground">
            {(metadata?.name || '?')[0].toUpperCase()}
          </AvatarFallback>
        </Avatar>
        {rank === 0 && (
          <div className="absolute -top-1 -right-1 bg-amber-500 text-white rounded-full w-4 h-4 flex items-center justify-center">
            <Zap className="h-2.5 w-2.5" />
          </div>
        )}
      </div>
      <span className="text-[10px] text-muted-foreground/60 tabular-nums font-medium group-hover:text-foreground/80 transition-colors">
        {totalSats >= 1000 ? `${Math.round(totalSats / 1000)}k` : totalSats}
      </span>
    </a>
  );
}

export function TopSupporters() {
  const { data: supporters, isLoading } = useTopSupporters(10);

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-3 border-b border-border/30">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-semibold text-muted-foreground/50 uppercase tracking-wider shrink-0">Top Supporters</span>
          <div className="flex items-center gap-2.5 overflow-hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5 shrink-0">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-2.5 w-6" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!supporters || supporters.length === 0) {
    return null;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-3 border-b border-border/30">
      <div className="flex items-center gap-3">
        <div className="flex flex-col items-start gap-1.5 shrink-0">
          <span className="text-[11px] font-semibold text-muted-foreground/50 uppercase tracking-wider">
            Top Supporters
          </span>
          <DonateButton />
        </div>
        <div className="flex items-center gap-2.5 overflow-x-auto scrollbar-hide">
          {supporters.map((supporter, index) => (
            <SupporterAvatar
              key={supporter.pubkey}
              pubkey={supporter.pubkey}
              totalSats={supporter.totalSats}
              rank={index}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
