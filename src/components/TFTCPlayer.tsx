import { useRSSEpisode } from '@/hooks/useRSSEpisode';
import { AudioPlayer, AudioPlayerSkeleton } from '@/components/AudioPlayer';
import { formatDistanceToNow } from 'date-fns';

const TFTC_FEED_URL = 'https://feeds.fountain.fm/ZwwaDULvAj0yZvJ5kdB9';

export function TFTCPlayer() {
  const { data: episode, isLoading } = useRSSEpisode(
    TFTC_FEED_URL,
    (candidate) => candidate.title.toLowerCase().includes('ten31 timestamp'),
  );

  if (isLoading) {
    return (
      <div className="px-4 sm:px-6 py-1.5">
        <AudioPlayerSkeleton />
      </div>
    );
  }

  if (!episode) return null;

  const timeLabel = episode.pubDate
    ? formatDistanceToNow(new Date(episode.pubDate), { addSuffix: true })
    : '';

  return (
    <div className="px-4 sm:px-6 py-1.5">
      <AudioPlayer
        label="Ten31 Timestamp"
        title={episode.title.replace(/^Ten31 Timestamp:\s*/i, '')}
        mp3Url={episode.mp3Url}
        timeLabel={timeLabel}
        allEpisodesUrl="https://fountain.fm/show/V71wG3DhMtF9fDqaJRWX"
        accentColor="sky"
      />
    </div>
  );
}
