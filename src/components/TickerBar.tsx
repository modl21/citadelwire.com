import { useState, useEffect } from 'react';
import { useMarketData } from '@/hooks/useMarketData';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
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

function useUTCClock(): { time: string; date: string } {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return { time: formatUTCTime(now), date: formatUTCDate(now) };
}

function formatUTCTime(date: Date): string {
  const h = date.getUTCHours().toString().padStart(2, '0');
  const m = date.getUTCMinutes().toString().padStart(2, '0');
  const s = date.getUTCSeconds().toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function formatUTCDate(date: Date): string {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

const CHART_SPANS = [
  { label: '7D', span: '7d', exchange: 'bitstamp', url: 'https://bitcoinity.org/markets/bitstamp/USD' },
  { label: '30D', span: '30d', exchange: 'coinbase', url: 'https://bitcoinity.org/markets/coinbase/USD' },
] as const;

function BtcChartDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [activeIdx, setActiveIdx] = useState(1); // default 30D
  const chart = CHART_SPANS[activeIdx];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden bg-background border-border/60 gap-0">
        <VisuallyHidden>
          <DialogTitle>Bitcoin Price Chart</DialogTitle>
        </VisuallyHidden>
        <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
          <Bitcoin className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-semibold text-foreground">Bitcoin</span>
          <div className="flex items-center gap-0.5 ml-1">
            {CHART_SPANS.map((s, i) => (
              <button
                key={s.label}
                onClick={() => setActiveIdx(i)}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                  i === activeIdx
                    ? 'bg-amber-500/20 text-amber-400'
                    : 'text-muted-foreground/50 hover:text-muted-foreground/80 hover:bg-muted/40'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <span className="text-xs text-muted-foreground/50 ml-auto capitalize">{chart.exchange} / USD</span>
        </div>
        <a
          href={chart.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block bg-[#1a1a2e] dark:bg-background"
        >
          <img
            src={`https://bitcoinity.org/markets/image?span=${chart.span}&size=medium&currency=USD&exchange=${chart.exchange}`}
            alt={`Bitcoin ${chart.label} price chart`}
            className="w-full h-auto block dark:opacity-90 dark:invert-0"
            style={{ minHeight: 180 }}
          />
        </a>
        <div className="px-4 py-2 border-t border-border/40">
          <a
            href={chart.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors"
          >
            bitcoinity.org
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function TickerBar() {
  const { data, isLoading } = useMarketData();
  const { time: utcTime, date: utcDate } = useUTCClock();
  const [chartOpen, setChartOpen] = useState(false);

  return (
    <>
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
            <button
              onClick={() => setChartOpen(true)}
              className="text-foreground font-semibold tabular-nums hover:text-amber-500 transition-colors cursor-pointer"
            >
              {formatPrice(data.btcPrice)}
            </button>
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
          <span className="text-muted-foreground/50">{utcDate}</span>
          <span className="hidden sm:inline text-muted-foreground/50">UTC</span>
        </div>
      </div>

      <BtcChartDialog open={chartOpen} onOpenChange={setChartOpen} />
    </>
  );
}
