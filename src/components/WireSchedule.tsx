import { useState, useEffect } from 'react';
import { Radio } from 'lucide-react';
import { cn } from '@/lib/utils';

const SCHEDULE_HOURS = [0, 3, 6, 9, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];

interface ScheduleState {
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
    nextHour,
    minutesUntilNext: Math.floor(secondsUntilNext / 60),
    secondsUntilNext: secondsUntilNext % 60,
    currentHourIndex,
  };
}

function pad(n: number) {
  return n.toString().padStart(2, '0');
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

  const { nextHour, minutesUntilNext, secondsUntilNext, currentHourIndex } = state;

  return (
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
  );
}
