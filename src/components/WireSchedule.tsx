import { memo, useEffect, useRef, useState } from 'react';
import { Clock, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';

// A wire drops every hour, on the hour (UTC).
const SCHEDULE_HOURS = Array.from({ length: 24 }, (_, hour) => hour);

interface RecurringWireSlot {
  type: 'DAILY WIRE' | 'WEEKLY WIRE' | 'FORWARD WIRE';
  hour: number;
  minute: number;
  weekday?: number; // UTC day of week, where Sunday is 0
  accentClassName: string;
}

const RECURRING_WIRE_SLOTS: RecurringWireSlot[] = [
  {
    type: 'DAILY WIRE',
    hour: 21,
    minute: 30,
    accentClassName: 'text-orange-300',
  },
  {
    type: 'WEEKLY WIRE',
    weekday: 5,
    hour: 21,
    minute: 45,
    accentClassName: 'text-purple-300',
  },
  {
    type: 'FORWARD WIRE',
    weekday: 1,
    hour: 11,
    minute: 15,
    accentClassName: 'text-rose-300',
  },
];

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function pad(n: number) {
  return n.toString().padStart(2, '0');
}

function startOfUtcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function getNextRecurringTimestamp(slot: RecurringWireSlot, nowMs: number): number {
  const now = new Date(nowMs);
  const todayStartMs = startOfUtcDay(now);
  const todaySlotMs = todayStartMs + slot.hour * 60 * 60 * 1000 + slot.minute * 60 * 1000;

  if (slot.weekday === undefined) {
    return todaySlotMs > nowMs ? todaySlotMs : todaySlotMs + DAY_MS;
  }

  const dayDifference = (slot.weekday - now.getUTCDay() + 7) % 7;
  const nextSlotMs = todaySlotMs + dayDifference * DAY_MS;
  return nextSlotMs > nowMs ? nextSlotMs : nextSlotMs + WEEK_MS;
}

function formatCountdown(targetMs: number, nowMs: number): string {
  const totalSeconds = Math.max(0, Math.floor((targetMs - nowMs) / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
  if (hours > 0) return `${hours}h ${pad(minutes)}m ${pad(seconds)}s`;
  if (minutes > 0) return `${minutes}m ${pad(seconds)}s`;
  return `${pad(seconds)}s`;
}

function formatUTCTime(date: Date): string {
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

function formatUTCDate(date: Date): string {
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

/** Tick every second while the tab is visible; pause completely in background tabs. */
function useVisibleSecondClock(): number {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    const stop = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = undefined;
      }
    };

    const start = () => {
      stop();
      if (typeof document !== 'undefined' && document.hidden) return;
      const now = Date.now();
      setNowMs(now);
      const msUntilNextSecond = 1000 - (now % 1000);
      timeoutId = setTimeout(() => {
        setNowMs(Date.now());
        intervalId = setInterval(() => {
          setNowMs(Date.now());
        }, 1000);
      }, msUntilNextSecond);
    };

    start();
    document.addEventListener('visibilitychange', start);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', start);
    };
  }, []);

  return nowMs;
}

/** Only re-renders when the UTC hour changes (at most once per hour), not every second. */
const ScheduleHourPills = memo(function ScheduleHourPills({ currentHour }: { currentHour: number }) {
  const scheduleScrollRef = useRef<HTMLDivElement | null>(null);
  const currentHourRef = useRef<HTMLSpanElement | null>(null);
  const nextHour = (currentHour + 1) % 24;

  useEffect(() => {
    const container = scheduleScrollRef.current;
    const currentEl = currentHourRef.current;
    if (!container || !currentEl) return;

    const targetScrollLeft = currentEl.offsetLeft + currentEl.offsetWidth / 2 - container.clientWidth / 2;
    container.scrollLeft = Math.max(0, targetScrollLeft);
  }, [currentHour]);

  return (
    <div ref={scheduleScrollRef} className="flex items-center gap-1 overflow-x-auto scrollbar-none min-w-0 flex-1">
      {SCHEDULE_HOURS.map((hour) => {
        const isNext = hour === nextHour;
        const isCurrent = hour === currentHour;
        const isPast = hour < currentHour;

        return (
          <span
            key={hour}
            ref={isCurrent ? currentHourRef : undefined}
            title={`${pad(hour)}:00 UTC`}
            className={cn(
              'shrink-0 rounded px-1 py-0.5 text-[10px] font-mono font-semibold transition-all duration-500',
              isNext && 'bg-sky-500/20 text-sky-400 ring-1 ring-sky-500/40',
              isCurrent && !isNext && 'text-foreground/70',
              isPast && !isCurrent && 'text-muted-foreground/25',
              !isNext && !isPast && !isCurrent && 'text-muted-foreground/40',
            )}
          >
            {pad(hour)}
          </span>
        );
      })}
    </div>
  );
});

const UtcClock = memo(function UtcClock({ nowMs }: { nowMs: number }) {
  const now = new Date(nowMs);
  return (
    <div className="flex shrink-0 items-center gap-1 text-[10px] font-medium tabular-nums text-muted-foreground/60 sm:gap-1.5 sm:text-[11px]">
      <Clock className="h-3 w-3 text-sky-400 sm:h-3.5 sm:w-3.5" />
      <span className="font-semibold text-foreground">{formatUTCTime(now)}</span>
      <span className="text-muted-foreground/50">{formatUTCDate(now)}</span>
      <span className="hidden text-muted-foreground/50 sm:inline">UTC</span>
    </div>
  );
});

const RecurringWireCountdowns = memo(function RecurringWireCountdowns({ nowMs }: { nowMs: number }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto scrollbar-none sm:gap-1.5">
      {RECURRING_WIRE_SLOTS.map((slot) => {
        const nextTimestampMs = getNextRecurringTimestamp(slot, nowMs);
        return (
          <div
            key={slot.type}
            className={cn(
              'inline-flex shrink-0 items-center gap-0.5 text-[8px] font-bold uppercase leading-none tracking-tight sm:gap-1 sm:text-[10px] sm:tracking-wide',
              slot.accentClassName,
            )}
            title={`${slot.type} · ${new Date(nextTimestampMs).toUTCString()}`}
          >
            <span>{slot.type}</span>
            <span className="tabular-nums font-semibold normal-case text-current/85">
              {formatCountdown(nextTimestampMs, nowMs)}
            </span>
          </div>
        );
      })}
    </div>
  );
});

export const WireSchedule = memo(function WireSchedule() {
  const nowMs = useVisibleSecondClock();
  const currentHour = Math.floor((nowMs % DAY_MS) / (60 * 60 * 1000));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {/* Label */}
        <div className="flex items-center gap-1 shrink-0">
          <Radio className="h-3 w-3 text-red-500/80 animate-pulse" />
          <span className="text-[10px] sm:text-[11px] font-semibold tracking-widest uppercase text-muted-foreground/50 hidden sm:inline">
            Schedule
          </span>
        </div>

        <div className="w-px h-3 bg-border/40 shrink-0" />

        {/* Schedule pills — only re-render when the UTC hour changes */}
        <ScheduleHourPills currentHour={currentHour} />

        <div className="w-px h-3 bg-border/40 shrink-0" />

        {/* UTC Clock */}
        <UtcClock nowMs={nowMs} />
      </div>

      {/* Recurring wire countdowns */}
      <RecurringWireCountdowns nowMs={nowMs} />
    </div>
  );
});
