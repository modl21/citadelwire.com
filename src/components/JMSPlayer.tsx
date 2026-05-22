import { useRSSEpisode } from '@/hooks/useRSSEpisode';
import { AudioPlayer, AudioPlayerSkeleton } from '@/components/AudioPlayer';
import { formatDistanceToNow } from 'date-fns';

const JMS_FEED_URL = 'https://anchor.fm/s/e29097f4/podcast/rss';

export function JMSPlayer() {
  const { data: episode, isLoading } = useRSSEpisode(JMS_FEED_URL);

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
        label="Latest JMS"
        title={episode.title}
        mp3Url={episode.mp3Url}
        timeLabel={timeLabel}
        allEpisodesUrl="https://podcasters.spotify.com/pod/show/thejackmallersshow"
        accentColor="emerald"
      />
    </div>
  );
}
