import { type NostrMetadata, NSchema as n } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useTopSupporters } from '@/hooks/useTopSupporters';
import { DonateButton } from '@/components/DonateButton';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Zap } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { cn } from '@/lib/utils';

const EXTRA_PROFILE_RELAYS = ['wss://purplepag.es', 'wss://relay.nostr.band', 'wss://antiprimal.net'];
const DEFAULT_AVATAR = 'https://blossom.ditto.pub/62ead074d0d5a7d1b707b101f7d0db62af97bd66843f4f28c7a1d9007e1e6960.jpeg';

/** Like useAuthor but also checks extra relays for supporter profiles. */
function useSupporterProfile(pubkey: string) {
  const { nostr } = useNostr();

  return useQuery<{ metadata?: NostrMetadata }>({
    queryKey: ['supporter-profile', pubkey],
    queryFn: async () => {
      // Query default relays first
      const [event] = await nostr.query(
        [{ kinds: [0], authors: [pubkey], limit: 1 }],
        { signal: AbortSignal.timeout(3000) },
      );

      if (event) {
        try {
          const metadata = n.json().pipe(n.metadata()).parse(event.content);
          return { metadata };
        } catch {
          return {};
        }
      }

      // Fall back: query extra profile relays in parallel
      const extraGroup = nostr.group(EXTRA_PROFILE_RELAYS);
      try {
        const [extra] = await extraGroup.query(
          [{ kinds: [0], authors: [pubkey], limit: 1 }],
          { signal: AbortSignal.timeout(4000) },
        );
        if (extra) {
          try {
            const metadata = n.json().pipe(n.metadata()).parse(extra.content);
            return { metadata };
          } catch {
            return {};
          }
        }
      } catch {
        // Extra relays unreachable
      }

      return {};
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

function SupporterAvatar({ pubkey, totalSats, rank }: { pubkey: string; totalSats: number; rank: number }) {
  const profile = useSupporterProfile(pubkey);
  const metadata = profile.data?.metadata;
  const npub = nip19.npubEncode(pubkey);
  const displayName = metadata?.display_name || metadata?.name || npub.slice(0, 12) + '...';

  return (
    <a
      href={`https://primal.net/p/${npub}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col items-center gap-0.5 group shrink-0"
      title={`${displayName} — ${totalSats.toLocaleString('en-US')} sats`}
    >
      <div className="relative">
        <Avatar className={cn(
          'ring-1 transition-transform group-hover:scale-110',
          rank === 0 ? 'h-6 w-6 ring-amber-500/60' :
          rank <= 2 ? 'h-5 w-5 ring-amber-500/40' :
          'h-5 w-5 ring-border/40',
        )}>
          <AvatarImage src={metadata?.picture || DEFAULT_AVATAR} alt={displayName} />
          <AvatarFallback delayMs={200}>
            <img src={DEFAULT_AVATAR} alt={displayName} className="h-full w-full object-cover" />
          </AvatarFallback>
        </Avatar>
        {rank === 0 && (
          <div className="absolute -top-0.5 -right-0.5 bg-amber-500 text-white rounded-full w-2.5 h-2.5 flex items-center justify-center">
            <Zap className="h-1.5 w-1.5" />
          </div>
        )}
      </div>
      <span className="text-[7px] text-muted-foreground/60 tabular-nums font-medium group-hover:text-foreground/80 transition-colors">
        {totalSats >= 1000 ? `${Math.round(totalSats / 1000)}k` : totalSats}
      </span>
    </a>
  );
}

export function TopSupporters() {
  const { data: supporters, isLoading } = useTopSupporters(10);

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-1.5 border-b border-border/30">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-semibold text-muted-foreground/50 uppercase tracking-wider shrink-0">Top Supporters</span>
          <div className="flex items-center gap-1.5 overflow-hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-0.5 shrink-0">
                <Skeleton className="h-5 w-5 rounded-full" />
                <Skeleton className="h-2 w-4" />
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
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-1.5 border-b border-border/30">
      <div className="flex items-center gap-2">
        <div className="flex flex-col items-start gap-1 shrink-0">
          <span className="text-[9px] font-semibold text-muted-foreground/50 uppercase tracking-wider">
            Top Supporters
          </span>
          <DonateButton />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide py-1 px-0.5">
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
