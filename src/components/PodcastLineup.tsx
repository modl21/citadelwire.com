import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useRSSEpisode, type RSSEpisode } from '@/hooks/useRSSEpisode';
import { AudioPlayer, AudioPlayerSkeleton } from '@/components/AudioPlayer';
import { cn } from '@/lib/utils';

type AccentColor = React.ComponentProps<typeof AudioPlayer>['accentColor'];

interface PodcastConfig {
  id: string;
  feedUrl: string;
  label: string;
  allEpisodesUrl: string;
  accentColor: AccentColor;
  predicate?: (episode: RSSEpisode) => boolean;
  titleTransform?: (title: string) => string;
}

const PODCASTS: PodcastConfig[] = [
  {
    id: 'dispatch',
    feedUrl: 'https://serve.podhome.fm/rss/c90e609a-df1e-596a-bd5e-57bcc8aad6cc',
    label: 'Latest Dispatch',
    allEpisodesUrl: 'https://citadeldispatch.com',
    accentColor: 'purple',
  },
  {
    id: 'rhr',
    feedUrl: 'https://feeds.fountain.fm/0EAzqUaM4qqanDr1qNuK',
    label: 'Latest Recap',
    allEpisodesUrl: 'https://rhr.tv',
    accentColor: 'orange',
    titleTransform: (title) => title.replace(/RABBIT HOLE RECAP/gi, 'RHR'),
  },
  {
    id: 'jms',
    feedUrl: 'https://anchor.fm/s/e29097f4/podcast/rss',
    label: 'Latest JMS',
    allEpisodesUrl: 'https://podcasters.spotify.com/pod/show/thejackmallersshow',
    accentColor: 'emerald',
  },
  {
    id: 'tftc',
    feedUrl: 'https://feeds.fountain.fm/ZwwaDULvAj0yZvJ5kdB9',
    label: 'Latest Ten31',
    allEpisodesUrl: 'https://fountain.fm/show/V71wG3DhMtF9fDqaJRWX',
    accentColor: 'sky',
    predicate: (episode) => episode.title.toLowerCase().includes('ten31 timestamp'),
    titleTransform: (title) => title.replace(/^Ten31 Timestamp:\s*/i, ''),
  },
  {
    id: 'blockspace',
    feedUrl: 'https://rss.beehiiv.com/podcasts/019dbc32-d0bc-72d2-a970-951247013bb3.xml',
    label: 'Latest Blockspace',
    allEpisodesUrl: 'https://newsletter.blockspacemedia.com/',
    accentColor: 'amber',
  },
  {
    id: 'hell-money',
    feedUrl: 'https://anchor.fm/s/9968c7a4/podcast/rss',
    label: 'Latest Hell Money',
    allEpisodesUrl: 'https://hellpodcast.money',
    accentColor: 'rose',
  },
  {
    id: 'all-in',
    feedUrl: 'https://allinchamathjason.libsyn.com/rss',
    label: 'Latest All-In',
    allEpisodesUrl: 'http://allinchamathjason.libsyn.com/website',
    accentColor: 'rose',
  },
  {
    id: 'tbpn',
    feedUrl: 'https://feeds.transistor.fm/technology-brother',
    label: 'Latest TBPN',
    allEpisodesUrl: 'https://www.tbpn.com',
    accentColor: 'lime',
    predicate: (episode) => episode.title.toLowerCase().includes('diet tbpn'),
    titleTransform: (title) => title.replace(/\s*\|\s*Diet TBPN\s*$/i, ''),
  },
  {
    id: 'fifth-column',
    feedUrl: 'https://api.substack.com/feed/podcast/815642.rss',
    label: 'Latest Fifth Column',
    allEpisodesUrl: 'https://www.wethefifth.com/podcast',
    accentColor: 'zinc',
    predicate: (episode) => !episode.title.toLowerCase().includes('members only'),
  },
  {
    id: 'no-solutions',
    feedUrl: 'https://sovereignengineering.io/dialogues.xml',
    label: 'Latest No Solutions',
    allEpisodesUrl: 'https://sovereignengineering.io/podcast',
    accentColor: 'emerald',
  },
  {
    id: 'what-bitcoin-did',
    feedUrl: 'https://feeds.fountain.fm/UZSKQcrOnhqYS1JopxGg',
    label: 'Latest WBD',
    allEpisodesUrl: 'https://www.whatbitcoindid.com',
    accentColor: 'orange',
  },
  {
    id: 'tftc-main',
    feedUrl: 'https://feeds.fountain.fm/ZwwaDULvAj0yZvJ5kdB9',
    label: 'Latest TFTC',
    allEpisodesUrl: 'https://tftc.io',
    accentColor: 'purple',
    predicate: (episode) => !episode.title.toLowerCase().includes('ten31 timestamp'),
  },
];

interface PodcastShowPlayerProps {
  config: PodcastConfig;
  onVisibilityChange: (id: string, visible: boolean) => void;
}

function PodcastShowPlayer({ config, onVisibilityChange }: PodcastShowPlayerProps) {
  const { data: episode, isLoading } = useRSSEpisode(config.feedUrl, config.predicate, config.id);
  const isVisible = isLoading || Boolean(episode);

  useEffect(() => {
    onVisibilityChange(config.id, isVisible);
  }, [config.id, isVisible, onVisibilityChange]);

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
        label={config.label}
        title={config.titleTransform ? config.titleTransform(episode.title) : episode.title}
        mp3Url={episode.mp3Url}
        timeLabel={timeLabel}
        allEpisodesUrl={config.allEpisodesUrl}
        accentColor={config.accentColor}
        storageKey={`${config.id}:${episode.guid}`}
      />
    </div>
  );
}

export function PodcastLineup() {
  const [expanded, setExpanded] = useState(false);
  const [visibleIds, setVisibleIds] = useState<Set<string>>(() => new Set());

  const setPodcastVisibility = useCallback((id: string, visible: boolean) => {
    setVisibleIds((current) => {
      const next = new Set(current);
      if (visible) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, []);

  const visibleOrder = useMemo(
    () => PODCASTS.filter((podcast) => visibleIds.has(podcast.id)).map((podcast) => podcast.id),
    [visibleIds],
  );
  const hiddenPodcastIds = useMemo(() => new Set(visibleOrder.slice(2)), [visibleOrder]);
  const firstHiddenPodcastId = visibleOrder[2];
  const hiddenCount = Math.max(visibleOrder.length - 2, 0);

  return (
    <div>
      {PODCASTS.map((config) => {
        const hiddenBehindToggle = hiddenPodcastIds.has(config.id);
        const showMoreToggle = hiddenCount > 0 && config.id === firstHiddenPodcastId;

        return (
          <div key={config.id}>
            {showMoreToggle && (
              <div className="px-4 py-1.5">
                <button
                  type="button"
                  onClick={() => setExpanded((value) => !value)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border/40 bg-muted/20 py-2 text-xs font-semibold text-muted-foreground/70 transition-colors hover:bg-muted/40 hover:text-muted-foreground"
                  aria-expanded={expanded}
                >
                  {expanded ? 'Show Fewer Shows' : `Show ${hiddenCount} More Shows`}
                  <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />
                </button>
              </div>
            )}
            <div className={cn(hiddenBehindToggle && !expanded && 'hidden')}>
              <PodcastShowPlayer config={config} onVisibilityChange={setPodcastVisibility} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
