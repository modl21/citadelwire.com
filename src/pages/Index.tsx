import { useSeoMeta } from '@unhead/react';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { PostCard } from '@/components/PostCard';
import { useCitadelFeed, CITADEL_PUBKEY } from '@/hooks/useCitadelFeed';
import { useAuthor } from '@/hooks/useAuthor';
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
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9 ring-2 ring-primary/10">
              {metadata?.picture ? (
                <AvatarImage src={metadata.picture} alt={metadata?.display_name ?? 'CITADEL WIRE'} />
              ) : null}
              <AvatarFallback className="text-xs font-bold bg-primary text-primary-foreground">CW</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h1 className="text-sm font-bold tracking-tight truncate">
                {metadata?.display_name ?? 'CITADEL WIRE'}
              </h1>
              {metadata?.nip05 && (
                <p className="text-[11px] text-muted-foreground/60 truncate">{metadata.nip05}</p>
              )}
            </div>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2 rounded-full hover:bg-muted/60 transition-colors text-muted-foreground/60 hover:text-foreground disabled:opacity-40"
            title="Refresh feed"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* Profile banner section */}
      <div className="relative">
        {metadata?.banner && (
          <div className="h-32 sm:h-44 w-full overflow-hidden">
            <img
              src={metadata.banner}
              alt=""
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />
          </div>
        )}
      </div>

      {/* Profile info */}
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        <div className="py-5 border-b border-border/50">
          <div className="flex items-start gap-4">
            <Avatar className="h-14 w-14 sm:h-16 sm:w-16 ring-4 ring-background shadow-lg -mt-8 relative z-10">
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
                  <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
                    <Zap className="h-3 w-3" />
                    {metadata.lud16}
                  </span>
                )}
                <a
                  href={`https://njump.me/${npub}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors font-mono truncate max-w-[200px]"
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
      <footer className="max-w-2xl mx-auto px-4 sm:px-6 py-8 mt-4 border-t border-border/30">
        <p className="text-[11px] text-muted-foreground/40 text-center">
          Vibed with{' '}
          <a
            href="https://shakespeare.diy"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-muted-foreground/60 transition-colors underline underline-offset-2"
          >
            Shakespeare
          </a>
        </p>
      </footer>
    </div>
  );
};

export default Index;
