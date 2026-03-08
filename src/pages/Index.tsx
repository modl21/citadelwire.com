import { useSeoMeta } from '@unhead/react';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { PostCard } from '@/components/PostCard';
import { TickerBar } from '@/components/TickerBar';
import { useCitadelFeed, CITADEL_PUBKEY } from '@/hooks/useCitadelFeed';
import { useAuthor } from '@/hooks/useAuthor';
import { DonateButton } from '@/components/DonateButton';
import { Zap, RefreshCw } from 'lucide-react';
import { nip19 } from 'nostr-tools';

function PostSkeleton() {
  return (
    <div className="py-5 px-4 sm:px-6 border-t border-border/60">
      <div className="flex items-center gap-2 mb-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-3 w-16" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  );
}

const Index = () => {
  const { data: posts, isLoading, isError, refetch, isFetching } = useCitadelFeed();
  const author = useAuthor(CITADEL_PUBKEY);
  const metadata = author.data?.metadata;
  const npub = nip19.npubEncode(CITADEL_PUBKEY);

  useSeoMeta({
    title: metadata?.display_name ?? 'CITADEL WIRE',
    description: metadata?.about ?? 'High signal news on Nostr',
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky header with identity + ticker */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/40">
        {/* Top row: identity + refresh */}
        <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-3 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar className="h-8 w-8 ring-2 ring-border/40 shrink-0">
              {metadata?.picture ? (
                <AvatarImage src={metadata.picture} alt={metadata?.display_name ?? 'CITADEL WIRE'} />
              ) : null}
              <AvatarFallback className="text-[10px] font-bold bg-primary text-primary-foreground">CW</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h1 className="text-sm font-bold tracking-tight truncate">
                {metadata?.display_name ?? 'CITADEL WIRE'}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <DonateButton />
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="p-2 rounded-full hover:bg-muted/60 transition-colors text-muted-foreground/50 hover:text-foreground disabled:opacity-40"
              title="Refresh feed"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Ticker row */}
        <div className="max-w-2xl mx-auto px-4 sm:px-6 pb-2.5">
          <TickerBar />
        </div>
      </header>

      {/* Profile banner section */}
      <div className="relative">
        {metadata?.banner && (
          <div className="h-28 sm:h-40 w-full overflow-hidden">
            <img
              src={metadata.banner}
              alt=""
              className="w-full h-full object-cover opacity-70"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-transparent to-background" />
          </div>
        )}
      </div>

      {/* Profile info */}
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        <div className="py-5 border-b border-border/40">
          <div className="flex items-start gap-4">
            <Avatar className="h-14 w-14 sm:h-16 sm:w-16 ring-4 ring-background shadow-xl -mt-8 relative z-10">
              {metadata?.picture ? (
                <AvatarImage src={metadata.picture} alt={metadata?.display_name ?? 'CITADEL WIRE'} />
              ) : null}
              <AvatarFallback className="text-lg font-bold bg-primary text-primary-foreground">CW</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0 pt-1">
              <h2 className="text-lg sm:text-xl font-bold tracking-tight">
                {metadata?.display_name ?? 'CITADEL WIRE'}
              </h2>
              {metadata?.about && (
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                  {metadata.about}
                </p>
              )}
              <div className="flex items-center gap-3 mt-2.5 flex-wrap">
                {metadata?.lud16 && (
                  <span className="inline-flex items-center gap-1 text-xs text-amber-500 font-medium">
                    <Zap className="h-3 w-3" />
                    {metadata.lud16}
                  </span>
                )}
                <a
                  href={`https://njump.me/${npub}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors font-mono truncate max-w-[200px]"
                >
                  {npub.slice(0, 16)}...
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Feed */}
      <main className="max-w-2xl mx-auto">
        {isLoading ? (
          <div>
            {Array.from({ length: 8 }).map((_, i) => (
              <PostSkeleton key={i} />
            ))}
          </div>
        ) : isError ? (
          <div className="py-16 px-4 text-center">
            <p className="text-muted-foreground text-sm">
              Failed to load posts. Please try again.
            </p>
            <button
              onClick={() => refetch()}
              className="mt-3 text-sm font-medium text-primary hover:underline"
            >
              Retry
            </button>
          </div>
        ) : posts && posts.length > 0 ? (
          <div>
            {posts.map((post, index) => (
              <PostCard key={post.id} event={post} isFirst={index === 0} />
            ))}
          </div>
        ) : (
          <div className="py-16 px-4 text-center">
            <p className="text-muted-foreground text-sm">
              No posts yet. Check back later.
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="max-w-2xl mx-auto px-4 sm:px-6 py-8 mt-4 border-t border-border/20">
        <p className="text-[11px] text-muted-foreground/30 text-center">
          Vibed with{' '}
          <a
            href="https://shakespeare.diy"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-muted-foreground/50 transition-colors underline underline-offset-2"
          >
            Shakespeare
          </a>
        </p>
      </footer>
    </div>
  );
};

export default Index;
