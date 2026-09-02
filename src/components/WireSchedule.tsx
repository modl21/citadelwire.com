import { useState, useEffect } from 'react';
import { Radio } from 'lucide-react';
import { cn } from '@/lib/utils';

const SCHEDULE_HOURS = [0, 3, 6, 9, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];

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
    hour: 22,
    minute: 0,
    accentClassName: 'text-purple-300',
  },
  {
    type: 'FORWARD WIRE',
    weekday: 1,
    hour: 11,
    minute: 0,
    accentClassName: 'text-rose-300',
  },
];

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

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

interface ScheduleState {
  nowMs: number;
  nextHour: number;
  minutesUntilNext: number;
  secondsUntilNext: number;
  currentHourIndex: number; // index of the most recently passed scheduled hour
}

function getScheduleState(now: Date): ScheduleState {
  const h = now.getUTCHours();
  const m = now.getUTCMinutes();
  const s = now.getUTCSeconds();
  const totalSeconds = h * 3600 + m * 60 + s;

  // Find the most recently passed scheduled hour
  let currentHourIndex = -1;
  for (let i = SCHEDULE_HOURS.length - 1; i >= 0; i--) {
    if (SCHEDULE_HOURS[i] * 3600 <= totalSeconds) {
      currentHourIndex = i;
      break;
    }
  }

  // Find the next upcoming scheduled hour
  let nextIdx = -1;
  for (let i = 0; i < SCHEDULE_HOURS.length; i++) {
    if (SCHEDULE_HOURS[i] * 3600 > totalSeconds) {
      nextIdx = i;
      break;
    }
  }

  let nextHour: number;
  let secondsUntilNext: number;

  if (nextIdx === -1) {
    // After last slot of the day — next is midnight
    nextHour = 0;
    secondsUntilNext = 86400 - totalSeconds;
  } else {
    nextHour = SCHEDULE_HOURS[nextIdx];
    secondsUntilNext = nextHour * 3600 - totalSeconds;
  }

  return {
    nowMs: now.getTime(),
    nextHour,
    minutesUntilNext: Math.floor(secondsUntilNext / 60),
    secondsUntilNext: secondsUntilNext % 60,
    currentHourIndex,
  };
}

export function WireSchedule() {
  const [state, setState] = useState<ScheduleState>(() => getScheduleState(new Date()));

  useEffect(() => {
    const update = () => setState(getScheduleState(new Date()));
    const now = new Date();
    const msUntilNextSecond = 1000 - now.getMilliseconds();
    let intervalId: ReturnType<typeof setInterval> | undefined;

    const timeoutId = setTimeout(() => {
      update();
      intervalId = setInterval(update, 1000);
    }, msUntilNextSecond);

    return () => {
      clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  const { nowMs, nextHour, minutesUntilNext, secondsUntilNext, currentHourIndex } = state;

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

        {/* Schedule pills — scrollable on small screens */}
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none min-w-0 flex-1">
          {SCHEDULE_HOURS.map((hour, idx) => {
            const isNext = hour === nextHour;
            const isPast = idx <= currentHourIndex;
            const isCurrent = idx === currentHourIndex;

            return (
              <span
                key={hour}
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

        <div className="w-px h-3 bg-border/40 shrink-0" />

        {/* Countdown to next */}
        <div className="shrink-0 text-[10px] sm:text-[11px] font-medium tabular-nums text-muted-foreground/60">
          <span className="hidden sm:inline text-muted-foreground/40">next </span>
          <span className="text-sky-400/90 font-semibold">
            {pad(nextHour)}:00
          </span>
          <span className="text-muted-foreground/40 ml-1">
            {minutesUntilNext > 0
              ? `in ${minutesUntilNext}m ${pad(secondsUntilNext)}s`
              : `in ${pad(secondsUntilNext)}s`}
          </span>
        </div>
      </div>

      {/* Recurring wire countdowns */}
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-none sm:gap-1.5">
        {RECURRING_WIRE_SLOTS.map((slot) => {
          const nextTimestampMs = getNextRecurringTimestamp(slot, nowMs);
          return (
            <div
              key={slot.type}
              className={cn(
                'inline-flex shrink-0 items-center gap-0.5 text-[7px] font-bold uppercase leading-none tracking-tight sm:gap-1 sm:text-[9px] sm:tracking-wide',
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
    </div>
  );
}
