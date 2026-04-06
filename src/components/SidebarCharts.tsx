import { useState, useRef, useCallback, useEffect } from 'react';
import { Bitcoin, TrendingUp, TrendingDown } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { CHART_SPANS, useCoinChart, getChange, formatPricePrecise } from '@/lib/chartUtils';
import { cn } from '@/lib/utils';

// ── Responsive Sparkline Canvas ──────────────────────────────

function SidebarSparkline({ prices, accentColor }: { prices: number[][]; accentColor: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || prices.length < 2) return;

    const rect = container.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    const values = prices.map((p) => p[1]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const { isUp } = getChange(prices);

    const lineColor = isUp ? '#22c55e' : '#ef4444';

    const padTop = 14;
    const padBottom = 20;
    const chartW = width;
    const chartH = height - padTop - padBottom;

    // Gradient fill
    const gradient = ctx.createLinearGradient(0, padTop, 0, height - padBottom);
    if (isUp) {
      gradient.addColorStop(0, 'rgba(34, 197, 94, 0.15)');
      gradient.addColorStop(1, 'rgba(34, 197, 94, 0.01)');
    } else {
      gradient.addColorStop(0, 'rgba(239, 68, 68, 0.15)');
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
    ctx.font = '9px Inter Variable, Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`$${max.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, 4, padTop - 3);
    ctx.fillText(`$${min.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, 4, padTop + chartH + 12);

    // Current price
    ctx.fillStyle = accentColor;
    ctx.font = 'bold 10px Inter Variable, Inter, system-ui, sans-serif';
    ctx.textAlign = 'right';
    const last = values[values.length - 1];
    ctx.fillText(`$${last.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, chartW - 4, padTop - 3);
  }, [prices, accentColor]);

  useEffect(() => {
    draw();
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  return (
    <div ref={containerRef} className="w-full h-full">
      <canvas ref={canvasRef} className="block" />
    </div>
  );
}

// ── Change Indicator ─────────────────────────────────────────

function ChangeIndicator({ prices }: { prices: number[][] }) {
  const { change, pct, isUp } = getChange(prices);
  const sign = isUp ? '+' : '';

  return (
    <div className={`flex items-center gap-1 ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
      {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      <span className="text-[11px] font-bold tabular-nums">
        {sign}{formatPricePrecise(change)}
      </span>
      <span className="text-[10px] font-semibold tabular-nums opacity-70">
        ({sign}{pct.toFixed(2)}%)
      </span>
    </div>
  );
}

// ── Single Chart Panel ───────────────────────────────────────

interface ChartPanelProps {
  coinId: string;
  title: string;
  icon: React.ReactNode;
  accentColor: string;
  activeAccent: string;
  sourceUrl: string;
}

function ChartPanel({ coinId, title, icon, accentColor, activeAccent, sourceUrl }: ChartPanelProps) {
  const [activeIdx, setActiveIdx] = useState(2); // default 30D
  const span = CHART_SPANS[activeIdx];
  const { data: prices, isLoading } = useCoinChart(coinId, span.days, true);

  return (
    <div className="rounded-xl border border-border/30 bg-card/50 backdrop-blur-sm overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-border/20">
        <div className="flex items-center gap-1.5 mb-1.5">
          {icon}
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-semibold text-foreground/90 hover:text-foreground transition-colors"
          >
            {title}
          </a>
          <span className="text-[9px] text-muted-foreground/40 ml-auto">USD</span>
        </div>
        {/* Time span tabs */}
        <div className="flex items-center gap-0.5">
          {CHART_SPANS.map((s, i) => (
            <button
              key={s.label}
              onClick={() => setActiveIdx(i)}
              className={cn(
                'px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors',
                i === activeIdx
                  ? activeAccent
                  : 'text-muted-foreground/40 hover:text-muted-foreground/70 hover:bg-muted/30',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart area */}
      <div className="px-1 py-2" style={{ height: 140 }}>
        {isLoading || !prices ? (
          <div className="flex items-center justify-center h-full px-2">
            <Skeleton className="h-full w-full rounded" />
          </div>
        ) : (
          <SidebarSparkline prices={prices} accentColor={accentColor} />
        )}
      </div>

      {/* Change indicator footer */}
      {prices && prices.length >= 2 && (
        <div className="px-3 pb-2.5">
          <ChangeIndicator prices={prices} />
        </div>
      )}
    </div>
  );
}

// ── Sidebar Exports ──────────────────────────────────────────

export function BTCSidebarCharts() {
  return (
    <div className="space-y-3">
      <ChartPanel
        coinId="bitcoin"
        title="Bitcoin"
        icon={<Bitcoin className="h-3.5 w-3.5 text-amber-500" />}
        accentColor="#f59e0b"
        activeAccent="bg-amber-500/20 text-amber-400"
        sourceUrl="https://www.coingecko.com/en/coins/bitcoin"
      />
    </div>
  );
}

export function XAUTSidebarCharts() {
  return (
    <div className="space-y-3">
      <ChartPanel
        coinId="tether-gold"
        title="XAUT"
        icon={<span className="text-yellow-500 text-[11px] font-bold leading-none">Au</span>}
        accentColor="#eab308"
        activeAccent="bg-yellow-500/20 text-yellow-500"
        sourceUrl="https://www.coingecko.com/en/coins/tether-gold"
      />
    </div>
  );
}
