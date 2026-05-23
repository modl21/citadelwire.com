import { useRSSEpisode } from '@/hooks/useRSSEpisode';
import { AudioPlayer, AudioPlayerSkeleton } from '@/components/AudioPlayer';
import { formatDistanceToNow } from 'date-fns';

const TBPN_FEED_URL = 'https://feeds.transistor.fm/technology-brother';

export function TBPNPlayer() {
  const { data: episode, isLoading } = useRSSEpisode(
    TBPN_FEED_URL,
    (candidate) => candidate.title.toLowerCase().includes('diet tbpn'),
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
        label="Diet TBPN"
        title={episode.title.replace(/\s*\|\s*Diet TBPN\s*$/i, '')}
        mp3Url={episode.mp3Url}
        timeLabel={timeLabel}
        allEpisodesUrl="https://www.tbpn.com"
        accentColor="lime"
      />
    </div>
  );
}
