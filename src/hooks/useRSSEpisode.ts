import { useQuery } from '@tanstack/react-query';

const CORS_PROXY = 'https://proxy.shakespeare.diy/?url=';

export interface RSSEpisode {
  title: string;
  mp3Url: string;
  pubDate: string;
}

const MAX_EPISODE_AGE_MS = 3 * 24 * 60 * 60 * 1000;

function isOlderThanThreeDays(pubDate: string): boolean {
  const publishedAt = new Date(pubDate).getTime();
  if (!Number.isFinite(publishedAt)) return true;
  return Date.now() - publishedAt > MAX_EPISODE_AGE_MS;
}

async function fetchFeed(feedUrl: string): Promise<Response> {
  try {
    const direct = await fetch(feedUrl, { signal: AbortSignal.timeout(5000) });
    if (direct.ok) return direct;
  } catch {
    // Fall back to the configured proxy below.
  }

  return fetch(`${CORS_PROXY}${encodeURIComponent(feedUrl)}`, { signal: AbortSignal.timeout(8000) });
}

export function useRSSEpisode(feedUrl: string) {
  return useQuery<RSSEpisode | null>({
    queryKey: ['rss-episode', feedUrl],
    queryFn: async () => {
      const res = await fetchFeed(feedUrl);
      if (!res.ok) throw new Error('Failed to fetch RSS feed');
      const text = await res.text();

      const parser = new DOMParser();
      const xml = parser.parseFromString(text, 'text/xml');

      const item = xml.querySelector('item');
      if (!item) return null;

      const title = item.querySelector('title')?.textContent ?? 'Latest Episode';
      const pubDate = item.querySelector('pubDate')?.textContent ?? '';

      // Get mp3 URL from enclosure tag
      const enclosure = item.querySelector('enclosure');
      const mp3Url = enclosure?.getAttribute('url') ?? '';

      if (!mp3Url) return null;
      if (!pubDate || isOlderThanThreeDays(pubDate)) return null;

      return { title, mp3Url, pubDate };
    },
    staleTime: 15 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
    refetchOnMount: false,
  });
}
