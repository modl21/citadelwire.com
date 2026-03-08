import { useState, useEffect } from 'react';
import { useMarketData } from '@/hooks/useMarketData';
import { Skeleton } from '@/components/ui/skeleton';
import { Bitcoin, Box, Clock } from 'lucide-react';

function formatPrice(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatBlockHeight(value: number): string {
  return value.toLocaleString('en-US');
}

function useUTCClock(): string {
  const [time, setTime] = useState(() => formatUTC(new Date()));
  useEffect(() => {
    const id = setInterval(() => setTime(formatUTC(new Date())), 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

function formatUTC(date: Date): string {
  const h = date.getUTCHours().toString().padStart(2, '0');
  const m = date.getUTCMinutes().toString().padStart(2, '0');
  const s = date.getUTCSeconds().toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export function TickerBar() {
  const { data, isLoading } = useMarketData();
  const utcTime = useUTCClock();

  return (
    <div className="flex items-center gap-2 sm:gap-5 text-[11px] sm:text-xs font-medium">
      {/* Block Height */}
      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        <Box className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-purple-400" />
        <span className="hidden sm:inline text-muted-foreground/60">Block</span>
        {isLoading || !data?.blockHeight ? (
          <Skeleton className="h-3 sm:h-3.5 w-14 sm:w-20" />
        ) : (
          <a
            href={`https://mempool.space/block/${data.blockHeight}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground font-semibold tabular-nums hover:text-purple-400 transition-colors"
          >
            {formatBlockHeight(data.blockHeight)}
          </a>
        )}
      </div>

      <div className="w-px h-3 bg-border/50 shrink-0" />

      {/* BTC Price */}
      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        <Bitcoin className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-amber-500" />
        <span className="hidden sm:inline text-muted-foreground/60">BTC</span>
        {isLoading || !data?.btcPrice ? (
          <Skeleton className="h-3 sm:h-3.5 w-12 sm:w-16" />
        ) : (
          <span className="text-foreground font-semibold tabular-nums">
            {formatPrice(data.btcPrice)}
          </span>
        )}
      </div>

      <div className="w-px h-3 bg-border/50 shrink-0" />

      {/* Gold (XAUT) Price */}
      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        <span className="text-yellow-500 text-[11px] sm:text-sm leading-none">Au</span>
        <span className="hidden sm:inline text-muted-foreground/60">XAUT</span>
        {isLoading || !data?.goldPrice ? (
          <Skeleton className="h-3 sm:h-3.5 w-12 sm:w-16" />
        ) : (
          <span className="text-foreground font-semibold tabular-nums">
            {formatPrice(data.goldPrice)}
          </span>
        )}
      </div>

      <div className="w-px h-3 bg-border/50 shrink-0" />

      {/* UTC Clock */}
      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        <Clock className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-sky-400" />
        <span className="text-foreground font-semibold tabular-nums">{utcTime}</span>
        <span className="hidden sm:inline text-muted-foreground/50">UTC</span>
      </div>
    </div>
  );
}
