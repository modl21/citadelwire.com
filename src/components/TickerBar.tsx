import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useMarketData } from '@/hooks/useMarketData';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Bitcoin, Box, Clock, TrendingUp, TrendingDown } from 'lucide-react';

const CORS_PROXY = 'https://proxy.shakespeare.diy/?url=';

function formatPrice(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatPricePrecise(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
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

// ── Shared chart infrastructure ─────────────────────────────

const CHART_SPANS = [
  { label: '24H', days: 1 },
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '6M', days: 180 },
] as const;

function useCoinChart(coinId: string, days: number, enabled: boolean) {
  return useQuery<number[][]>({
    queryKey: ['coin-chart', coinId, days],
    queryFn: async () => {
      const url = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`;
      let res: Response;
      try {
        res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error('direct failed');
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

interface PriceChange {
  first: number;
  last: number;
  change: number;
  pct: number;
  isUp: boolean;
}

function getChange(prices: number[][]): PriceChange {
  const first = prices[0][1];
  const last = prices[prices.length - 1][1];
  const change = last - first;
  const pct = first !== 0 ? (change / first) * 100 : 0;
  return { first, last, change, pct, isUp: change >= 0 };
}

function SparklineCanvas({ prices, width, height, accentColor }: { prices: number[][]; width: number; height: number; accentColor: string }) {
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
    const { isUp } = getChange(prices);

    const lineColor = isUp ? '#22c55e' : '#ef4444';

    const padTop = 16;
    const padBottom = 24;
    const chartW = width;
    const chartH = height - padTop - padBottom;

    // Gradient fill
    const gradient = ctx.createLinearGradient(0, padTop, 0, height - padBottom);
    if (isUp) {
      gradient.addColorStop(0, 'rgba(34, 197, 94, 0.2)');
      gradient.addColorStop(1, 'rgba(34, 197, 94, 0.01)');
    } else {
      gradient.addColorStop(0, 'rgba(239, 68, 68, 0.2)');
      gradient.addColorStop(1, 'rgba(239, 68, 68, 0.01)');
    }

    ctx.beginPath();
    for (let i = 0; i < values.length; i++) {
      const x = (i / (values.length - 1)) * chartW;
      const y = padTop + (1 - (values[i] - min) / range) * chartH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineTo(chartW, padTop + chartH);
    ctx.lineTo(0, padTop + chartH);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Line
    ctx.beginPath();
    for (let i = 0; i < values.length; i++) {
      const x = (i / (values.length - 1)) * chartW;
      const y = padTop + (1 - (values[i] - min) / range) * chartH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Price labels
    const computedStyle = getComputedStyle(document.documentElement);
    const mutedFg = computedStyle.getPropertyValue('--muted-foreground').trim();
    const labelColor = mutedFg ? `hsl(${mutedFg} / 0.5)` : 'rgba(150,150,150,0.5)';

    ctx.fillStyle = labelColor;
    ctx.font = '10px Inter Variable, Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`$${max.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, 4, padTop - 4);
    ctx.fillText(`$${min.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, 4, padTop + chartH + 14);

    // Current price
    ctx.fillStyle = accentColor;
    ctx.font = 'bold 11px Inter Variable, Inter, system-ui, sans-serif';
    ctx.textAlign = 'right';
    const last = values[values.length - 1];
    ctx.fillText(`$${last.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, chartW - 4, padTop - 4);
  }, [prices, width, height, accentColor]);

  useEffect(() => { draw(); }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height }}
      className="block w-full"
    />
  );
}

function ChangeIndicator({ prices }: { prices: number[][] }) {
  const { change, pct, isUp } = getChange(prices);
  const sign = isUp ? '+' : '';

  return (
    <div className={`flex items-center gap-1.5 ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
      {isUp ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
      <span className="text-sm font-bold tabular-nums">
        {sign}{formatPricePrecise(change)}
      </span>
      <span className="text-xs font-semibold tabular-nums opacity-70">
        ({sign}{pct.toFixed(2)}%)
      </span>
    </div>
  );
}

// ── Unified Chart Dialog ────────────────────────────────────

interface ChartDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coinId: string;
  title: string;
  icon: React.ReactNode;
  accentColor: string;
  activeAccent: string;
  sourceLabel: string;
  sourceUrl: string;
}

function CoinChartDialog({ open, onOpenChange, coinId, title, icon, accentColor, activeAccent, sourceLabel, sourceUrl }: ChartDialogProps) {
  const [activeIdx, setActiveIdx] = useState(2); // default 30D
  const span = CHART_SPANS[activeIdx];
  const { data: prices, isLoading } = useCoinChart(coinId, span.days, open);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden bg-background border-border/60 gap-0">
        <VisuallyHidden>
          <DialogTitle>{title} Price Chart</DialogTitle>
        </VisuallyHidden>
        <div className="px-4 py-3 border-b border-border/40">
          <div className="flex items-center gap-2">
            {icon}
            <span className="text-sm font-semibold text-foreground">{title}</span>
            <div className="flex items-center gap-0.5 ml-1">
              {CHART_SPANS.map((s, i) => (
                <button
                  key={s.label}
                  onClick={() => setActiveIdx(i)}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                    i === activeIdx
                      ? activeAccent
                      : 'text-muted-foreground/50 hover:text-muted-foreground/80 hover:bg-muted/40'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <span className="text-xs text-muted-foreground/50 ml-auto">USD</span>
          </div>
          {/* Change indicator */}
          {prices && prices.length >= 2 && (
            <div className="mt-2">
              <ChangeIndicator prices={prices} />
            </div>
          )}
        </div>
        <div className="bg-background px-2 py-3" style={{ minHeight: 200 }}>
          {isLoading || !prices ? (
            <div className="flex items-center justify-center h-[180px]">
              <Skeleton className="h-full w-full rounded" />
            </div>
          ) : (
            <SparklineCanvas prices={prices} width={460} height={200} accentColor={accentColor} />
          )}
        </div>
        <div className="px-4 py-2 border-t border-border/40">
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors"
          >
            {sourceLabel}
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

      <CoinChartDialog
        open={btcChartOpen}
        onOpenChange={setBtcChartOpen}
        coinId="bitcoin"
        title="Bitcoin"
        icon={<Bitcoin className="h-4 w-4 text-amber-500" />}
        accentColor="#f59e0b"
        activeAccent="bg-amber-500/20 text-amber-400"
        sourceLabel="coingecko.com"
        sourceUrl="https://www.coingecko.com/en/coins/bitcoin"
      />
      <CoinChartDialog
        open={xautChartOpen}
        onOpenChange={setXautChartOpen}
        coinId="tether-gold"
        title="XAUT"
        icon={<span className="text-yellow-500 text-sm font-bold leading-none">Au</span>}
        accentColor="#eab308"
        activeAccent="bg-yellow-500/20 text-yellow-500"
        sourceLabel="coingecko.com"
        sourceUrl="https://www.coingecko.com/en/coins/tether-gold"
      />
    </>
  );
}
