import { useRSSEpisode } from '@/hooks/useRSSEpisode';
import { AudioPlayer, AudioPlayerSkeleton } from '@/components/AudioPlayer';
import { formatDistanceToNow } from 'date-fns';

const ALL_IN_FEED_URL = 'https://allinchamathjason.libsyn.com/rss';

export function AllInPlayer() {
  const { data: episode, isLoading } = useRSSEpisode(ALL_IN_FEED_URL);

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
        label="Latest All-In"
        title={episode.title}
        mp3Url={episode.mp3Url}
        timeLabel={timeLabel}
        allEpisodesUrl="http://allinchamathjason.libsyn.com/website"
        accentColor="rose"
      />
    </div>
  );
}
