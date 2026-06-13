import { useQuery } from '@tanstack/react-query';

const CORS_PROXY = 'https://proxy.shakespeare.diy/?url=';

export interface RSSEpisode {
  title: string;
  mp3Url: string;
  pubDate: string;
  guid: string;
}

const MAX_EPISODE_AGE_MS = 4 * 24 * 60 * 60 * 1000;

function isOlderThanFourDays(pubDate: string): boolean {
  const publishedAt = new Date(pubDate).getTime();
  if (!Number.isFinite(publishedAt)) return true;
  return Date.now() - publishedAt > MAX_EPISODE_AGE_MS;
}

async function fetchFeed(feedUrl: string): Promise<Response> {
  const cb = Date.now().toString();
  const busterUrl = feedUrl.includes('?') ? `${feedUrl}&_cb=${cb}` : `${feedUrl}?_cb=${cb}`;

  try {
    const direct = await fetch(busterUrl, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
      signal: AbortSignal.timeout(5000),
    });
    if (direct.ok) return direct;
  } catch {
    // Fall back to the configured proxy below.
  }

  return fetch(`${CORS_PROXY}${encodeURIComponent(busterUrl)}`, {
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
    },
    signal: AbortSignal.timeout(8000),
  });
}

export function useRSSEpisode(
  feedUrl: string,
  predicate?: (episode: RSSEpisode) => boolean,
  cacheKey?: string,
) {
  return useQuery<RSSEpisode | null>({
    queryKey: ['rss-episode', feedUrl, cacheKey ?? (predicate ? 'filtered' : 'latest')],
    queryFn: async () => {
      const res = await fetchFeed(feedUrl);
      if (!res.ok) throw new Error('Failed to fetch RSS feed');
      const text = await res.text();

      const parser = new DOMParser();
      const xml = parser.parseFromString(text, 'text/xml');

      const items = Array.from(xml.querySelectorAll('item'));
      for (const item of items) {
        const title = item.querySelector('title')?.textContent ?? 'Latest Episode';
        const pubDate = item.querySelector('pubDate')?.textContent ?? '';

        // Get mp3 URL from enclosure tag
        const enclosure = item.querySelector('enclosure');
        const mp3Url = enclosure?.getAttribute('url') ?? '';
        const guid = item.querySelector('guid')?.textContent?.trim() || mp3Url;

        if (!mp3Url) continue;
        if (!pubDate || isOlderThanFourDays(pubDate)) continue;

        const episode = { title, mp3Url, pubDate, guid };
        if (!predicate || predicate(episode)) return episode;
      }

      return null;
    },
    staleTime: 15 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
    refetchOnMount: false,
  });
}
