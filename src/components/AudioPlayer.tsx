import { useRef, useState, useEffect, useCallback } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Play, Pause, Volume2, VolumeX, Mic, ExternalLink } from 'lucide-react';

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface AudioPlayerProps {
  label: string;
  title: string;
  mp3Url: string;
  timeLabel: string;
  allEpisodesUrl: string;
  accentColor: 'purple' | 'orange';
}

const colorMap = {
  purple: {
    gradient: 'from-purple-500/10 via-muted/20 to-indigo-500/10',
    border: 'border-purple-500/20',
    icon: 'text-purple-400',
    iconBg: 'bg-purple-500/20 hover:bg-purple-500/30',
    iconFill: 'text-purple-300 fill-purple-300',
    bar: 'bg-purple-500/70',
    link: 'text-purple-400/60 hover:text-purple-400',
  },
  orange: {
    gradient: 'from-orange-500/10 via-muted/20 to-amber-500/10',
    border: 'border-orange-500/20',
    icon: 'text-orange-400',
    iconBg: 'bg-orange-500/20 hover:bg-orange-500/30',
    iconFill: 'text-orange-300 fill-orange-300',
    bar: 'bg-orange-500/70',
    link: 'text-orange-400/60 hover:text-orange-400',
  },
};

export function AudioPlayerSkeleton() {
  return (
    <div className="rounded-lg bg-muted/30 border border-border/40 px-3 py-2">
      <div className="flex items-center gap-2">
        <Skeleton className="h-7 w-7 rounded-md shrink-0" />
        <div className="flex-1 space-y-1">
          <Skeleton className="h-2.5 w-16" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      </div>
      <Skeleton className="h-1 w-full mt-2 rounded-full" />
    </div>
  );
}

export function AudioPlayer({ label, title, mp3Url, timeLabel, allEpisodesUrl, accentColor }: AudioPlayerProps) {
  const c = colorMap[accentColor];
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const speeds = [1, 1.25, 1.5, 1.75, 2] as const;
  const [speedIndex, setSpeedIndex] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onDurationChange = () => setDuration(audio.duration);
    const onLoadedMetadata = () => { setDuration(audio.duration); setIsLoaded(true); };
    const onEnded = () => setIsPlaying(false);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
    };
  }, [mp3Url]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) { audio.pause(); } else { audio.play(); }
  }, [isPlaying]);

  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !audio.muted;
    setIsMuted(!isMuted);
  }, [isMuted]);

  const cycleSpeed = useCallback(() => {
    const next = (speedIndex + 1) % speeds.length;
    setSpeedIndex(next);
    if (audioRef.current) { audioRef.current.playbackRate = speeds[next]; }
  }, [speedIndex, speeds]);

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    const bar = progressRef.current;
    if (!audio || !bar || !duration) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = pct * duration;
  }, [duration]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={`rounded-lg bg-gradient-to-br ${c.gradient} border ${c.border} px-2.5 py-1.5 sm:px-3 sm:py-2 transition-all`}>
      <audio ref={audioRef} src={mp3Url} preload="metadata" />

      {/* Single row: play button + info + controls */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        <button
          onClick={togglePlay}
          className={`h-6 w-6 sm:h-7 sm:w-7 rounded-md ${c.iconBg} flex items-center justify-center transition-colors shrink-0`}
        >
          {isPlaying ? (
            <Pause className={`h-3 w-3 ${c.iconFill}`} />
          ) : (
            <Play className={`h-3 w-3 ${c.iconFill} ml-0.5`} />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <Mic className={`h-2.5 w-2.5 shrink-0 ${c.icon}`} />
            <span className={`text-[10px] font-semibold tracking-wide uppercase shrink-0 ${c.icon}`}>
              {label}
            </span>
            <span className="text-[10px] text-muted-foreground/40 shrink-0">{timeLabel}</span>
          </div>
          <p className="text-[12px] font-medium leading-tight line-clamp-1 text-foreground/90 mt-0.5">
            {title}
          </p>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={cycleSpeed}
            className="px-1 py-0.5 rounded hover:bg-muted/40 text-muted-foreground/50 hover:text-muted-foreground transition-colors text-[9px] font-semibold tabular-nums min-w-[1.75rem] text-center"
            title="Playback speed"
          >
            {speeds[speedIndex]}x
          </button>
          <button
            onClick={toggleMute}
            className="hidden sm:block p-1 rounded hover:bg-muted/40 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            {isMuted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
          </button>
          <a
            href={allEpisodesUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`p-1 rounded hover:bg-muted/40 ${c.link} transition-colors`}
            title="All Episodes"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {/* Progress bar — always visible on desktop, only when playing on mobile */}
      <div className={`mt-1.5 flex items-center gap-2 ${isPlaying || currentTime > 0 ? '' : 'hidden sm:flex'}`}>
        <span className="text-[8px] text-muted-foreground/40 tabular-nums w-8 text-right shrink-0">
          {formatTime(currentTime)}
        </span>
        <div
          ref={progressRef}
          onClick={handleProgressClick}
          className="flex-1 h-1 bg-muted/40 rounded-full cursor-pointer relative overflow-hidden"
        >
          <div
            className={`h-full ${c.bar} rounded-full transition-[width] duration-150 ease-linear`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-[8px] text-muted-foreground/40 tabular-nums w-8 shrink-0">
          {isLoaded ? formatTime(duration) : '--:--'}
        </span>
      </div>
    </div>
  );
}
