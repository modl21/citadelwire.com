import { useLatestEpisode } from '@/hooks/useLatestEpisode';
import { AudioPlayer, AudioPlayerSkeleton } from '@/components/AudioPlayer';
import { formatDistanceToNow } from 'date-fns';

export function PodcastPlayer() {
  const { data: episode, isLoading } = useLatestEpisode();

  if (isLoading) {
    return (
      <div className="px-4 sm:px-6 py-3">
        <AudioPlayerSkeleton />
      </div>
    );
  }

  if (!episode) return null;

  const timeAgo = formatDistanceToNow(new Date(episode.event.created_at * 1000), { addSuffix: true });

  return (
    <div className="px-4 sm:px-6 py-3">
      <AudioPlayer
        title={episode.title}
        mp3Url={episode.mp3Url}
        timeLabel={timeAgo}
        allEpisodesUrl="https://serve.podhome.fm/CitadelDispatch"
        accentColor="purple"
      />
    </div>
  );
}
