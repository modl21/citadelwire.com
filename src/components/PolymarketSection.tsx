import { usePolymarkets, type ParsedMarket } from '@/hooks/usePolymarkets';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

function formatVolume(usd: number): string {
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(0)}K`;
  return `$${usd.toFixed(0)}`;
}

function formatPercent(price: number): string {
  return `${Math.round(price * 100)}%`;
}

function MarketRow({ market }: { market: ParsedMarket }) {
  const yesOutcome = market.outcomes.find((o) => o.name === 'Yes');
  const noOutcome = market.outcomes.find((o) => o.name === 'No');
  const leadOutcome = yesOutcome && yesOutcome.price >= 0.5 ? yesOutcome : noOutcome;
  const leadPct = leadOutcome ? leadOutcome.price : 0;
  const isYesLeading = leadOutcome?.name === 'Yes';

  return (
    <a
      href={`https://polymarket.com/event/${market.eventSlug}`}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-2.5 py-2 px-3 sm:px-4 rounded-lg transition-colors hover:bg-muted/40"
    >
      {/* Probability badge */}
      <div
        className={cn(
          'shrink-0 w-12 text-center rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums',
          isYesLeading
            ? 'bg-emerald-500/15 text-emerald-400'
            : 'bg-rose-500/15 text-rose-400',
        )}
      >
        {formatPercent(leadPct)}
      </div>

      {/* Question */}
      <span className="flex-1 min-w-0 text-[13px] sm:text-sm text-foreground/90 leading-snug truncate group-hover:text-foreground transition-colors">
        {market.question}
      </span>

      {/* 24h Volume */}
      <span className="shrink-0 text-[10px] sm:text-[11px] text-muted-foreground/50 font-medium tabular-nums hidden sm:block">
        {formatVolume(market.volume24hr)}
      </span>
    </a>
  );
}

function MarketSkeleton() {
  return (
    <div className="flex items-center gap-2.5 py-2 px-3 sm:px-4">
      <Skeleton className="h-5 w-12 rounded" />
      <Skeleton className="h-4 flex-1" />
      <Skeleton className="h-3 w-10 hidden sm:block" />
    </div>
  );
}

export function PolymarketSection() {
  const { data: markets, isLoading, isError } = usePolymarkets();

  // Don't render at all if error or empty after load
  if (isError) return null;
  if (!isLoading && (!markets || markets.length === 0)) return null;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-2.5 border-b border-border/30">
      {/* Section header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <TrendingUp className="h-3 w-3 text-sky-400" />
          <span className="text-[9px] font-semibold text-muted-foreground/50 uppercase tracking-wider">
            Prediction Markets
          </span>
        </div>
        <a
          href="https://polymarket.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[9px] text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors font-medium"
        >
          via Polymarket
        </a>
      </div>

      {/* Market rows */}
      <div className="-mx-3 sm:-mx-4">
        {isLoading ? (
          <>
            {Array.from({ length: 4 }).map((_, i) => (
              <MarketSkeleton key={i} />
            ))}
          </>
        ) : (
          markets!.slice(0, 6).map((market) => (
            <MarketRow key={market.id} market={market} />
          ))
        )}
      </div>
    </div>
  );
}
