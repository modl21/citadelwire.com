import { useRSSEpisode } from '@/hooks/useRSSEpisode';
import { AudioPlayer, AudioPlayerSkeleton } from '@/components/AudioPlayer';
import { formatDistanceToNow } from 'date-fns';

const DISPATCH_FEED_URL = 'https://serve.podhome.fm/rss/c90e609a-df1e-596a-bd5e-57bcc8aad6cc';

export function PodcastPlayer() {
  const { data: episode, isLoading } = useRSSEpisode(DISPATCH_FEED_URL);

  if (isLoading) {
    return (
      <div className="px-4 sm:px-6 py-3">
        <AudioPlayerSkeleton />
      </div>
    );
  }

  if (!episode) return null;

  const timeLabel = episode.pubDate
    ? formatDistanceToNow(new Date(episode.pubDate), { addSuffix: true })
    : '';

  return (
    <div className="px-4 sm:px-6 py-3">
      <AudioPlayer
        label="Latest Dispatch"
        title={episode.title}
        mp3Url={episode.mp3Url}
        timeLabel={timeLabel}
        allEpisodesUrl="https://primal.net/citadel"
        accentColor="purple"
      />
    </div>
  );
}
