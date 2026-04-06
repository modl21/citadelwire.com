import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useMarketData } from '@/hooks/useMarketData';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Bitcoin, Box, Clock } from 'lucide-react';

const CORS_PROXY = 'https://proxy.shakespeare.diy/?url=';

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

// ── BTC Chart Dialog ────────────────────────────────────────

const BTC_CHART_SPANS = [
  { label: '24H', span: '24h', exchange: 'bitstamp', url: 'https://bitcoinity.org/markets/bitstamp/USD', img: 'https://bitcoinity.org/markets/image?span=24h&size=medium&currency=USD&exchange=bitstamp' },
  { label: '7D', span: '7d', exchange: 'bitstamp', url: 'https://bitcoinity.org/markets/bitstamp/USD', img: 'https://bitcoinity.org/markets/image?span=7d&size=medium&currency=USD&exchange=bitstamp' },
  { label: '30D', span: '30d', exchange: 'coinbase', url: 'https://bitcoinity.org/markets/coinbase/USD', img: 'https://bitcoinity.org/markets/image?span=30d&size=medium&currency=USD&exchange=coinbase' },
  { label: '6M', span: '6m', exchange: 'bitstamp', url: 'https://bitcoinity.org/markets/bitstamp/USD', img: 'https://bitcoinity.org/markets/image?span=6m&size=medium&currency=USD&exchange=bitstamp' },
] as const;

function BtcChartDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [activeIdx, setActiveIdx] = useState(2);
  const chart = BTC_CHART_SPANS[activeIdx];

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
            {BTC_CHART_SPANS.map((s, i) => (
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
            src={chart.img}
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

// ── XAUT Sparkline Chart ────────────────────────────────────

const XAUT_SPANS = [
  { label: '24H', days: 1 },
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '6M', days: 180 },
] as const;

function useXautChart(days: number, enabled: boolean) {
  return useQuery<number[][]>({
    queryKey: ['xaut-chart', days],
    queryFn: async () => {
      const url = `https://api.coingecko.com/api/v3/coins/tether-gold/market_chart?vs_currency=usd&days=${days}`;
      let res: Response;
      try {
        res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      } catch {
        res = await fetch(`${CORS_PROXY}${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(10000) });
      }
      if (!res.ok) throw new Error(`CoinGecko error: ${res.status}`);
      const data = await res.json();
      return data.prices as number[][];
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

function SparklineCanvas({ prices, width, height }: { prices: number[][]; width: number; height: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || prices.length < 2) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const values = prices.map((p) => p[1]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const padTop = 16;
    const padBottom = 24;
    const padLeft = 0;
    const padRight = 0;
    const chartW = width - padLeft - padRight;
    const chartH = height - padTop - padBottom;

    // Gradient fill
    const gradient = ctx.createLinearGradient(0, padTop, 0, height - padBottom);
    gradient.addColorStop(0, 'rgba(234, 179, 8, 0.25)');
    gradient.addColorStop(1, 'rgba(234, 179, 8, 0.02)');

    ctx.beginPath();
    for (let i = 0; i < values.length; i++) {
      const x = padLeft + (i / (values.length - 1)) * chartW;
      const y = padTop + (1 - (values[i] - min) / range) * chartH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    // Fill area
    ctx.lineTo(padLeft + chartW, padTop + chartH);
    ctx.lineTo(padLeft, padTop + chartH);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Line
    ctx.beginPath();
    for (let i = 0; i < values.length; i++) {
      const x = padLeft + (i / (values.length - 1)) * chartW;
      const y = padTop + (1 - (values[i] - min) / range) * chartH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Price labels
    const computedStyle = getComputedStyle(document.documentElement);
    const isMuted = computedStyle.getPropertyValue('--muted-foreground').trim();
    const labelColor = isMuted ? `hsl(${isMuted} / 0.5)` : 'rgba(150,150,150,0.5)';

    ctx.fillStyle = labelColor;
    ctx.font = '10px Inter Variable, Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`$${max.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, padLeft + 4, padTop - 4);
    ctx.fillText(`$${min.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, padLeft + 4, padTop + chartH + 14);

    // Current price (last value)
    const last = values[values.length - 1];
    ctx.fillStyle = '#eab308';
    ctx.font = 'bold 11px Inter Variable, Inter, system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`$${last.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, padLeft + chartW - 4, padTop - 4);
  }, [prices, width, height]);

  useEffect(() => { draw(); }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height }}
      className="block"
    />
  );
}

function XautChartDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [activeIdx, setActiveIdx] = useState(2); // default 30D
  const span = XAUT_SPANS[activeIdx];
  const { data: prices, isLoading } = useXautChart(span.days, open);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden bg-background border-border/60 gap-0">
        <VisuallyHidden>
          <DialogTitle>XAUT Gold Price Chart</DialogTitle>
        </VisuallyHidden>
        <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
          <span className="text-yellow-500 text-sm font-bold leading-none">Au</span>
          <span className="text-sm font-semibold text-foreground">XAUT</span>
          <div className="flex items-center gap-0.5 ml-1">
            {XAUT_SPANS.map((s, i) => (
              <button
                key={s.label}
                onClick={() => setActiveIdx(i)}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                  i === activeIdx
                    ? 'bg-yellow-500/20 text-yellow-500'
                    : 'text-muted-foreground/50 hover:text-muted-foreground/80 hover:bg-muted/40'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <span className="text-xs text-muted-foreground/50 ml-auto">USD</span>
        </div>
        <div className="bg-background px-2 py-3" style={{ minHeight: 200 }}>
          {isLoading || !prices ? (
            <div className="flex items-center justify-center h-[180px]">
              <Skeleton className="h-full w-full rounded" />
            </div>
          ) : (
            <SparklineCanvas prices={prices} width={460} height={200} />
          )}
        </div>
        <div className="px-4 py-2 border-t border-border/40">
          <a
            href="https://www.coingecko.com/en/coins/tether-gold"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors"
          >
            coingecko.com
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Ticker Bar ──────────────────────────────────────────────

export function TickerBar() {
  const { data, isLoading } = useMarketData();
  const { time: utcTime, date: utcDate } = useUTCClock();
  const [btcChartOpen, setBtcChartOpen] = useState(false);
  const [xautChartOpen, setXautChartOpen] = useState(false);

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
              onClick={() => setBtcChartOpen(true)}
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
            <button
              onClick={() => setXautChartOpen(true)}
              className="text-foreground font-semibold tabular-nums hover:text-yellow-500 transition-colors cursor-pointer"
            >
              {formatPrice(data.goldPrice)}
            </button>
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

      <BtcChartDialog open={btcChartOpen} onOpenChange={setBtcChartOpen} />
      <XautChartDialog open={xautChartOpen} onOpenChange={setXautChartOpen} />
    </>
  );
}
