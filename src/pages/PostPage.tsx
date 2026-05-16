import { useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { format } from 'date-fns';
import { nip19 } from 'nostr-tools';
import { AlertTriangle, ArrowLeft, ArrowUpRight, Check, Copy, Rabbit, Radio, Shield, Sparkles } from 'lucide-react';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NoteContent } from '@/components/NoteContent';
import { PostActionBar } from '@/components/PostActionBar';
import { ReplyComposer } from '@/components/ReplyComposer';
import { MiniEventCard } from '@/components/MiniEventCard';
import { TickerBar } from '@/components/TickerBar';
import { DonateButton } from '@/components/DonateButton';
import { clearStoredGuestAccount, getOrCreateGuestAccount, getStoredGuestPubkey, GUEST_NSEC_STORAGE_KEY, PRIMAL_DOWNLOAD_URL } from '@/components/auth/ActionLoginDialog';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLoginActions } from '@/hooks/useLoginActions';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { usePostEngagement } from '@/hooks/usePostEngagement';
import { CITADEL_FEED_RELAYS, CITADEL_PUBKEY, getPostType } from '@/hooks/useCitadelFeed';
import { genUserName } from '@/lib/genUserName';
import { getEventTitle, parsePostPointer, useNostrEvent } from '@/lib/nostrPost';
import { cn } from '@/lib/utils';
import NotFound from '@/pages/NotFound';

function PostPageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <Skeleton className="mb-6 h-10 w-36" />
      <Card className="overflow-hidden border-border/60 bg-card/70">
        <CardContent className="space-y-5 p-5 sm:p-7">
          <div className="flex items-center gap-3">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-56" />
            </div>
          </div>
          <div className="space-y-3">
            <Skeleton className="h-5 w-11/12" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-3/4" />
          </div>
          <Skeleton className="h-12 w-full rounded-full" />
        </CardContent>
      </Card>
    </div>
  );
}

interface PostLocationState {
  event?: NostrEvent;
}

function isMatchingInitialEvent(event: NostrEvent | undefined, pointer: ReturnType<typeof parsePostPointer>): event is NostrEvent {
  if (!event || !pointer) return false;
  if (pointer.id) return event.id === pointer.id;
  if (pointer.createdAt) return event.created_at === pointer.createdAt;
  return Boolean(pointer.idPrefix && event.id.startsWith(pointer.idPrefix));
}

export default function PostPage() {
  const { identifier } = useParams<{ identifier: string }>();
  const location = useLocation();
  const pointer = useMemo(() => parsePostPointer(identifier), [identifier]);
  const locationState = location.state as PostLocationState | null;
  const initialEvent = isMatchingInitialEvent(locationState?.event, pointer) ? locationState.event : undefined;
  const { data: event, isLoading, isError } = useNostrEvent(pointer, initialEvent);
  const [replyOpen, setReplyOpen] = useState(false);
  const { user } = useCurrentUser();
  const isAnonAccount = Boolean(user && getStoredGuestPubkey() === user.pubkey);
  const author = useAuthor(event?.pubkey);
  const engagement = usePostEngagement(event);

  const metadata: NostrMetadata | undefined = author.data?.metadata;
  const displayName = metadata?.display_name ?? metadata?.name ?? (event ? genUserName(event.pubkey) : 'CITADEL WIRE');
  const avatar = metadata?.picture;
  const title = event ? getEventTitle(event) : 'CITADEL WIRE post';
  const postType = event ? getPostType(event) : 'standard';
  const published = event ? format(new Date(event.created_at * 1000), 'MMMM d, yyyy · h:mm a') : '';

  useSeoMeta({
    title: `${title} · CITADEL WIRE`,
    description: event?.content.slice(0, 160) ?? 'CITADEL WIRE post with kind 1 replies, likes, reposts and zaps.',
    ogTitle: `${title} · CITADEL WIRE`,
    ogDescription: event?.content.slice(0, 160) ?? 'CITADEL WIRE post with kind 1 replies, likes, reposts and zaps.',
    twitterCard: 'summary',
    twitterTitle: `${title} · CITADEL WIRE`,
    twitterDescription: event?.content.slice(0, 160) ?? 'CITADEL WIRE post with kind 1 replies, likes, reposts and zaps.',
  });

  if (!pointer) return <NotFound />;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <PostDetailHeader />
        <PostPageSkeleton />
      </div>
    );
  }

  if (isError || !event) {
    return (
      <div className="min-h-screen bg-background">
        <PostDetailHeader />
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <Card className="border-dashed bg-card/50">
            <CardContent className="p-8">
              <p className="text-lg font-semibold">Post not found</p>
              <p className="mt-2 text-sm text-muted-foreground">
                This event was not available on the configured relays. Try again in a moment or open it in another Nostr client.
              </p>
              <Link to="/" className="mt-5 inline-flex text-sm font-semibold text-amber-300 hover:underline">
                Back to CITADEL WIRE
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const replies = engagement.data?.replies ?? [];
  const quoteReposts = engagement.data?.quoteReposts ?? [];
  const zaps = engagement.data?.zaps ?? [];
  const likes = engagement.data?.likes ?? [];
  const reposts = engagement.data?.reposts ?? [];

  return (
    <div className="min-h-screen bg-background">
      <PostDetailHeader />

      <main className="relative mx-auto w-full max-w-3xl px-4 py-5 sm:px-6 sm:py-8">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-80 bg-[radial-gradient(circle_at_50%_0%,rgba(245,158,11,0.09),transparent_58%)]" />

        <Link
          to="/"
          className="relative z-10 mb-4 inline-flex items-center gap-2 rounded-full border border-border/50 bg-card/60 px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to wire
        </Link>

        <article className="relative z-10 overflow-hidden rounded-[28px] border border-border/60 bg-card/72 shadow-2xl shadow-black/20 backdrop-blur-xl">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/60 to-transparent" />
          <div className="p-5 sm:p-7">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar className="h-12 w-12 border border-amber-300/20 ring-4 ring-amber-300/5">
                  <AvatarImage src={avatar} alt={displayName} />
                  <AvatarFallback className="bg-amber-400/10 text-xs font-black text-amber-200">
                    {displayName.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="truncate text-base font-black tracking-[-0.02em]">
                    {displayName}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {published}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-amber-400/25 bg-amber-400/10 text-amber-200">
                  {postType === 'standard' ? 'MAIN WIRE' : postType.replace('-', ' ').toUpperCase()}
                </Badge>

              </div>
            </div>

            <NoteContent event={event} className="text-[17px] leading-8 text-foreground/95 sm:text-[18px]" />

            <PostActionBar
              event={event}
              expanded
              onComment={() => setReplyOpen(true)}
              onActionSuccess={() => window.location.reload()}
              className="mt-6 justify-around border-y border-border/40 py-3"
            />
          </div>
        </article>

        {replyOpen && (
          <div className="relative z-10 mt-4">
            <ReplyComposer root={event} onCancel={() => setReplyOpen(false)} onSuccess={() => window.location.reload()} />
          </div>
        )}

        {!user && <InlineAnonAccountPanel event={event} className="relative z-10 mt-4" />}
        {isAnonAccount && <AnonAccountStatusPanel className="relative z-10 mt-4" />}

        <section className="relative z-10 mt-6">
          <Tabs defaultValue="replies" className="w-full">
            <TabsList className="grid h-auto w-full grid-cols-4 rounded-2xl border border-border/50 bg-card/70 p-1 backdrop-blur">
              <TabsTrigger value="replies" className="rounded-xl py-2 text-xs sm:text-sm">Replies</TabsTrigger>
              <TabsTrigger value="likes" className="rounded-xl py-2 text-xs sm:text-sm">Likes</TabsTrigger>
              <TabsTrigger value="reposts" className="rounded-xl py-2 text-xs sm:text-sm">Reposts</TabsTrigger>
              <TabsTrigger value="zaps" className="rounded-xl py-2 text-xs sm:text-sm">Zaps</TabsTrigger>
            </TabsList>

            <TabsContent value="replies" className="mt-4 space-y-4">
              <ThreadRepliesSection replies={replies} />
            </TabsContent>

            <TabsContent value="likes" className="mt-4">
              <EngagementCard title="People who liked this" empty="No likes found yet.">
                {likes.map((like) => <MiniEventCard key={like.id} event={like} label="Like" />)}
              </EngagementCard>
            </TabsContent>

            <TabsContent value="reposts" className="mt-4">
              <EngagementCard title="Reposts and quotes" empty="No reposts found yet.">
                {quoteReposts.map((quote) => <MiniEventCard key={quote.id} event={quote} label="Quote" />)}
                {reposts.slice(0, 30).map((repost) => <MiniEventCard key={repost.id} event={repost} label="Repost" />)}
              </EngagementCard>
            </TabsContent>

            <TabsContent value="zaps" className="mt-4">
              <EngagementCard title="Lightning zaps" empty="No zap receipts found yet.">
                {zaps.map((zap) => <MiniEventCard key={zap.id} event={zap} label="Zap" />)}
              </EngagementCard>
            </TabsContent>
          </Tabs>
        </section>
      </main>
    </div>
  );
}

function AnonAccountStatusPanel({ className }: { className?: string }) {
  const login = useLoginActions();
  const [copiedNsec, setCopiedNsec] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const handleExportAccount = async () => {
    const nsec = localStorage.getItem(GUEST_NSEC_STORAGE_KEY);
    if (!nsec) {
      setCopyError('No ANON ACCOUNT key was found in this browser.');
      return;
    }

    try {
      await navigator.clipboard.writeText(nsec);
      setCopyError(null);
      setCopiedNsec(true);
      setTimeout(() => setCopiedNsec(false), 1800);
    } catch {
      setCopiedNsec(false);
      setCopyError('Could not copy the ANON ACCOUNT key.');
    }
  };

  const handleSignOut = async () => {
    clearStoredGuestAccount();
    await login.logout();
    window.location.reload();
  };

  return (
    <Card className={cn(
      'overflow-hidden border-emerald-300/15 bg-emerald-300/[0.055] text-white shadow-xl shadow-emerald-500/5 backdrop-blur-xl',
      className,
    )}>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-300/10">
            <Shield className="h-5 w-5 text-emerald-200" />
          </div>
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-200/80">ANON ACCOUNT active</p>
            <p className="mt-1 text-sm text-white/58">Signed in with a locally stored browser account.</p>
            {copyError && <p className="mt-1 text-xs font-semibold text-red-200">{copyError}</p>}
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            type="button"
            variant="ghost"
            onClick={handleExportAccount}
            className="h-10 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 text-sm font-black text-emerald-100 hover:bg-emerald-300/15 hover:text-white"
          >
            {copiedNsec ? (
              <>
                <Check className="mr-1.5 h-4 w-4" />
                Copied
              </>
            ) : (
              <>
                <Copy className="mr-1.5 h-4 w-4" />
                Export account
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={handleSignOut}
            className="h-10 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-black text-white/72 hover:bg-white/10 hover:text-white"
          >
            Sign out
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function InlineAnonAccountPanel({ event, className }: { event: NostrEvent; className?: string }) {
  const login = useLoginActions();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [anonName, setAnonName] = useState<string | null>(null);
  const [copiedEventId, setCopiedEventId] = useState(false);
  const eventIdentifier = useMemo(() => nip19.neventEncode({ id: event.id, author: event.pubkey, relays: CITADEL_FEED_RELAYS }), [event.id, event.pubkey]);
  const eventDeepLink = `nostr:${eventIdentifier}`;

  const handleCopyEventId = async () => {
    try {
      await navigator.clipboard.writeText(eventIdentifier);
      setCopiedEventId(true);
      setTimeout(() => setCopiedEventId(false), 1800);
    } catch {
      setError('Could not copy the event ID.');
    }
  };

  const handleCreateAnonAccount = async () => {
    setIsCreating(true);
    setError(null);

    try {
      const account = getOrCreateGuestAccount();
      setAnonName(account.name);
      login.nsec(account.nsec);

      try {
        await publishEvent({
          kind: 0,
          content: JSON.stringify({
            name: account.name,
            display_name: account.name,
            about: 'ANON CITADEL WIRE account stored locally in this browser.',
          }),
          tags: [],
        });
      } catch (profileError) {
        console.warn('ANON profile publish failed', profileError);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create an ANON ACCOUNT.');
      setIsCreating(false);
    }
  };

  return (
    <Card className={cn(
      'overflow-hidden border-white/10 bg-[#080b12]/92 text-white shadow-2xl shadow-amber-500/10 backdrop-blur-2xl',
      className,
    )}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(245,158,11,0.22),transparent_35%),radial-gradient(circle_at_94%_24%,rgba(56,189,248,0.13),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.06),transparent_50%)]" />
      <CardContent className="relative p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-300/10 shadow-[0_0_40px_rgba(245,158,11,0.12)]">
              <Shield className="h-5 w-5 text-amber-200" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-amber-200/75">Join the signal</p>
              <p className="mt-1 text-sm leading-6 text-white/72">
                REPLY, LIKE, REPOST, OR ZAP FROM A LOCALLY STORED ANON ACCOUNT
              </p>
            </div>
          </div>

          <Button
            type="button"
            onClick={handleCreateAnonAccount}
            disabled={isCreating}
            className="h-11 shrink-0 rounded-2xl bg-gradient-to-r from-emerald-300 to-amber-300 px-5 text-sm font-black text-black shadow-lg shadow-emerald-500/10 hover:from-emerald-200 hover:to-amber-200"
          >
            {isCreating ? 'Creating…' : 'CREATE ANON ACCOUNT'}
          </Button>
        </div>

        {anonName && (
          <div className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-xs font-semibold text-emerald-100">
            <Check className="mr-1 inline h-3.5 w-3.5" />
            {anonName}
          </div>
        )}

        {error && (
          <Alert className="mt-4 border-red-400/30 bg-red-500/10 text-red-100">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.035] p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/38">Open in any Nostr app</p>
              <p className="mt-1 truncate font-mono text-[11px] text-white/58">{eventIdentifier}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <a
                href={eventDeepLink}
                className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/72 hover:bg-white/10 hover:text-white"
              >
                Open
              </a>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleCopyEventId}
                className="rounded-xl border border-white/10 bg-white/[0.04] px-3 text-white/72 hover:bg-white/10 hover:text-white"
              >
                {copiedEventId ? <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-200" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                {copiedEventId ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-2 text-[11px] font-medium leading-4 text-white/48 sm:flex-row sm:items-center sm:justify-between sm:text-xs">
          <div className="flex items-center gap-2">
            <Rabbit className="h-4 w-4 shrink-0 text-amber-200/70" />
            <span>ANON ACCOUNT keys live only in this browser. Clear browser storage and they are gone.</span>
            <Sparkles className="hidden h-4 w-4 shrink-0 text-sky-200/70 sm:block" />
          </div>
          <a
            href={PRIMAL_DOWNLOAD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 font-bold text-amber-200 underline underline-offset-4 hover:text-amber-100"
          >
            Need a Nostr app?
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

function PostDetailHeader() {
  const author = useAuthor(CITADEL_PUBKEY);
  const metadata = author.data?.metadata;

  return (
    <header className="sticky top-0 z-50 border-b border-border/40 bg-background/82 backdrop-blur-xl">
      <div className="mx-auto flex max-w-3xl flex-col gap-2 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <Link to="/" className="flex min-w-0 shrink-0 items-center gap-2 text-sm font-black tracking-[-0.02em] hover:opacity-80">
            <Avatar className="h-8 w-8 shrink-0 ring-2 ring-border/40">
              {metadata?.picture ? (
                <AvatarImage src={metadata.picture} alt={metadata.display_name ?? metadata.name ?? 'CITADEL WIRE'} />
              ) : null}
              <AvatarFallback className="text-[10px] font-bold bg-primary text-primary-foreground">CW</AvatarFallback>
            </Avatar>
            <span className="hidden xs:inline sm:inline">CITADEL WIRE</span>
          </Link>
          <DonateButton />
        </div>
        <div className="min-w-0 overflow-x-auto pb-0.5 scrollbar-none">
          <TickerBar />
        </div>
      </div>
    </header>
  );
}

function ThreadRepliesSection({ replies }: { replies: NostrEvent[] }) {
  return (
    <Card className="border-border/50 bg-card/70">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3 text-lg">
          <span className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-amber-300" />
            Kind 1 replies
          </span>
          <span className="rounded-full border border-border/50 bg-muted/30 px-2.5 py-1 text-xs font-semibold text-muted-foreground">
            {replies.length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {replies.length > 0 ? (
          <div className="space-y-3">
            {replies.map((reply) => <MiniEventCard key={reply.id} event={reply} />)}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
            No kind 1 replies yet.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EngagementCard({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children;
  const hasItems = Array.isArray(items) ? items.length > 0 : Boolean(items);

  return (
    <Card className="border-border/50 bg-card/70">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Radio className="h-4 w-4 text-amber-300" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {hasItems ? (
          <div className="space-y-3">{items}</div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
            {empty}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
