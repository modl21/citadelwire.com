import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';

const CORS_PROXY = 'https://proxy.shakespeare.diy/?url=';

export interface RSSEpisode {
  title: string;
  mp3Url: string;
  pubDate: string;
  guid: string;
}

const MAX_EPISODE_AGE_MS = 3 * 24 * 60 * 60 * 1000;

function isRecentEpisode(episode: RSSEpisode): boolean {
  const publishedAt = new Date(episode.pubDate).getTime();
  return Number.isFinite(publishedAt) && Date.now() - publishedAt <= MAX_EPISODE_AGE_MS;
}

async function fetchFeed(feedUrl: string, signal: AbortSignal): Promise<Response> {
  try {
    const direct = await fetch(feedUrl, {
      // Revalidate using HTTP validators instead of discarding cached responses.
      // No custom request headers: avoid an unnecessary CORS preflight.
      cache: 'no-cache',
      signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
    });
    if (direct.ok) return direct;
  } catch {
    signal.throwIfAborted();
    // Fall back to the configured proxy below.
  }

  return fetch(`${CORS_PROXY}${encodeURIComponent(feedUrl)}`, {
    cache: 'no-cache',
    signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
  });
}

async function fetchEpisodes(feedUrl: string, signal: AbortSignal): Promise<RSSEpisode[]> {
  const res = await fetchFeed(feedUrl, signal);
  if (!res.ok) throw new Error('Failed to fetch RSS feed');
  const text = await res.text();
  const xml = new DOMParser().parseFromString(text, 'text/xml');
  const episodes: RSSEpisode[] = [];

  for (const item of Array.from(xml.querySelectorAll('item'))) {
    const title = item.querySelector('title')?.textContent ?? 'Latest Episode';
    const pubDate = item.querySelector('pubDate')?.textContent ?? '';
    const mp3Url = item.querySelector('enclosure')?.getAttribute('url') ?? '';
    const guid = item.querySelector('guid')?.textContent?.trim() || mp3Url;
    const episode = { title, mp3Url, pubDate, guid };
    if (mp3Url && isRecentEpisode(episode)) episodes.push(episode);
  }
  return episodes;
}

export function useRSSEpisode(
  feedUrl: string,
  predicate?: (episode: RSSEpisode) => boolean,
  _cacheKey?: string,
) {
  const selectEpisode = useCallback(
    (episodes: RSSEpisode[]) => episodes.find((episode) => isRecentEpisode(episode) && (!predicate || predicate(episode))) ?? null,
    [predicate],
  );

  // A single fetch/XML parse per feed, with independent episode selection for
  // shows such as Ten31 and TFTC that share a feed but use different filters.
  return useQuery({
    queryKey: ['rss-feed', feedUrl],
    queryFn: ({ signal }) => fetchEpisodes(feedUrl, signal),
    select: selectEpisode,
    staleTime: 15 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
    refetchIntervalInBackground: false,
    retry: 1,
    refetchOnMount: false,
  });
}
