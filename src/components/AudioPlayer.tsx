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
    <div className="rounded-xl bg-muted/30 border border-border/40 p-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
      <Skeleton className="h-1.5 w-full mt-4 rounded-full" />
    </div>
  );
}

export function AudioPlayer({ title, mp3Url, timeLabel, allEpisodesUrl, accentColor }: AudioPlayerProps) {
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
    <div className={`rounded-xl bg-gradient-to-br ${c.gradient} border ${c.border} p-4 transition-all`}>
      <audio ref={audioRef} src={mp3Url} preload="metadata" />

      {/* Top label */}
      <div className="flex items-center gap-1.5 mb-2.5">
        <Mic className={`h-3 w-3 ${c.icon}`} />
        <span className={`text-[11px] font-semibold tracking-wide uppercase ${c.icon}`}>
          Latest Episode
        </span>
        <span className="text-[11px] text-muted-foreground/40 ml-1">{timeLabel}</span>
        <a
          href={allEpisodesUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`ml-auto inline-flex items-center gap-1 text-[11px] ${c.link} transition-colors`}
        >
          All Episodes
          <ExternalLink className="h-2.5 w-2.5" />
        </a>
      </div>

      {/* Title + controls */}
      <div className="flex items-center gap-3">
        <button
          onClick={togglePlay}
          className={`h-10 w-10 rounded-lg ${c.iconBg} flex items-center justify-center transition-colors shrink-0`}
        >
          {isPlaying ? (
            <Pause className={`h-4.5 w-4.5 ${c.iconFill}`} />
          ) : (
            <Play className={`h-4.5 w-4.5 ${c.iconFill} ml-0.5`} />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-snug line-clamp-2 text-foreground/90">
            {title}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={cycleSpeed}
            className="px-1.5 py-1 rounded-md hover:bg-muted/40 text-muted-foreground/50 hover:text-muted-foreground transition-colors text-[11px] font-semibold tabular-nums min-w-[2.5rem] text-center"
            title="Playback speed"
          >
            {speeds[speedIndex]}x
          </button>
          <button
            onClick={toggleMute}
            className="p-1.5 rounded-md hover:bg-muted/40 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            {isMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-3 space-y-1">
        <div
          ref={progressRef}
          onClick={handleProgressClick}
          className="h-1.5 bg-muted/40 rounded-full cursor-pointer group relative overflow-hidden"
        >
          <div
            className={`h-full ${c.bar} rounded-full transition-[width] duration-150 ease-linear`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground/40 tabular-nums">
          <span>{formatTime(currentTime)}</span>
          <span>{isLoaded ? formatTime(duration) : '--:--'}</span>
        </div>
      </div>
    </div>
  );
}
