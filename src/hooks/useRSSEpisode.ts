import { useQuery } from '@tanstack/react-query';

const CORS_PROXY = 'https://proxy.shakespeare.diy/?url=';

export interface RSSEpisode {
  title: string;
  mp3Url: string;
  pubDate: string;
}

export function useRSSEpisode(feedUrl: string) {
  return useQuery<RSSEpisode | null>({
    queryKey: ['rss-episode', feedUrl],
    queryFn: async () => {
      const res = await fetch(`${CORS_PROXY}${encodeURIComponent(feedUrl)}`);
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

      return { title, mp3Url, pubDate };
    },
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
}
