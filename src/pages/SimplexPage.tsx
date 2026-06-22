import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { ArrowLeft, ArrowUpRight, Copy, MessageCircle, Radio, Shield, Smartphone, Sparkles, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const SIMPLEX_CHANNEL_URL = 'https://smp4.simplex.im/c#pnthhrx5BfdJEdTJ6QOEhEJ6g-hdwuOiMEFu6dpj3cQ';
const SIMPLEX_APP_URL = 'simplex:/c#pnthhrx5BfdJEdTJ6QOEhEJ6g-hdwuOiMEFu6dpj3cQ?h=smp4.simplex.im';
const FEATURED_RELAYS = ['smp4.simplex.im', 'SimpleX app', 'private channel'];

interface SimplexChannelPreviewProps {
  className?: string;
}

function SimplexChannelPreview({ className }: SimplexChannelPreviewProps) {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timeout = window.setTimeout(() => setLoading(false), 900);
    return () => window.clearTimeout(timeout);
  }, []);

  return (
    <div className={cn('relative overflow-hidden rounded-[2rem] border border-border/70 bg-card/70 shadow-2xl shadow-black/20 backdrop-blur-xl', className)}>
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" />
      <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="absolute -bottom-28 -left-20 h-72 w-72 rounded-full bg-amber-400/10 blur-3xl" />

      <div className="relative z-10 border-b border-border/50 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl border border-cyan-300/25 bg-cyan-300/10 shadow-lg shadow-cyan-500/10">
              <MessageCircle className="h-5 w-5 text-cyan-200" />
            </div>
            <div>
              <p className="text-sm font-black tracking-[-0.02em]">CITADEL WIRE on SimpleX</p>
              <p className="text-xs text-muted-foreground">Channel entry point</p>
            </div>
          </div>

          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-xs font-bold text-emerald-200">
            <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.75)]" />
            {loading ? 'Resolving' : 'Open in app'}
          </div>
        </div>
      </div>

      <div className="relative z-10 min-h-[620px]">
        <SimplexFallbackCard loading={loading} />
      </div>
    </div>
  );
}

function SimplexFallbackCard({ loading }: { loading: boolean }) {
  return (
    <div className="grid min-h-[620px] place-items-center px-5 py-10">
      <div className="mx-auto max-w-lg text-center">
        <div className="relative mx-auto mb-7 grid h-28 w-28 place-items-center rounded-[2rem] border border-cyan-200/20 bg-gradient-to-br from-cyan-300/15 via-background to-amber-300/10 shadow-2xl shadow-cyan-500/10">
          <div className="absolute inset-3 rounded-[1.45rem] border border-white/10" />
          {loading ? <Radio className="h-10 w-10 animate-pulse text-cyan-200" /> : <Smartphone className="h-10 w-10 text-cyan-200" />}
        </div>

        <p className="mb-3 text-xs font-black uppercase tracking-[0.34em] text-cyan-200/90">
          SimpleX channel
        </p>
        <h2 className="text-3xl font-black tracking-[-0.05em] sm:text-5xl">
          Read CITADEL WIRE where the signal is routed privately.
        </h2>
        <p className="mx-auto mt-5 max-w-md text-base leading-7 text-muted-foreground sm:text-lg">
          The browser preview depends on SimpleX relay web-preview metadata. If the channel has not published a public preview yet, open or copy the channel link to join from SimpleX Chat.
        </p>

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button asChild size="lg" className="rounded-full bg-cyan-200 px-6 font-black text-slate-950 hover:bg-cyan-100">
            <a href={SIMPLEX_APP_URL}>
              Open in SimpleX
              <ArrowUpRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
          <CopySimplexButton />
        </div>

        <div className="mt-7 rounded-2xl border border-border/60 bg-background/45 p-3 text-left font-mono text-[11px] leading-5 text-muted-foreground sm:text-xs">
          <span className="select-all break-all">{SIMPLEX_CHANNEL_URL}</span>
        </div>
      </div>
    </div>
  );
}

function CopySimplexButton() {
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(SIMPLEX_CHANNEL_URL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Button type="button" size="lg" variant="outline" onClick={copyLink} className="rounded-full border-border/70 bg-background/60 px-6 font-black hover:bg-muted/60">
      <Copy className="mr-2 h-4 w-4" />
      {copied ? 'Copied' : 'Copy link'}
    </Button>
  );
}

function SignalOrb() {
  return (
    <div className="relative h-64 w-64 sm:h-80 sm:w-80" aria-hidden="true">
      <div className="absolute inset-0 rounded-full border border-cyan-300/20 bg-[radial-gradient(circle_at_50%_35%,rgba(103,232,249,0.25),rgba(15,23,42,0.12)_42%,transparent_68%)] shadow-[0_0_80px_rgba(34,211,238,0.16)]" />
      <div className="absolute inset-8 rounded-full border border-amber-300/20" />
      <div className="absolute inset-16 rounded-full border border-cyan-300/25" />
      <div className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-[1.4rem] border border-white/15 bg-background/80 shadow-2xl backdrop-blur-xl" />
      <div className="absolute left-1/2 top-1/2 grid h-20 w-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[1.4rem]">
        <Terminal className="h-9 w-9 text-amber-200" />
      </div>
      <div className="absolute left-6 top-16 h-3 w-3 rounded-full bg-cyan-300 shadow-[0_0_22px_rgba(103,232,249,0.9)]" />
      <div className="absolute bottom-12 right-8 h-2.5 w-2.5 rounded-full bg-amber-300 shadow-[0_0_22px_rgba(252,211,77,0.9)]" />
      <div className="absolute right-16 top-8 h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,0.85)]" />
    </div>
  );
}

export default function SimplexPage() {
  useSeoMeta({
    title: 'CITADEL WIRE SimpleX Channel',
    description: 'Read the CITADEL WIRE SimpleX channel and open it in SimpleX Chat.',
    ogTitle: 'CITADEL WIRE SimpleX Channel',
    ogDescription: 'Read the CITADEL WIRE SimpleX channel and open it in SimpleX Chat.',
    twitterCard: 'summary',
    twitterTitle: 'CITADEL WIRE SimpleX Channel',
    twitterDescription: 'Read the CITADEL WIRE SimpleX channel and open it in SimpleX Chat.',
  });

  return (
    <div className="min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_50%_-10%,rgba(34,211,238,0.14),transparent_34%),radial-gradient(circle_at_80%_14%,rgba(245,158,11,0.08),transparent_24%),linear-gradient(180deg,rgba(15,23,42,0.12),transparent_45%)]" />

      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/76 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to="/" className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-2 text-sm font-black transition-colors hover:bg-muted/60">
            <ArrowLeft className="h-4 w-4" />
            Back to wire
          </Link>
          <div className="hidden items-center gap-2 text-xs font-bold uppercase tracking-[0.24em] text-muted-foreground sm:flex">
            <Radio className="h-4 w-4 text-emerald-300" />
            SimpleX
          </div>
        </div>
      </header>

      <main>
        <section className="relative isolate mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:py-16">
          <div className="absolute left-1/2 top-8 -z-10 h-56 w-[70vw] -translate-x-1/2 rounded-full bg-cyan-400/10 blur-3xl" />
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
              <Sparkles className="h-3.5 w-3.5" />
              Private routing · public signal
            </div>
            <h1 className="max-w-4xl text-5xl font-black leading-[0.9] tracking-[-0.07em] sm:text-7xl lg:text-8xl">
              CITADEL WIRE, now on SimpleX.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
              Follow the high-signal feed from a SimpleX channel: no global user identifiers, no noisy platform chrome, just the wire and the route to join it.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="rounded-full bg-amber-300 px-6 font-black text-slate-950 hover:bg-amber-200">
                <a href={SIMPLEX_APP_URL}>
                  Open channel
                  <ArrowUpRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full border-border/70 bg-card/60 px-6 font-black hover:bg-muted/60">
                <a href={SIMPLEX_CHANNEL_URL} target="_blank" rel="noopener noreferrer">
                  Web invite
                  <ArrowUpRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>

          <div className="mx-auto lg:ml-auto">
            <SignalOrb />
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            {FEATURED_RELAYS.map((relay) => (
              <Card key={relay} className="border-border/60 bg-card/55 backdrop-blur-xl">
                <CardContent className="flex items-center gap-3 p-4">
                  <Shield className="h-5 w-5 text-cyan-200" />
                  <span className="text-sm font-black">{relay}</span>
                </CardContent>
              </Card>
            ))}
          </div>

          <SimplexChannelPreview />
        </section>
      </main>
    </div>
  );
}
