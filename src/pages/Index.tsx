import { lazy, Suspense, useMemo, useState } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { PostCard } from '@/components/PostCard';
import { PodcastLineup } from '@/components/PodcastLineup';
import { TickerBar } from '@/components/TickerBar';
import { getPostType, useCitadelFeed, CITADEL_PUBKEY, type PostType } from '@/hooks/useCitadelFeed';
import { useAuthor } from '@/hooks/useAuthor';
import { DonateButton } from '@/components/DonateButton';
import { usePageViewCount, HOME_PAGE_VIEW_ID } from '@/hooks/usePageViewCount';
import { Globe, RefreshCw, Rss, Eye, Radio, Info, Moon, Sun } from 'lucide-react';
import { WireSchedule } from '@/components/WireSchedule';
import { PolymarketSection } from '@/components/PolymarketSection';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTheme } from '@/hooks/useTheme';

const BTCSidebarCharts = lazy(() =>
  import('@/components/SidebarCharts').then((module) => ({ default: module.BTCSidebarCharts })),
);
const XAUTSidebarCharts = lazy(() =>
  import('@/components/SidebarCharts').then((module) => ({ default: module.XAUTSidebarCharts })),
);

const POST_TYPE_FILTERS: { type: PostType; label: string }[] = [
  { type: 'standard', label: 'MAIN WIRE' },
  { type: 'live-wire', label: 'LIVE WIRE' },
  { type: 'code-wire', label: 'CODE WIRE' },
];
const POST_TYPE_FILTER_STORAGE_KEY = 'citadel-wire:visible-post-types';

function getDefaultVisiblePostTypes(): Set<PostType> {
  return new Set(POST_TYPE_FILTERS.map(({ type }) => type));
}

function getStoredVisiblePostTypes(): Set<PostType> {
  if (typeof window === 'undefined') return getDefaultVisiblePostTypes();

  try {
    const raw = window.localStorage.getItem(POST_TYPE_FILTER_STORAGE_KEY);
    if (!raw) return getDefaultVisiblePostTypes();

    const storedTypes: unknown = JSON.parse(raw);
    if (!Array.isArray(storedTypes)) return getDefaultVisiblePostTypes();

    const allowedTypes = getDefaultVisiblePostTypes();
    const visibleTypes = storedTypes.filter((type): type is PostType =>
      typeof type === 'string' && allowedTypes.has(type as PostType),
    );

    return new Set(visibleTypes);
  } catch {
    return getDefaultVisiblePostTypes();
  }
}

function saveStoredVisiblePostTypes(visiblePostTypes: Set<PostType>): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(POST_TYPE_FILTER_STORAGE_KEY, JSON.stringify(Array.from(visiblePostTypes)));
  } catch {
    // Ignore storage failures; filters should still work for the current session.
  }
}

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
  const { data: posts, isLoading, isError, refetch } = useCitadelFeed();
  const [visiblePostTypes, setVisiblePostTypes] = useState<Set<PostType>>(() => getStoredVisiblePostTypes());
  const [postTypeTooltipOpen, setPostTypeTooltipOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const isLightMode = theme === 'light';
  const author = useAuthor(CITADEL_PUBKEY);
  const metadata = author.data?.metadata;
  const { count: pageViews, isLoading: isPageViewsLoading } = usePageViewCount(
    HOME_PAGE_VIEW_ID,
    typeof window === 'undefined' ? 'https://wire.shakespeare.wtf/' : window.location.href,
  );
  const visiblePosts = useMemo(() => posts?.slice(0, 60) ?? [], [posts]);
  const filteredPosts = useMemo(
    () => visiblePosts.filter((post) => visiblePostTypes.has(getPostType(post))),
    [visiblePosts, visiblePostTypes],
  );

  const togglePostType = (type: PostType) => {
    setVisiblePostTypes((current) => {
      const next = new Set(current);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      saveStoredVisiblePostTypes(next);
      return next;
    });
  };

  const toggleTheme = () => {
    setTheme(isLightMode ? 'dark' : 'light');
  };

  useSeoMeta({
    title: 'CITADEL WIRE',
    description: 'high signal news',
    ogTitle: 'CITADEL WIRE',
    ogDescription: 'high signal news',
    ogImage: 'https://blossom.primal.net/7e50fc1128859dfdc43d504e2cafec4a1e1e5067b5c6245232a11ee75fdc84d7.jpg',
    ogType: 'website',
    twitterCard: 'summary',
    twitterTitle: 'CITADEL WIRE',
    twitterDescription: 'high signal news',
    twitterImage: 'https://blossom.primal.net/7e50fc1128859dfdc43d504e2cafec4a1e1e5067b5c6245232a11ee75fdc84d7.jpg',
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky header with identity + ticker */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/40">
        {/* Top row: identity + refresh */}
        <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-3 pb-2 flex items-center justify-between">
          <a href="https://primal.net/wire" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 sm:gap-3 hover:opacity-80 transition-opacity shrink-0">
            <Avatar className="h-7 w-7 sm:h-8 sm:w-8 ring-2 ring-border/40 shrink-0">
              {metadata?.picture ? (
                <AvatarImage src={metadata.picture} alt={metadata?.display_name ?? 'CITADEL WIRE'} />
              ) : null}
              <AvatarFallback className="text-[10px] font-bold bg-primary text-primary-foreground">CW</AvatarFallback>
            </Avatar>
            <h1 className="text-xs sm:text-sm font-bold tracking-tight whitespace-nowrap">
              CITADEL WIRE
            </h1>
          </a>
          <div className="flex items-center gap-2 shrink-0">
            <div
              className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/30 px-2.5 py-1 text-[11px] font-medium text-muted-foreground/80"
              title="Visitors"
              aria-label={`Visitors ${pageViews.toLocaleString('en-US')}`}
            >
              <Eye className="h-3.5 w-3.5 text-sky-400" />
              <span className="hidden sm:inline">Visitors</span>
              <span className="tabular-nums text-foreground/90">
                {isPageViewsLoading ? '…' : pageViews.toLocaleString('en-US')}
              </span>
            </div>
            <div
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-400"
              title="Auto refresh is enabled. New CITADEL WIRE posts refresh the page automatically."
              aria-label="Auto refresh enabled"
            >
              <Radio className="h-3.5 w-3.5 animate-pulse" />
              <span className="hidden sm:inline">Live</span>
              <span className="hidden md:inline text-emerald-300/80">Auto-refresh</span>
            </div>
            <a
              href="/feed.xml"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden md:block p-2 rounded-full hover:bg-muted/60 transition-colors text-amber-500/60 hover:text-amber-500"
              title="RSS Feed"
            >
              <Rss className="h-4 w-4" />
            </a>
            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-full hover:bg-muted/60 transition-colors text-muted-foreground/55 hover:text-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/40"
              title={isLightMode ? 'Switch to dark mode' : 'Switch to light mode'}
              aria-label={isLightMode ? 'Switch to dark mode' : 'Switch to light mode'}
              aria-pressed={isLightMode}
            >
              {isLightMode ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>
            <DonateButton />
            <button
              onClick={() => window.location.reload()}
              className="hidden p-2 rounded-full hover:bg-muted/60 transition-colors text-muted-foreground/50 hover:text-foreground sm:inline-flex"
              title="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Ticker row */}
        <div className="max-w-2xl mx-auto px-4 sm:px-6 pb-1.5">
          <TickerBar />
        </div>

        {/* Schedule row */}
        <div className="max-w-2xl mx-auto px-4 sm:px-6 pb-2.5 border-t border-border/20 pt-2">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <WireSchedule />
            </div>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex shrink-0 rounded-full p-2 text-muted-foreground/50 transition-colors hover:bg-muted/60 hover:text-foreground sm:hidden"
              title="Refresh"
              aria-label="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* 3-column layout wrapper: sidebar charts on widescreen, hidden on smaller */}
      <div className="flex justify-center gap-6 xl:px-6">
        {/* Left sidebar — BTC charts (widescreen only) */}
        <aside className="hidden xl:block w-[260px] 2xl:w-[300px] shrink-0 sticky top-[130px] self-start max-h-[calc(100vh-150px)] overflow-y-auto py-4 scrollbar-none">
          <Suspense fallback={null}>
            <BTCSidebarCharts />
          </Suspense>
        </aside>

        {/* Center column — main content */}
        <div className="w-full max-w-2xl min-w-0">
          {/* Profile info — compact on mobile, full on desktop */}
          <div className="px-4 sm:px-6">
            <div className="py-1.5 sm:py-2 border-b border-border/40 flex items-center gap-1.5 sm:gap-2.5 text-[9px] sm:text-[11px] overflow-hidden">
              <a href="https://odell.xyz" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 shrink-0 group/odell">
                <Avatar className="h-3.5 w-3.5 sm:h-4 sm:w-4">
                  <AvatarImage src="https://primaldata.s3.us-east-005.backblazeb2.com/cache/2/c7/ce/2c7ce06799d9a1226680f19826b8fc18ea5df5e2702bcf681e267e0977069e44.jpg" alt="ODELL" />
                  <AvatarFallback className="text-[6px] bg-muted">O</AvatarFallback>
                </Avatar>
                <span className="text-white/70 whitespace-nowrap">
                  <span className="hidden sm:inline">Curated </span>by{' '}
                  <span className="text-white group-hover/odell:text-white font-medium transition-colors">ODELL</span>
                </span>
              </a>
              {metadata?.lud16 && (
                <>
                  <span className="text-muted-foreground/30">·</span>
                  <a
                    href="https://primal.net/wire"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-amber-500/70 hover:text-amber-500 font-medium transition-colors whitespace-nowrap shrink-0"
                  >
                    <Globe className="h-3 w-3" />
                    {metadata.lud16}
                  </a>
                </>
              )}
              <span className="text-muted-foreground/30">·</span>
              <span className="text-white whitespace-nowrap font-bold">high signal news</span>
              <a
                href="https://smp4.simplex.im/c#pnthhrx5BfdJEdTJ6QOEhEJ6g-hdwuOiMEFu6dpj3cQ"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center rounded-full border border-sky-300/45 bg-sky-300/15 px-1.5 py-0.5 text-[7px] font-bold uppercase leading-none tracking-normal text-sky-200 transition-colors hover:border-sky-200/70 hover:bg-sky-300/25 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60 sm:px-2 sm:text-[10px] sm:tracking-wide"
              >
                Join our SimpleX channel
              </a>
            </div>
          </div>

          {/* Prediction Markets */}
          <PolymarketSection />

          {/* Podcast players */}
          <PodcastLineup />

          {/* Feed */}
          <main>
            <div className="px-4 sm:px-6 py-2.5 border-b border-border/30">
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none" aria-label="Post type filters">
                <span className="shrink-0 text-[9px] font-semibold text-muted-foreground/50 uppercase tracking-wider mr-1">
                  Show
                </span>
                {POST_TYPE_FILTERS.map(({ type, label }) => {
                  const isActive = visiblePostTypes.has(type);
                  return (
                    <div key={type} className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => togglePostType(type)}
                        aria-pressed={isActive}
                        className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                          isActive
                            ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                            : 'border-border/40 bg-muted/20 text-muted-foreground/50 hover:bg-muted/40 hover:text-muted-foreground/80'
                        }`}
                      >
                        {label}
                      </button>
                      {type === 'code-wire' && (
                        <Tooltip open={postTypeTooltipOpen} onOpenChange={setPostTypeTooltipOpen}>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => setPostTypeTooltipOpen((open) => !open)}
                              className="inline-flex h-6 items-center justify-center gap-1 rounded-full border border-amber-400/45 bg-amber-400/15 px-2 text-[10px] font-black uppercase tracking-wide text-white shadow-[0_0_18px_rgba(245,158,11,0.18)] transition-colors hover:border-amber-300/70 hover:bg-amber-400/25 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60"
                              aria-label="Post type explanations"
                            >
                              <Info className="h-3 w-3" />
                              Info
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" align="end" className="max-w-[290px] border-amber-400/30 bg-[#080b12]/95 px-4 py-3 text-xs leading-5 text-white shadow-2xl shadow-amber-500/15 backdrop-blur-xl">
                            <div className="space-y-2">
                              <p><span className="font-black text-amber-200">MAIN WIRE</span> 120+ global sources.</p>
                              <p><span className="font-black text-sky-200">LIVE WIRE</span> breaking news detection.</p>
                              <p><span className="font-black text-emerald-200">CODE WIRE</span> 400+ open source projects.</p>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
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
            ) : visiblePosts.length > 0 ? (
              filteredPosts.length > 0 ? (
                <div>
                  {filteredPosts.map((post, index) => (
                    <PostCard key={post.id} event={post} isFirst={index === 0} />
                  ))}
                </div>
              ) : (
                <div className="py-16 px-4 text-center">
                  <p className="text-muted-foreground text-sm">
                    No posts match the selected filters.
                  </p>
                </div>
              )
            ) : (
              <div className="py-16 px-4 text-center">
                <p className="text-muted-foreground text-sm">
                  No posts yet. Check back later.
                </p>
              </div>
            )}
          </main>

          {/* Footer */}
          <footer className="px-4 sm:px-6 py-8 mt-4 border-t border-border/20">
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

        {/* Right sidebar — XAUT charts (widescreen only) */}
        <aside className="hidden xl:block w-[260px] 2xl:w-[300px] shrink-0 sticky top-[130px] self-start max-h-[calc(100vh-150px)] overflow-y-auto py-4 scrollbar-none">
          <Suspense fallback={null}>
            <XAUTSidebarCharts />
          </Suspense>
        </aside>
      </div>
    </div>
  );
};

export default Index;
