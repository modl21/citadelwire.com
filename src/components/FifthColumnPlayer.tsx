import { useRSSEpisode } from '@/hooks/useRSSEpisode';
import { AudioPlayer, AudioPlayerSkeleton } from '@/components/AudioPlayer';
import { formatDistanceToNow } from 'date-fns';

const FIFTH_COLUMN_FEED_URL = 'https://api.substack.com/feed/podcast/815642.rss';

export function FifthColumnPlayer() {
  const { data: episode, isLoading } = useRSSEpisode(
    FIFTH_COLUMN_FEED_URL,
    (candidate) => !candidate.title.toLowerCase().includes('members only'),
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
        label="Latest Fifth Column"
        title={episode.title}
        mp3Url={episode.mp3Url}
        timeLabel={timeLabel}
        allEpisodesUrl="https://www.wethefifth.com/podcast"
        accentColor="zinc"
      />
    </div>
  );
}
