import { memo, useCallback, useRef, useSyncExternalStore } from 'react';
import { Mic, Pause, Play, RotateCcw, RotateCw, X } from 'lucide-react';
import { getActiveAudioSnapshot, subscribeActiveAudio, type ActiveAudioSnapshot } from '@/lib/audioBus';
import { cn } from '@/lib/utils';

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const ACCENT_BAR: Record<ActiveAudioSnapshot['accentColor'], { bar: string; badge: string; btn: string }> = {
  purple: { bar: 'bg-purple-500', badge: 'text-purple-400', btn: 'bg-purple-500/20 text-purple-300 hover:bg-purple-500/30' },
  orange: { bar: 'bg-orange-500', badge: 'text-orange-400', btn: 'bg-orange-500/20 text-orange-300 hover:bg-orange-500/30' },
  emerald: { bar: 'bg-emerald-500', badge: 'text-emerald-400', btn: 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30' },
  sky: { bar: 'bg-sky-500', badge: 'text-sky-400', btn: 'bg-sky-500/20 text-sky-300 hover:bg-sky-500/30' },
  rose: { bar: 'bg-rose-500', badge: 'text-rose-400', btn: 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30' },
  zinc: { bar: 'bg-zinc-400', badge: 'text-zinc-300', btn: 'bg-zinc-400/20 text-zinc-200 hover:bg-zinc-400/30' },
  lime: { bar: 'bg-lime-500', badge: 'text-lime-400', btn: 'bg-lime-500/20 text-lime-300 hover:bg-lime-500/30' },
  amber: { bar: 'bg-amber-500', badge: 'text-amber-400', btn: 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30' },
};

const getServerSnapshot = () => null;

export const StickyAudioBar = memo(function StickyAudioBar() {
  const active = useSyncExternalStore(subscribeActiveAudio, getActiveAudioSnapshot, getServerSnapshot);
  const barRef = useRef<HTMLDivElement>(null);

  const handleScrub = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!active || !barRef.current || active.duration <= 0) return;
    const rect = barRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    active.seekTo(pct * active.duration);
  }, [active]);

  if (!active) return null;

  const accent = ACCENT_BAR[active.accentColor];
  const progress = active.duration > 0 ? Math.min(100, (active.currentTime / active.duration) * 100) : 0;

  return (
    <div
      role="region"
      aria-label={`Now playing: ${active.title}`}
      className="fixed inset-x-0 safe-bottom-bar safe-x z-50 px-3 sm:px-6 pointer-events-none"
    >
      <div className="pointer-events-auto mx-auto max-w-2xl overflow-hidden rounded-xl border border-border/80 bg-card shadow-2xl shadow-black/25 dark:shadow-black/50">
        {/* Scrubbable top progress rail */}
        <div
          ref={barRef}
          onClick={handleScrub}
          role="slider"
          aria-label="Audio playback progress"
          aria-valuemin={0}
          aria-valuemax={Math.round(active.duration)}
          aria-valuenow={Math.round(active.currentTime)}
          tabIndex={0}
          className="h-1.5 w-full cursor-pointer bg-muted/60"
        >
          <div
            className={cn('h-full transition-[width] duration-150 ease-linear', accent.bar)}
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex items-center gap-2 px-3 py-2 sm:gap-2.5 sm:px-3.5">
          {/* Play / pause */}
          <button
            type="button"
            onClick={active.togglePlay}
            aria-label={active.isPlaying ? 'Pause' : 'Play'}
            className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors', accent.btn)}
          >
            {active.isPlaying ? <Pause className="h-3.5 w-3.5 fill-current" /> : <Play className="h-3.5 w-3.5 fill-current ml-0.5" />}
          </button>

          {/* Skip -15s / +30s */}
          <button
            type="button"
            onClick={() => active.seekBy(-15)}
            aria-label="Back 15 seconds"
            title="Back 15s"
            className="inline-flex h-7 items-center gap-0.5 rounded-md px-1.5 text-[10px] font-bold tabular-nums text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors shrink-0"
          >
            <RotateCcw className="h-3 w-3" />
            <span>15</span>
          </button>
          <button
            type="button"
            onClick={() => active.seekBy(30)}
            aria-label="Forward 30 seconds"
            title="Forward 30s"
            className="inline-flex h-7 items-center gap-0.5 rounded-md px-1.5 text-[10px] font-bold tabular-nums text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors shrink-0"
          >
            <RotateCw className="h-3 w-3" />
            <span>30</span>
          </button>

          {/* Episode info */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[10px]">
              <Mic className={cn('h-2.5 w-2.5 shrink-0', accent.badge)} />
              <span className={cn('font-bold uppercase tracking-wide shrink-0', accent.badge)}>{active.label}</span>
              <span className="text-muted-foreground/50 tabular-nums shrink-0">
                {formatTime(active.currentTime)} / {active.duration > 0 ? formatTime(active.duration) : '--:--'}
              </span>
            </div>
            <p className="truncate text-xs font-medium text-foreground/95 leading-tight mt-0.5">
              {active.title}
            </p>
          </div>

          {/* Speed */}
          <button
            type="button"
            onClick={active.cycleSpeed}
            title="Playback speed"
            className="shrink-0 rounded-md border border-border/50 px-1.5 py-1 text-[10px] font-semibold tabular-nums text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
          >
            {active.speed}x
          </button>

          {/* Close / stop */}
          <button
            type="button"
            onClick={active.dismiss}
            aria-label="Stop and close mini player"
            title="Close mini player"
            className="shrink-0 rounded-md p-1 text-muted-foreground/60 hover:bg-muted/60 hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
});
