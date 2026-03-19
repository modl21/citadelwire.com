import { useRSSEpisode } from '@/hooks/useRSSEpisode';
import { AudioPlayer, AudioPlayerSkeleton } from '@/components/AudioPlayer';
import { formatDistanceToNow } from 'date-fns';

const RHR_FEED_URL = 'https://feeds.fountain.fm/0EAzqUaM4qqanDr1qNuK';

export function RHRPlayer() {
  const { data: episode, isLoading } = useRSSEpisode(RHR_FEED_URL);

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
        label="Latest Recap"
        title={episode.title.replace(/RABBIT HOLE RECAP/gi, 'RHR')}
        mp3Url={episode.mp3Url}
        timeLabel={timeLabel}
        allEpisodesUrl="https://primal.net/rhr"
        accentColor="orange"
      />
    </div>
  );
}
