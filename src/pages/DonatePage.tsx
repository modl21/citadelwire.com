import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { EyeOff, Heart, Shield, Zap } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TickerBar } from '@/components/TickerBar';
import { DonateButton, DonateContent } from '@/components/DonateButton';
import { useAuthor } from '@/hooks/useAuthor';
import { CITADEL_PUBKEY } from '@/hooks/useCitadelFeed';
import { useTopSupporters } from '@/hooks/useTopSupporters';
import { cn } from '@/lib/utils';

function DonateHeader() {
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
          <TickerBar live={false} />
        </div>
      </div>
    </header>
  );
}

const VALUE_POINTS = [
  { icon: Heart, label: '100% reader funded' },
  { icon: EyeOff, label: 'No ads or sponsors' },
  { icon: Shield, label: 'Bitcoin & Monero accepted' },
] as const;

function TopSupportersGrid() {
  const { data: supporters, isLoading } = useTopSupporters(12);

  if (isLoading) {
    return (
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <Skeleton className="h-10 w-10 rounded-full" />
            <Skeleton className="h-2.5 w-8" />
          </div>
        ))}
      </div>
    );
  }

  if (!supporters || supporters.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-3">
      {supporters.map((supporter, index) => {
        const npub = nip19.npubEncode(supporter.pubkey);
        const displayName = supporter.metadata.display_name || supporter.metadata.name || `${npub.slice(0, 12)}...`;
        return (
          <a
            key={supporter.pubkey}
            href={`https://primal.net/p/${npub}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center gap-1 group"
            title={`${displayName} — ${supporter.totalSats.toLocaleString('en-US')} sats`}
          >
            <div className="relative">
              <Avatar className={cn(
                'h-10 w-10 ring-1 transition-transform group-hover:scale-110',
                index === 0 ? 'ring-amber-500/60' : index <= 2 ? 'ring-amber-500/40' : 'ring-border/40',
              )}>
                <AvatarImage src={supporter.metadata.picture} alt={displayName} />
                <AvatarFallback delayMs={200}>{displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              {index === 0 && (
                <div className="absolute -top-0.5 -right-0.5 bg-amber-500 text-white rounded-full w-3.5 h-3.5 flex items-center justify-center">
                  <Zap className="h-2 w-2" />
                </div>
              )}
            </div>
            <span className="text-[9px] text-muted-foreground/60 tabular-nums font-semibold group-hover:text-foreground/80 transition-colors">
              {supporter.totalSats >= 1000 ? `${Math.round(supporter.totalSats / 1000)}k` : supporter.totalSats} sats
            </span>
          </a>
        );
      })}
    </div>
  );
}

export default function DonatePage() {
  useSeoMeta({
    title: 'Support CITADEL WIRE',
    description: 'Support independent, high signal news with Bitcoin, Monero, or crypto. No ads, no sponsors, no paywalls.',
    ogTitle: 'Support CITADEL WIRE',
    ogDescription: 'Support independent, high signal news with Bitcoin, Monero, or crypto. No ads, no sponsors, no paywalls.',
    ogImage: 'https://blossom.primal.net/7e50fc1128859dfdc43d504e2cafec4a1e1e5067b5c6245232a11ee75fdc84d7.jpg',
    ogType: 'website',
    twitterCard: 'summary',
    twitterTitle: 'Support CITADEL WIRE',
    twitterDescription: 'Support independent, high signal news with Bitcoin, Monero, or crypto. No ads, no sponsors, no paywalls.',
    twitterImage: 'https://blossom.primal.net/7e50fc1128859dfdc43d504e2cafec4a1e1e5067b5c6245232a11ee75fdc84d7.jpg',
  });

  return (
    <div className="min-h-screen bg-background">
      <DonateHeader />

      <main className="mx-auto w-full max-w-md px-4 pt-10 pb-8 sm:px-6 sm:pt-14">
        {/* Hero */}
        <div className="text-center mb-8">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/15 ring-1 ring-amber-500/30 shadow-[0_0_50px_rgba(245,158,11,0.25)]">
            <Zap className="h-8 w-8 text-amber-400" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
            Support CITADEL WIRE
          </h1>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
            Independent, high signal news — funded by readers like you. Every sat keeps the signal strong.
          </p>
        </div>

        {/* Donation flow — identical to the homepage dialog */}
        <Card className="border-border/60 bg-card/70 shadow-xl shadow-amber-500/5">
          <CardContent className="p-5 sm:p-6">
            <DonateContent onClose={() => {}} />
          </CardContent>
        </Card>

        {/* Value points */}
        <div className="mt-8 flex items-center justify-center gap-4 sm:gap-6">
          {VALUE_POINTS.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-medium text-muted-foreground/60">
              <Icon className="h-3.5 w-3.5 text-amber-500/70 shrink-0" />
              <span className="whitespace-nowrap">{label}</span>
            </div>
          ))}
        </div>

        {/* Top supporters */}
        <section className="mt-10 border-t border-border/30 pt-8">
          <h2 className="text-center text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider mb-5">
            Top Supporters
          </h2>
          <TopSupportersGrid />
        </section>
      </main>

      {/* Footer */}
      <footer className="px-4 sm:px-6 py-8 border-t border-border/20">
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
}
