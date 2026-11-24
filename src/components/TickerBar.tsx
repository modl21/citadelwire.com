import { useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { fetchBlockHeight, useMarketData, type MarketData } from '@/hooks/useMarketData';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Bitcoin, Box, TrendingUp, TrendingDown, Droplets, Landmark } from 'lucide-react';
import { CHART_SPANS, MARKETS, useCoinChart, getChange, formatPricePrecise, type HyperliquidMarketConfig } from '@/lib/chartUtils';

function formatPrice(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatPriceTwoDecimals(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatYield(value: number): string {
  return `${value.toFixed(2)}%`;
}

function formatBlockHeight(value: number): string {
  return value.toLocaleString('en-US');
}

function formatDialogTimestamp(tsMs: number, spanDays: number): string {
  const d = new Date(tsMs);
  if (spanDays <= 1) {
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

function SparklineCanvas({ prices, width, height, accentColor, spanDays = 30, isYield = false }: { prices: number[][]; width: number; height: number; accentColor: string; spanDays?: number; isYield?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoverIdxRef = useRef<number | null>(null);

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

    const padTop = 18;
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
    const labelColor = mutedFg ? `hsl(${mutedFg} / 0.6)` : 'rgba(150,150,150,0.6)';

    const formatValue = (value: number) => {
      if (isYield) return formatYield(value);
      return `$${value.toLocaleString('en-US', { maximumFractionDigits: value < 200 ? 2 : 0 })}`;
    };

    const hoverIdx = hoverIdxRef.current;
    if (hoverIdx !== null && hoverIdx >= 0 && hoverIdx < prices.length) {
      const [ts, val] = prices[hoverIdx];
      const hx = (hoverIdx / (values.length - 1)) * chartW;
      const hy = padTop + (1 - (val - min) / range) * chartH;

      ctx.save();
      ctx.strokeStyle = mutedFg ? `hsl(${mutedFg} / 0.45)` : 'rgba(180,180,180,0.45)';
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hx, padTop);
      ctx.lineTo(hx, padTop + chartH);
      ctx.stroke();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(hx, hy, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = accentColor;
      ctx.fill();

      ctx.fillStyle = labelColor;
      ctx.font = '600 10px Inter Variable, Inter, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(formatDialogTimestamp(ts, spanDays), 4, padTop - 4);

      ctx.fillStyle = accentColor;
      ctx.font = 'bold 11px Inter Variable, Inter, system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(formatValue(val), chartW - 4, padTop - 4);

      ctx.fillStyle = labelColor;
      ctx.font = '10px Inter Variable, Inter, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(formatValue(min), 4, padTop + chartH + 14);
    } else {
      ctx.fillStyle = labelColor;
      ctx.font = '10px Inter Variable, Inter, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(formatValue(max), 4, padTop - 4);
      ctx.fillText(formatValue(min), 4, padTop + chartH + 14);

      // Current price
      ctx.fillStyle = accentColor;
      ctx.font = 'bold 11px Inter Variable, Inter, system-ui, sans-serif';
      ctx.textAlign = 'right';
      const last = values[values.length - 1];
      ctx.fillText(formatValue(last), chartW - 4, padTop - 4);
    }
  }, [prices, width, height, accentColor, spanDays, isYield]);

  useEffect(() => {
    hoverIdxRef.current = null;
    draw();
  }, [draw]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || prices.length < 2) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0) return;
    const pct = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const idx = Math.round(pct * (prices.length - 1));
    if (hoverIdxRef.current !== idx) {
      hoverIdxRef.current = idx;
      draw();
    }
  }, [prices.length, draw]);

  const handlePointerLeave = useCallback(() => {
    if (hoverIdxRef.current !== null) {
      hoverIdxRef.current = null;
      draw();
    }
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height }}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className="block w-full cursor-crosshair touch-pan-y"
    />
  );
}

function ChangeIndicator({ prices, isYield = false }: { prices: number[][]; isYield?: boolean }) {
  const { change, pct, isUp } = getChange(prices);
  const sign = isUp ? '+' : '';

  return (
    <div className={`flex items-center gap-1.5 ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
      {isUp ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
      <span className="text-sm font-bold tabular-nums">
        {isYield ? `${sign}${change.toFixed(2)}%` : `${sign}${formatPricePrecise(change)}`}
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
  market: HyperliquidMarketConfig;
  title: string;
  icon: React.ReactNode;
  accentColor: string;
  activeAccent: string;
  sourceLabel: string;
  sourceUrl: string;
  isYield?: boolean;
}

function CoinChartDialog({ open, onOpenChange, market, title, icon, accentColor, activeAccent, sourceLabel, sourceUrl, isYield = false }: ChartDialogProps) {
  const [activeIdx, setActiveIdx] = useState(2); // default 30D
  const span = CHART_SPANS[activeIdx];
  const { data: prices, isLoading } = useCoinChart(market, span.days, open);

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
            <span className="text-xs text-muted-foreground/50 ml-auto">{isYield ? 'Yield' : 'USD'}</span>
          </div>
          {/* Change indicator */}
          {prices && prices.length >= 2 && (
            <div className="mt-2">
              <ChangeIndicator prices={prices} isYield={isYield} />
            </div>
          )}
        </div>
        <div className="bg-background px-2 py-3" style={{ minHeight: 200 }}>
          {isLoading || !prices ? (
            <div className="flex items-center justify-center h-[180px]">
              <Skeleton className="h-full w-full rounded" />
            </div>
          ) : (
            <SparklineCanvas prices={prices} width={460} height={200} accentColor={accentColor} spanDays={span.days} isYield={isYield} />
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

type ActiveChartKey = 'BTC' | 'XAUT' | 'SP500' | 'BRENTOIL' | 'US10Y';

interface ChartDialogConfig {
  market: HyperliquidMarketConfig;
  title: string;
  icon: React.ReactNode;
  accentColor: string;
  activeAccent: string;
  sourceLabel: string;
  sourceUrl: string;
  isYield?: boolean;
}

const CHART_DIALOG_CONFIGS: Record<ActiveChartKey, ChartDialogConfig> = {
  BTC: {
    market: MARKETS.BTC,
    title: 'Bitcoin',
    icon: <Bitcoin className="h-4 w-4 text-amber-500" />,
    accentColor: '#f59e0b',
    activeAccent: 'bg-amber-500/20 text-amber-400',
    sourceLabel: 'hyperliquid.xyz',
    sourceUrl: 'https://app.hyperliquid.xyz/trade/BTC',
  },
  XAUT: {
    market: MARKETS.XAUT,
    title: 'Gold',
    icon: <span className="text-yellow-500 text-sm font-bold leading-none">Au</span>,
    accentColor: '#eab308',
    activeAccent: 'bg-yellow-500/20 text-yellow-500',
    sourceLabel: 'hyperliquid.xyz',
    sourceUrl: 'https://app.hyperliquid.xyz/trade/xyz:GOLD',
  },
  SP500: {
    market: MARKETS.SP500,
    title: 'S&P 500',
    icon: <TrendingUp className="h-4 w-4 text-sky-400" />,
    accentColor: '#38bdf8',
    activeAccent: 'bg-sky-500/20 text-sky-400',
    sourceLabel: 'hyperliquid.xyz',
    sourceUrl: 'https://app.hyperliquid.xyz/trade/xyz:SP500',
  },
  BRENTOIL: {
    market: MARKETS.BRENTOIL,
    title: 'Brent Oil',
    icon: <Droplets className="h-4 w-4 text-orange-400" />,
    accentColor: '#fb923c',
    activeAccent: 'bg-orange-500/20 text-orange-400',
    sourceLabel: 'hyperliquid.xyz',
    sourceUrl: 'https://app.hyperliquid.xyz/trade/xyz:BRENTOIL',
  },
  US10Y: {
    market: MARKETS.US10Y,
    title: 'US 10Y Treasury',
    icon: <Landmark className="h-4 w-4 text-violet-400" />,
    accentColor: '#a78bfa',
    activeAccent: 'bg-violet-500/20 text-violet-300',
    sourceLabel: 'hyperliquid.xyz',
    sourceUrl: 'https://app.hyperliquid.xyz/trade/para:10Y',
    isYield: true,
  },
};

interface TickerBarProps {
  live?: boolean;
}

export function TickerBar({ live = true }: TickerBarProps) {
  const { data, isLoading } = useMarketData(live);
  const queryClient = useQueryClient();
  const [activeChart, setActiveChart] = useState<ActiveChartKey | null>(null);
  const lastSeenHeightRef = useRef<number | null>(data?.blockHeight ?? null);

  if (data?.blockHeight && data.blockHeight > (lastSeenHeightRef.current ?? 0)) {
    lastSeenHeightRef.current = data.blockHeight;
  }

  useEffect(() => {
    if (!live) return;

    let cancelled = false;

    const applyBlockHeight = (height: number) => {
      if (!Number.isSafeInteger(height) || height <= (lastSeenHeightRef.current ?? 0)) return;
      lastSeenHeightRef.current = height;
      queryClient.setQueryData<MarketData>(['market-data'], (current) => ({
        btcPrice: current?.btcPrice ?? null,
        goldPrice: current?.goldPrice ?? null,
        sp500Price: current?.sp500Price ?? null,
        brentOilPrice: current?.brentOilPrice ?? null,
        us10yPrice: current?.us10yPrice ?? null,
        blockHeight: height,
      }));
    };

    const pollBlockHeight = async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      const height = await fetchBlockHeight();
      if (!cancelled && height !== null) applyBlockHeight(height);
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) void pollBlockHeight();
    };

    const intervalId = setInterval(() => {
      void pollBlockHeight();
    }, 10 * 1000);

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [live, queryClient]);

  const activeConfig = activeChart ? CHART_DIALOG_CONFIGS[activeChart] : null;

  return (
    <>
      <div className="flex items-center gap-1 sm:gap-3 text-[9px] sm:text-[11px] font-medium">
        {/* Block Height */}
        <div className="flex items-center gap-0.5 sm:gap-1.5 shrink-0">
          <Box className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-purple-400" />
          {isLoading || !data?.blockHeight ? (
            <Skeleton className="h-3 sm:h-3.5 w-14 sm:w-20" />
          ) : (
            <a
              href="https://mempool.space"
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
        <div className="flex items-center gap-0.5 sm:gap-1.5 shrink-0">
          <Bitcoin className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-amber-500" />
          <span className="hidden sm:inline text-muted-foreground/60">BTC</span>
          {isLoading || !data?.btcPrice ? (
            <Skeleton className="h-3 sm:h-3.5 w-12 sm:w-16" />
          ) : (
            <button
              onClick={() => setActiveChart('BTC')}
              className="text-foreground font-semibold tabular-nums hover:text-amber-500 transition-colors cursor-pointer underline decoration-dotted decoration-muted-foreground/30 underline-offset-2 hover:decoration-amber-500/50"
            >
              {formatPrice(data.btcPrice)}
            </button>
          )}
        </div>

        <div className="w-px h-3 bg-border/50 shrink-0" />

        {/* Gold (XAUT) Price */}
        <div className="flex items-center gap-0.5 sm:gap-1.5 shrink-0">
          <span className="text-yellow-500 text-[11px] sm:text-sm leading-none">Au</span>
          <span className="hidden sm:inline text-muted-foreground/60">GOLD</span>
          {isLoading || !data?.goldPrice ? (
            <Skeleton className="h-3 sm:h-3.5 w-12 sm:w-16" />
          ) : (
            <button
              onClick={() => setActiveChart('XAUT')}
              className="text-foreground font-semibold tabular-nums hover:text-yellow-500 transition-colors cursor-pointer underline decoration-dotted decoration-muted-foreground/30 underline-offset-2 hover:decoration-yellow-500/50"
            >
              {formatPrice(data.goldPrice)}
            </button>
          )}
        </div>

        <div className="w-px h-3 bg-border/50 shrink-0" />

        {/* S&P 500 Price */}
        <div className="flex items-center gap-0.5 sm:gap-1.5 shrink-0">
          <TrendingUp className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-sky-400" />
          <span className="hidden sm:inline text-muted-foreground/60">SPX</span>
          {isLoading || !data?.sp500Price ? (
            <Skeleton className="h-3 sm:h-3.5 w-10 sm:w-14" />
          ) : (
            <button
              onClick={() => setActiveChart('SP500')}
              className="text-foreground font-semibold tabular-nums hover:text-sky-400 transition-colors cursor-pointer underline decoration-dotted decoration-muted-foreground/30 underline-offset-2 hover:decoration-sky-400/50"
            >
              {formatPrice(data.sp500Price)}
            </button>
          )}
        </div>

        <div className="w-px h-3 bg-border/50 shrink-0" />

        {/* Brent Oil Price */}
        <div className="flex items-center gap-0.5 sm:gap-1.5 shrink-0">
          <Droplets className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-orange-400" />
          <span className="hidden sm:inline text-muted-foreground/60">OIL</span>
          {isLoading || !data?.brentOilPrice ? (
            <Skeleton className="h-3 sm:h-3.5 w-8 sm:w-12" />
          ) : (
            <button
              onClick={() => setActiveChart('BRENTOIL')}
              className="text-foreground font-semibold tabular-nums hover:text-orange-400 transition-colors cursor-pointer underline decoration-dotted decoration-muted-foreground/30 underline-offset-2 hover:decoration-orange-400/50"
            >
              {formatPriceTwoDecimals(data.brentOilPrice)}
            </button>
          )}
        </div>

        <div className="w-px h-3 bg-border/50 shrink-0" />

        {/* US 10Y Treasury Yield */}
        <div className="flex items-center gap-0.5 sm:gap-1.5 shrink-0">
          <Landmark className="h-2.5 w-2.5 sm:h-3.5 sm:w-3.5 text-violet-400" />
          <span className="hidden sm:inline text-muted-foreground/60">10Y</span>
          {isLoading || !data?.us10yPrice ? (
            <Skeleton className="h-3 sm:h-3.5 w-8 sm:w-12" />
          ) : (
            <button
              onClick={() => setActiveChart('US10Y')}
              className="text-foreground font-semibold tabular-nums tracking-tighter hover:text-violet-400 transition-colors cursor-pointer underline decoration-dotted decoration-muted-foreground/30 underline-offset-2 hover:decoration-violet-400/50 sm:tracking-normal"
            >
              {formatYield(data.us10yPrice)}
            </button>
          )}
        </div>

      </div>

      {activeConfig && (
        <CoinChartDialog
          key={activeChart}
          open
          onOpenChange={(open) => { if (!open) setActiveChart(null); }}
          market={activeConfig.market}
          title={activeConfig.title}
          icon={activeConfig.icon}
          accentColor={activeConfig.accentColor}
          activeAccent={activeConfig.activeAccent}
          sourceLabel={activeConfig.sourceLabel}
          sourceUrl={activeConfig.sourceUrl}
          isYield={activeConfig.isYield}
        />
      )}
    </>
  );
}
