import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

/** The pubkey for Citadel Dispatch podcast */
export const PODCAST_PUBKEY = '7f573f55d875ce8edc528edf822949fd2ab9f9c65d914a40225663b0a697be07';

export interface EpisodeData {
  event: NostrEvent;
  title: string;
  mp3Url: string;
}

function extractMp3Url(content: string): string | null {
  // Match URLs ending in .mp3 (with optional query params)
  const mp3Regex = /https?:\/\/[^\s"'<>]+\.mp3[^\s"'<>]*/gi;
  const match = content.match(mp3Regex);
  return match ? match[0] : null;
}

function extractTitle(content: string): string {
  // Try to extract the first line as a title
  const lines = content.trim().split('\n').filter((l) => l.trim().length > 0);
  if (lines.length > 0) {
    // Clean up the first line — remove URLs and trim
    let title = lines[0].replace(/https?:\/\/[^\s]+/g, '').trim();
    // If first line is too short or empty after removing URLs, try second line
    if (title.length < 5 && lines.length > 1) {
      title = lines[1].replace(/https?:\/\/[^\s]+/g, '').trim();
    }
    // Truncate if too long
    if (title.length > 120) {
      title = title.slice(0, 117) + '...';
    }
    return title || 'Latest Episode';
  }
  return 'Latest Episode';
}

export function useLatestEpisode() {
  const { nostr } = useNostr();

  return useQuery<EpisodeData | null>({
    queryKey: ['latest-episode'],
    queryFn: async () => {
      const events = await nostr.query([
        {
          kinds: [1],
          authors: [PODCAST_PUBKEY],
          limit: 10,
        },
      ]);

      // Sort newest first
      const sorted = events.sort((a, b) => b.created_at - a.created_at);

      // Find the first post that has an mp3 URL
      for (const event of sorted) {
        const mp3Url = extractMp3Url(event.content);
        if (mp3Url) {
          return {
            event,
            title: extractTitle(event.content),
            mp3Url,
          };
        }
      }

      return null;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });
}
