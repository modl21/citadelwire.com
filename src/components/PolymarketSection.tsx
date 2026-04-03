import { useState } from 'react';
import { usePolymarkets, type ParsedMarket } from '@/hooks/usePolymarkets';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, ChevronDown } from 'lucide-react';

function formatVolume(usd: number): string {
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(0)}K`;
  return `$${usd.toFixed(0)}`;
}

function MarketRow({ market }: { market: ParsedMarket }) {
  const pct = Math.round(market.leadPrice * 100);

  return (
    <a
      href={`https://polymarket.com/event/${market.eventSlug}`}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-2.5 py-2 px-3 sm:px-4 rounded-lg transition-colors hover:bg-muted/40"
    >
      {/* Probability badge */}
      <div className="shrink-0 min-w-[3rem] text-center rounded px-1.5 py-0.5 text-[11px] font-extrabold tabular-nums bg-foreground/10 text-amber-400">
        {pct}%
      </div>

      {/* Question + leading option */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-1.5">
          <span className="text-[13px] sm:text-sm text-foreground/90 leading-snug group-hover:text-foreground transition-colors truncate">
            {market.question}
          </span>
          {market.isMultiChoice && market.leadName && (
            <span className="text-[11px] sm:text-[11px] text-amber-400 font-semibold shrink-0">
              {market.leadName}
            </span>
          )}
        </div>
      </div>

      {/* 24h Volume */}
      <span className="shrink-0 text-[10px] sm:text-[11px] text-foreground/70 font-semibold tabular-nums">
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
  const [expanded, setExpanded] = useState(false);

  if (isError) return null;
  if (!isLoading && (!markets || markets.length === 0)) return null;

  const hasMore = !isLoading && markets && markets.length > 2;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-2.5 border-b border-border/30">
      {/* Section header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <TrendingUp className="h-3 w-3 text-amber-400" />
          <span className="text-[9px] font-semibold text-muted-foreground/50 uppercase tracking-wider">
            Prediction Markets
          </span>
        </div>
        <span className="text-[9px] text-muted-foreground/30 font-medium">
          via Polymarket
        </span>
      </div>

      {/* Always-visible top 2 markets */}
      <div className="-mx-3 sm:-mx-4">
        {isLoading ? (
          <>
            <MarketSkeleton />
            <MarketSkeleton />
          </>
        ) : (
          markets!.slice(0, 2).map((market) => (
            <MarketRow key={market.id} market={market} />
          ))
        )}
      </div>

      {/* Expanded markets */}
      {expanded && !isLoading && markets && (
        <div className="-mx-3 sm:-mx-4">
          {markets.slice(2, 15).map((market) => (
            <MarketRow key={market.id} market={market} />
          ))}
        </div>
      )}

      {/* Show more / Show less button */}
      {hasMore && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full mt-1.5 py-2 rounded-lg border border-border/40 bg-muted/20 hover:bg-muted/40 transition-colors flex items-center justify-center gap-1.5"
        >
          <span className="text-xs font-semibold text-muted-foreground/70">
            {expanded ? 'Show Less' : `Show ${Math.min(markets!.length, 15) - 2} More Markets`}
          </span>
          <ChevronDown
            className={`h-3.5 w-3.5 text-muted-foreground/50 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          />
        </button>
      )}
    </div>
  );
}
