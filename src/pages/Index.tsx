import { Fragment, lazy, memo, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { useInView } from 'react-intersection-observer';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { PostCard } from '@/components/PostCard';
import { PodcastLineup } from '@/components/PodcastLineup';
import { TickerBar } from '@/components/TickerBar';
import { getPostType, useCitadelFeed, CITADEL_FEED_LIMIT, CITADEL_PUBKEY, type PostType } from '@/hooks/useCitadelFeed';
import { useAuthor } from '@/hooks/useAuthor';
import { DonateButton } from '@/components/DonateButton';
import { usePageViewCount, HOME_PAGE_VIEW_ID } from '@/hooks/usePageViewCount';
import { ArrowUp, Bookmark, ChevronDown, Clock, Globe, RefreshCw, Rss, Eye, Radio, Info, Moon, Sun, Search, RotateCcw } from 'lucide-react';
import { WireSchedule } from '@/components/WireSchedule';
import { PolymarketSection } from '@/components/PolymarketSection';
import { StickyAudioBar } from '@/components/StickyAudioBar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTheme } from '@/hooks/useTheme';
import { useMediaQuery } from '@/hooks/useIsMobile';
import { useSavedWires } from '@/hooks/useSavedWires';

const BTCSidebarCharts = lazy(() =>
  import('@/components/SidebarCharts').then((module) => ({ default: module.BTCSidebarCharts })),
);
const XAUTSidebarCharts = lazy(() =>
  import('@/components/SidebarCharts').then((module) => ({ default: module.XAUTSidebarCharts })),
);

const CHART_SIDEBAR_QUERY = '(min-width: 1280px), (orientation: landscape) and (min-width: 768px) and (pointer: coarse)';
const INITIAL_RENDER_COUNT = 30;
const RENDER_BATCH_SIZE = 40;
const LAST_SEEN_WIRE_KEY = 'citadel-wire:last-seen-wire-ts';

// Breakpoint updates stay inside these rails, not the entire news feed.
const ChartSidebar = memo(function ChartSidebar({ side }: { side: 'left' | 'right' }) {
  const visible = useMediaQuery(CHART_SIDEBAR_QUERY);
  const [armed, setArmed] = useState(false);
  const Charts = side === 'left' ? BTCSidebarCharts : XAUTSidebarCharts;

  useEffect(() => {
    if (!visible) {
      // Drop the rails entirely on portrait so the feed repaints alone.
      setArmed(false);
      return;
    }
    // Let the rotation animation finish before mounting charts and their
    // requests. Cached data means this does not refetch.
    const timer = setTimeout(() => setArmed(true), 150);
    return () => clearTimeout(timer);
  }, [visible]);

  if (!visible) return null;

  return (
    <aside
      aria-label={side === 'left' ? 'Bitcoin and financial charts' : 'Gold, oil and mining charts'}
      className="w-[170px] xl:w-[260px] 2xl:w-[300px] shrink-0 sticky top-[130px] self-start max-h-[calc(100vh-150px)] overflow-y-auto py-4 scrollbar-none"
    >
      {armed ? (
        <Suspense fallback={<Skeleton className="h-[240px] w-full rounded-xl" />}>
          <Charts enabled={visible} />
        </Suspense>
      ) : (
        <Skeleton className="h-[240px] w-full rounded-xl" />
      )}
    </aside>
  );
});

/** Isolated so page-view fetches/updates never re-render the feed or header siblings. */
const VisitorCounter = memo(function VisitorCounter() {
  const { count: pageViews, isLoading: isPageViewsLoading } = usePageViewCount(
    HOME_PAGE_VIEW_ID,
    typeof window === 'undefined' ? 'https://wire.shakespeare.wtf/' : window.location.href,
  );

  return (
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
  );
});

/** Isolated so profile metadata resolution only re-renders the small brand link. */
const BrandIdentity = memo(function BrandIdentity() {
  const author = useAuthor(CITADEL_PUBKEY);
  const metadata = author.data?.metadata;

  return (
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
  );
});

/** Isolated so theme toggles don't re-render the feed tree. */
const ThemeToggleButton = memo(function ThemeToggleButton() {
  const { theme, setTheme } = useTheme();
  const isLightMode = theme === 'light';

  return (
    <button
      type="button"
      onClick={() => setTheme(isLightMode ? 'dark' : 'light')}
      className="p-2 rounded-full hover:bg-muted/60 transition-colors text-muted-foreground/55 hover:text-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/40"
      title={isLightMode ? 'Switch to dark mode' : 'Switch to light mode'}
      aria-label={isLightMode ? 'Switch to dark mode' : 'Switch to light mode'}
      aria-pressed={isLightMode}
    >
      {isLightMode ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
    </button>
  );
});

/** Isolated so author metadata updates only touch this compact info bar. */
const ProfileMetaBar = memo(function ProfileMetaBar() {
  const author = useAuthor(CITADEL_PUBKEY);
  const metadata = author.data?.metadata;

  return (
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
  );
});

/** Compact mobile schedule toggle pill — expands the full 24h schedule & countdowns on tap. */
const MobileScheduleStrip = memo(function MobileScheduleStrip() {
  const [open, setOpen] = useState(false);
  const [minsLeft, setMinsLeft] = useState(() => 60 - new Date().getUTCMinutes());

  useEffect(() => {
    const update = () => setMinsLeft(60 - new Date().getUTCMinutes());
    const id = setInterval(update, 30 * 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="sm:hidden border-b border-border/30 bg-background/60">
      <div className="max-w-2xl mx-auto px-4 py-1.5 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground/80 hover:text-foreground transition-colors"
        >
          <Clock className="h-3 w-3 text-sky-400" />
          <span className="uppercase tracking-wider">Schedule</span>
          <span className="text-muted-foreground/40">·</span>
          <span className="tabular-nums text-sky-400">Next wire in {minsLeft}m</span>
          <ChevronDown className={`h-3 w-3 text-muted-foreground/60 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex shrink-0 rounded-full p-1 text-muted-foreground/50 transition-colors hover:bg-muted/60 hover:text-foreground"
          title="Refresh"
          aria-label="Refresh"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>
      {open && (
        <div className="max-w-2xl mx-auto px-4 pb-2.5 pt-1 border-t border-border/20">
          <WireSchedule />
        </div>
      )}
    </div>
  );
});

const POST_TYPE_FILTERS: { type: PostType; label: string }[] = [
  { type: 'standard', label: 'MAIN WIRE' },
  { type: 'editor-wire', label: 'EDITOR WIRE' },
  { type: 'code-wire', label: 'CODE WIRE' },
  { type: 'daily-wire', label: 'DAILY WIRE' },
  { type: 'weekly-wire', label: 'WEEKLY WIRE' },
  { type: 'forward-wire', label: 'FORWARD WIRE' },
];
const POST_TYPE_FILTER_STORAGE_KEY = 'citadel-wire:visible-post-types';

function getDefaultVisiblePostTypes(): Set<PostType> {
  return new Set(POST_TYPE_FILTERS.map(({ type }) => type));
}

function isAllPostTypesActive(set: Set<PostType>): boolean {
  return POST_TYPE_FILTERS.every(({ type }) => set.has(type));
}

function getStoredVisiblePostTypes(): Set<PostType> {
  if (typeof window === 'undefined') return getDefaultVisiblePostTypes();

  try {
    const raw = window.localStorage.getItem(POST_TYPE_FILTER_STORAGE_KEY);
    if (!raw) return getDefaultVisiblePostTypes();

    const storedTypes: unknown = JSON.parse(raw);
    if (!Array.isArray(storedTypes)) return getDefaultVisiblePostTypes();

    const allowedTypes = getDefaultVisiblePostTypes();
    const visibleTypes = storedTypes
      // Migrate legacy stored sets: the old LIVE WIRE toggle slot is now EDITOR WIRE.
      .map((type) => (type === 'live-wire' ? 'editor-wire' : type))
      .filter((type): type is PostType =>
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

function readPreviousSeenTimestamp(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LAST_SEEN_WIRE_KEY);
    if (!raw) return null;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function writeLastSeenTimestamp(ts: number): void {
  if (typeof window === 'undefined' || !Number.isFinite(ts) || ts <= 0) return;
  try {
    window.localStorage.setItem(LAST_SEEN_WIRE_KEY, String(ts));
  } catch {
    // Ignore storage failures
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
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: posts, isLoading, isError, refetch } = useCitadelFeed();
  const { savedIds, savedCount, toggleSaved } = useSavedWires();

  // Initialize filters from URL (?only=editor-wire, ?saved=1, ?q=...) with localStorage fallback
  const [visiblePostTypes, setVisiblePostTypes] = useState<Set<PostType>>(() => {
    const onlyParam = searchParams.get('only');
    if (onlyParam) {
      const allowed = getDefaultVisiblePostTypes();
      const requested = onlyParam
        .split(',')
        .map((part) => part.trim())
        .filter((part): part is PostType => allowed.has(part as PostType));
      if (requested.length > 0) return new Set(requested);
    }
    return getStoredVisiblePostTypes();
  });
  const [savedOnly, setSavedOnly] = useState<boolean>(() => searchParams.get('saved') === '1');
  const [postTypeTooltipOpen, setPostTypeTooltipOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') ?? '');
  const [renderedCount, setRenderedCount] = useState(INITIAL_RENDER_COUNT);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Unread "caught up to here" marker from previous session + live arrival pill while scrolled down
  const [previousVisitNewestTs] = useState<number | null>(() => readPreviousSeenTimestamp());
  const sessionBaselineTsRef = useRef<number | null>(null);
  const [pendingNewWiresCount, setPendingNewWiresCount] = useState(0);

  const visiblePosts = useMemo(() => posts?.slice(0, CITADEL_FEED_LIMIT) ?? [], [posts]);
  const newestPostTs = visiblePosts[0]?.created_at ?? null;

  // Record session baseline once initial posts arrive, and detect live arrivals while scrolled down
  useEffect(() => {
    if (!newestPostTs) return;

    if (sessionBaselineTsRef.current === null) {
      sessionBaselineTsRef.current = newestPostTs;
      writeLastSeenTimestamp(newestPostTs);
      return;
    }

    if (newestPostTs > sessionBaselineTsRef.current) {
      const arrivedCount = visiblePosts.filter((post) => post.created_at > (sessionBaselineTsRef.current ?? 0)).length;
      if (typeof window !== 'undefined' && window.scrollY > 240) {
        setPendingNewWiresCount((prev) => Math.max(prev, arrivedCount));
      } else {
        sessionBaselineTsRef.current = newestPostTs;
        writeLastSeenTimestamp(newestPostTs);
        setPendingNewWiresCount(0);
      }
    }
  }, [newestPostTs, visiblePosts]);

  // Clear the floating "new wires" pill automatically if the user scrolls back to top
  useEffect(() => {
    if (pendingNewWiresCount === 0) return;
    const onScroll = () => {
      if (window.scrollY <= 160) {
        if (newestPostTs) {
          sessionBaselineTsRef.current = newestPostTs;
          writeLastSeenTimestamp(newestPostTs);
        }
        setPendingNewWiresCount(0);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [pendingNewWiresCount, newestPostTs]);

  const scrollToNewWires = useCallback(() => {
    if (newestPostTs) {
      sessionBaselineTsRef.current = newestPostTs;
      writeLastSeenTimestamp(newestPostTs);
    }
    setPendingNewWiresCount(0);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [newestPostTs]);

  const normalizedSearchQuery = useDeferredValue(searchQuery.trim().toLowerCase());
  const searchIndex = useMemo(
    () => visiblePosts.map((post) => ({ post, type: getPostType(post), text: post.content.toLowerCase() })),
    [visiblePosts],
  );
  const filteredEntries = useMemo(
    () => searchIndex
      .filter(({ post, type, text }) => {
        if (savedOnly && !savedIds.has(post.id)) return false;
        // Live wires bypass the Show-bar filters entirely; search still applies.
        if (!savedOnly && type !== 'live-wire' && !visiblePostTypes.has(type)) return false;
        if (normalizedSearchQuery && !text.includes(normalizedSearchQuery)) return false;
        return true;
      }),
    [searchIndex, visiblePostTypes, normalizedSearchQuery, savedOnly, savedIds],
  );

  // Sync active search/filter state to URL query params for shareable links
  useEffect(() => {
    const next = new URLSearchParams();
    const trimmedSearch = searchQuery.trim();
    if (trimmedSearch) next.set('q', trimmedSearch);
    if (savedOnly) {
      next.set('saved', '1');
    } else if (!isAllPostTypesActive(visiblePostTypes) && visiblePostTypes.size > 0) {
      next.set('only', Array.from(visiblePostTypes).join(','));
    }
    const nextStr = next.toString();
    const curStr = searchParams.toString();
    if (nextStr !== curStr) {
      setSearchParams(next, { replace: true });
    }
  }, [searchQuery, visiblePostTypes, savedOnly, searchParams, setSearchParams]);

  // Reset rendered batch & keyboard selection when filter/search changes
  useEffect(() => {
    setRenderedCount(INITIAL_RENDER_COUNT);
    setSelectedIndex(-1);
  }, [visiblePostTypes, normalizedSearchQuery, savedOnly]);

  const hasMoreToRender = renderedCount < filteredEntries.length;
  const { ref: loadMoreRef, inView: loadMoreInView } = useInView({
    rootMargin: '800px 0px',
    skip: !hasMoreToRender,
  });

  useEffect(() => {
    if (loadMoreInView && hasMoreToRender) {
      setRenderedCount((count) => Math.min(count + RENDER_BATCH_SIZE, filteredEntries.length));
    }
  }, [loadMoreInView, hasMoreToRender, filteredEntries.length]);

  const renderedEntries = useMemo(
    () => filteredEntries.slice(0, renderedCount),
    [filteredEntries, renderedCount],
  );

  // Index of the first wire older than or equal to what the user saw on their previous visit
  const unreadDividerIndex = useMemo(() => {
    if (!previousVisitNewestTs || savedOnly || normalizedSearchQuery) return -1;
    const idx = renderedEntries.findIndex(({ post }) => post.created_at <= previousVisitNewestTs);
    // Only show divider if there is at least 1 genuinely newer wire above it
    return idx > 0 ? idx : -1;
  }, [previousVisitNewestTs, renderedEntries, savedOnly, normalizedSearchQuery]);

  // Keyboard shortcuts: '/' focuses search, 'j'/'k' step through wires, 'Enter' opens focused wire, 'Escape' clears
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const isTyping = Boolean(
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable),
      );

      if (event.key === '/' && !isTyping) {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (event.key === 'Escape') {
        if (isTyping && target === searchInputRef.current) {
          searchInputRef.current?.blur();
        } else if (selectedIndex >= 0) {
          setSelectedIndex(-1);
        }
        return;
      }

      if (isTyping || renderedEntries.length === 0) return;

      if (event.key === 'j' || event.key === 'k') {
        event.preventDefault();
        setSelectedIndex((current) => {
          const next = event.key === 'j'
            ? Math.min(current + 1, renderedEntries.length - 1)
            : Math.max(current - 1, 0);
          const targetId = renderedEntries[next]?.post.id;
          if (targetId) {
            const el = document.querySelector<HTMLElement>(`article[data-wire-id="${targetId}"]`);
            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          return next;
        });
      } else if (event.key === 'Enter' && selectedIndex >= 0 && selectedIndex < renderedEntries.length) {
        const targetId = renderedEntries[selectedIndex]?.post.id;
        if (targetId) {
          const el = document.querySelector<HTMLElement>(`article[data-wire-id="${targetId}"]`);
          el?.click();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [renderedEntries, selectedIndex]);

  const soloPostType = useCallback((type: PostType) => {
    setSavedOnly(false);
    setVisiblePostTypes((current) => {
      // If already soloed on this type, restore all types
      const next = current.size === 1 && current.has(type)
        ? getDefaultVisiblePostTypes()
        : new Set<PostType>([type]);
      saveStoredVisiblePostTypes(next);
      return next;
    });
  }, []);

  const togglePostType = useCallback((type: PostType, altKey = false) => {
    if (altKey) {
      soloPostType(type);
      return;
    }
    setSavedOnly(false);
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
  }, [soloPostType]);

  const resetFilters = useCallback(() => {
    const all = getDefaultVisiblePostTypes();
    setSavedOnly(false);
    setVisiblePostTypes(all);
    saveStoredVisiblePostTypes(all);
  }, []);

  const hasCustomFilter = savedOnly || !isAllPostTypesActive(visiblePostTypes);

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
    <div className="min-h-screen bg-background safe-x">
      {/* Sticky header: brand + live price ticker stay pinned; schedule sits below on mobile for extra reading room */}
      <header className="sticky top-0 z-50 safe-top bg-background/95 md:bg-background/85 md:backdrop-blur-md border-b border-border/40">
        {/* Top row: identity + refresh */}
        <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-3 pb-2 flex items-center justify-between">
          <BrandIdentity />
          <div className="flex items-center gap-2 shrink-0">
            <VisitorCounter />
            <div
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-400"
              title="Auto refresh is enabled. New CITADEL WIRE posts appear automatically without interrupting playback."
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
            <ThemeToggleButton />
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
        <div className="max-w-2xl mx-auto px-4 sm:px-6 pb-2 sm:pb-1.5 overflow-x-auto scrollbar-none">
          <TickerBar />
        </div>

        {/* Desktop/tablet schedule row — pinned inside header */}
        <div className="hidden sm:block max-w-2xl mx-auto px-4 sm:px-6 pb-2.5 border-t border-border/20 pt-2">
          <WireSchedule />
        </div>
      </header>

      {/* Mobile schedule strip — scrolls away & expands on tap to preserve mobile reading viewport */}
      <MobileScheduleStrip />

      {/* Floating pill when live wires arrive while scrolled down */}
      {pendingNewWiresCount > 0 && (
        <div className="fixed top-[92px] sm:top-[146px] left-1/2 -translate-x-1/2 z-40">
          <button
            type="button"
            onClick={scrollToNewWires}
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/50 bg-background/95 px-3.5 py-1.5 text-xs font-bold text-amber-400 shadow-lg shadow-amber-500/15 hover:bg-amber-500/15 transition-colors"
          >
            <ArrowUp className="h-3.5 w-3.5" />
            <span>{pendingNewWiresCount} new {pendingNewWiresCount === 1 ? 'wire' : 'wires'}</span>
          </button>
        </div>
      )}

      {/* Chart rails on wide desktops and landscape touch viewports. */}
      <div className="flex justify-center gap-6 xl:px-6">
        <ChartSidebar side="left" />

        {/* Center column — main content */}
        <div className="w-full max-w-2xl min-w-0">
          {/* Profile info — compact on mobile, full on desktop */}
          <ProfileMetaBar />

          {/* Prediction Markets */}
          <PolymarketSection />

          {/* Podcast players */}
          <PodcastLineup />

          {/* Feed */}
          <main>
            <div className="px-4 sm:px-6 py-2.5 border-b border-border/30">
              <div className="flex items-center gap-1 overflow-x-auto scrollbar-none sm:gap-1.5" aria-label="Post type filters">
                {POST_TYPE_FILTERS.map(({ type, label }) => {
                  const isActive = !savedOnly && visiblePostTypes.has(type);
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={(event) => togglePostType(type, event.altKey)}
                      onDoubleClick={() => soloPostType(type)}
                      aria-pressed={isActive}
                      title="Click to toggle · Double-click (or Alt+click) to solo"
                      className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[7px] font-semibold leading-none tracking-tighter transition-colors sm:px-2 sm:py-0.5 sm:text-[9px] sm:tracking-tight ${
                        isActive
                          ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                          : 'border-border/40 bg-muted/20 text-muted-foreground/50 hover:bg-muted/40 hover:text-muted-foreground/80'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setSavedOnly((v) => !v)}
                  aria-pressed={savedOnly}
                  title="Show bookmarked wires"
                  className={`inline-flex items-center gap-0.5 shrink-0 rounded-full border px-1.5 py-0.5 text-[7px] font-semibold leading-none tracking-tighter transition-colors sm:px-2 sm:py-0.5 sm:text-[9px] sm:tracking-tight ${
                    savedOnly
                      ? 'border-amber-500/50 bg-amber-500/20 text-amber-300'
                      : 'border-border/40 bg-muted/20 text-muted-foreground/55 hover:bg-muted/40 hover:text-muted-foreground/80'
                  }`}
                >
                  <Bookmark className={`h-2.5 w-2.5 ${savedOnly ? 'fill-current' : ''}`} />
                  <span>SAVED{savedCount > 0 ? ` (${savedCount})` : ''}</span>
                </button>
                {hasCustomFilter && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    title="Show all wire types"
                    className="inline-flex items-center gap-0.5 shrink-0 rounded-full border border-border/50 bg-muted/30 px-1.5 py-0.5 text-[7px] font-semibold uppercase leading-none text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors sm:px-2 sm:text-[9px]"
                  >
                    <RotateCcw className="h-2.5 w-2.5" />
                    <span>Reset</span>
                  </button>
                )}
                <Tooltip open={postTypeTooltipOpen} onOpenChange={setPostTypeTooltipOpen}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setPostTypeTooltipOpen((open) => !open)}
                      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-amber-400/45 bg-amber-400/15 text-white shadow-[0_0_18px_rgba(245,158,11,0.18)] transition-colors hover:border-amber-300/70 hover:bg-amber-400/25 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60 sm:h-6 sm:w-auto sm:gap-1 sm:px-1.5"
                      aria-label="Post type explanations"
                    >
                      <Info className="h-3 w-3" />
                      <span className="hidden text-[9px] font-black uppercase leading-none tracking-tight sm:inline">Info</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" align="end" className="max-w-[290px] border-amber-400/30 bg-[#080b12]/95 px-4 py-3 text-xs leading-5 text-white shadow-2xl shadow-amber-500/15 backdrop-blur-xl">
                    <div className="space-y-2">
                      <p><span className="font-black text-amber-200">MAIN WIRE</span> 120+ global sources.</p>
                      <p><span className="font-black text-emerald-200">CODE WIRE</span> 400+ open source projects.</p>
                      <p><span className="font-black text-orange-200">DAILY WIRE</span> daily at 21:30 utc.</p>
                      <p><span className="font-black text-purple-200">WEEKLY WIRE</span> fridays at 21:45 utc.</p>
                      <p><span className="font-black text-rose-200">FORWARD WIRE</span> mondays at 11:15 utc.</p>
                      <p><span className="font-black text-cyan-200">EDITOR WIRE</span> hand-picked by the editor.</p>
                      <p className="pt-1 border-t border-white/10 text-[11px] text-white/60">
                        Tip: double-click a filter to solo it · press <kbd className="font-mono text-white/90">/</kbd> to search, <kbd className="font-mono text-white/90">j</kbd>/<kbd className="font-mono text-white/90">k</kbd> to navigate.
                      </p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </div>

              <div className="mt-1.5 flex items-center gap-1.5">
                <Search className="h-3 w-3 shrink-0 text-muted-foreground/40" />
                <input
                  ref={searchInputRef}
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search 500 most recent wires (press /)"
                  aria-label="Search 500 most recent wires"
                  title="Searches only the 500 most recent wires"
                  className="h-5 min-w-0 flex-1 border-0 bg-transparent p-0 text-[10px] text-foreground/85 outline-none ring-0 placeholder:text-muted-foreground/35 focus:outline-none focus:ring-0 sm:text-[11px]"
                />
                {normalizedSearchQuery && (
                  <span className="shrink-0 text-[9px] font-semibold tabular-nums text-amber-400/90 sm:text-[10px]">
                    {filteredEntries.length} {filteredEntries.length === 1 ? 'match' : 'matches'}
                  </span>
                )}
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-muted-foreground/60 transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/40"
                    aria-label="Clear post search"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
            {isError && visiblePosts.length > 0 && (
              <div role="status" className="px-4 py-2 text-xs text-muted-foreground sm:px-6">
                Showing saved wires. Live sync could not finish.{' '}
                <button onClick={() => refetch()} className="font-medium text-primary underline underline-offset-2">Retry</button>
              </div>
            )}
            {isLoading ? (
              <div>
                {Array.from({ length: 8 }).map((_, i) => (
                  <PostSkeleton key={i} />
                ))}
              </div>
            ) : isError && visiblePosts.length === 0 ? (
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
              renderedEntries.length > 0 ? (
                <div>
                  {renderedEntries.map(({ post, type }, index) => (
                    <Fragment key={post.id}>
                      {index === unreadDividerIndex && (
                        <div className="flex items-center gap-3 px-4 sm:px-6 py-2 bg-amber-500/[0.06] border-y border-amber-500/25">
                          <span className="h-px flex-1 bg-amber-500/25" />
                          <span className="text-[9px] font-bold uppercase tracking-widest text-amber-400">
                            Caught up to your last visit
                          </span>
                          <span className="h-px flex-1 bg-amber-500/25" />
                        </div>
                      )}
                      <PostCard
                        event={post}
                        postType={type}
                        isFirst={index === 0}
                        highlightQuery={normalizedSearchQuery}
                        isSaved={savedIds.has(post.id)}
                        onToggleSaved={toggleSaved}
                        isSelected={index === selectedIndex}
                      />
                    </Fragment>
                  ))}
                  {hasMoreToRender && (
                    <div ref={loadMoreRef} className="py-6 text-center">
                      <button
                        type="button"
                        onClick={() => setRenderedCount((count) => Math.min(count + RENDER_BATCH_SIZE, filteredEntries.length))}
                        className="text-xs font-semibold text-muted-foreground/60 hover:text-foreground transition-colors"
                      >
                        Load more wires ({filteredEntries.length - renderedEntries.length} remaining)
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-16 px-4 text-center space-y-2">
                  <p className="text-muted-foreground text-sm">
                    {savedOnly
                      ? 'No saved wires yet. Click the bookmark icon on any wire to save it here.'
                      : 'No posts match the selected filters.'}
                  </p>
                  {hasCustomFilter && (
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="text-xs font-semibold text-amber-400 hover:underline"
                    >
                      Show all wires
                    </button>
                  )}
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

          {/* Footer — extra bottom padding so content clears the floating mini audio player */}
          <footer className="px-4 sm:px-6 pt-8 pb-20 mt-4 border-t border-border/20">
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

        <ChartSidebar side="right" />
      </div>

      {/* Floating mini podcast player when an episode is playing */}
      <StickyAudioBar />
    </div>
  );
};

export default Index;
