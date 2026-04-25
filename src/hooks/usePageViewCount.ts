import { useEffect, useRef } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { NLogin, NUser } from '@nostrify/react/login';
import { useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { generateSecretKey, nip19 } from 'nostr-tools';

export const PAGE_VIEW_COUNTER_KIND = 3927;
export const HOME_PAGE_VIEW_ID = 'com.citadelwire.page-views.home';

const VISITOR_SECRET_STORAGE_KEY = 'citadel-wire:page-view-visitor-secret';
const OUTLIER_TOLERANCE_WHEN_FLAT = 3;

type NostrClient = ReturnType<typeof useNostr>['nostr'];

interface PageViewSnapshot {
  count: number;
  sampledTotals: number[];
  sampledEvents: number;
}

function getTagValue(event: NostrEvent, tagName: string): string | undefined {
  return event.tags.find(([name]) => name === tagName)?.[1];
}

function parseCount(content: string): number | null {
  const normalized = content.trim();

  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  const count = Number.parseInt(normalized, 10);
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

function quantile(sortedValues: number[], ratio: number): number {
  if (sortedValues.length === 1) {
    return sortedValues[0];
  }

  const position = (sortedValues.length - 1) * ratio;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lowerValue = sortedValues[lowerIndex];
  const upperValue = sortedValues[upperIndex];

  if (lowerIndex === upperIndex) {
    return lowerValue;
  }

  const weight = position - lowerIndex;
  return lowerValue + (upperValue - lowerValue) * weight;
}

function filterOutlierTotals(values: number[]): number[] {
  if (values.length < 4) {
    return values;
  }

  const sortedValues = [...values].sort((a, b) => a - b);
  const q1 = quantile(sortedValues, 0.25);
  const q3 = quantile(sortedValues, 0.75);
  const iqr = q3 - q1;

  if (iqr === 0) {
    const median = quantile(sortedValues, 0.5);
    const filtered = values.filter((value) => Math.abs(value - median) <= OUTLIER_TOLERANCE_WHEN_FLAT);
    return filtered.length > 0 ? filtered : values;
  }

  const lowerBound = q1 - (1.5 * iqr);
  const upperBound = q3 + (1.5 * iqr);
  const filtered = values.filter((value) => value >= lowerBound && value <= upperBound);

  return filtered.length > 0 ? filtered : values;
}

function getSnapshotFromEvents(events: NostrEvent[], pageId: string): PageViewSnapshot {
  const recentTotals = [...events]
    .sort((a, b) => b.created_at - a.created_at)
    .map((event) => {
      if (event.kind !== PAGE_VIEW_COUNTER_KIND) {
        return null;
      }

      if (getTagValue(event, 'd') !== pageId) {
        return null;
      }

      return parseCount(event.content);
    })
    .filter((count): count is number => count !== null)
    .slice(0, 10);

  if (recentTotals.length === 0) {
    return {
      count: 0,
      sampledTotals: [],
      sampledEvents: 0,
    };
  }

  const filteredTotals = filterOutlierTotals(recentTotals);

  return {
    count: Math.max(...filteredTotals),
    sampledTotals: filteredTotals,
    sampledEvents: recentTotals.length,
  };
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.trim().toLowerCase();

  if (!/^[0-9a-f]+$/.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error('Invalid visitor secret key');
  }

  const bytes = new Uint8Array(normalized.length / 2);

  for (let index = 0; index < bytes.length; index += 1) {
    const offset = index * 2;
    const byte = Number.parseInt(normalized.slice(offset, offset + 2), 16);

    if (Number.isNaN(byte)) {
      throw new Error('Invalid visitor secret key');
    }

    bytes[index] = byte;
  }

  return bytes;
}

function getVisitorSecretKey(): Uint8Array {
  const existingKey = window.localStorage.getItem(VISITOR_SECRET_STORAGE_KEY);

  if (existingKey) {
    try {
      return hexToBytes(existingKey);
    } catch {
      window.localStorage.removeItem(VISITOR_SECRET_STORAGE_KEY);
    }
  }

  const generatedKey = generateSecretKey();
  window.localStorage.setItem(VISITOR_SECRET_STORAGE_KEY, bytesToHex(generatedKey));
  return generatedKey;
}

async function publishPageViewEvent(nostr: NostrClient, nextCount: number, pageId: string, pageUrl: string): Promise<void> {
  const secretKey = getVisitorSecretKey();
  const login = NLogin.fromNsec(nip19.nsecEncode(secretKey));
  const user = NUser.fromNsecLogin(login);
  const signedEvent = await user.signer.signEvent({
    kind: PAGE_VIEW_COUNTER_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['d', pageId],
      ['u', pageUrl],
      ['t', 'view-count'],
      ['t', 'citadel-wire'],
      ['alt', `Page view counter update for ${pageId}`],
    ],
    content: String(nextCount),
  });

  await nostr.event(signedEvent, { signal: AbortSignal.timeout(5000) });
}

export function usePageViewCount(pageId: string, pageUrl: string) {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();
  const hasPublishedRef = useRef(false);
  const queryKey: QueryKey = ['page-view-count', pageId];

  const query = useQuery<PageViewSnapshot>({
    queryKey,
    queryFn: async () => {
      const events = await nostr.query([
        {
          kinds: [PAGE_VIEW_COUNTER_KIND],
          '#d': [pageId],
          limit: 10,
        },
      ]);

      return getSnapshotFromEvents(events, pageId);
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchInterval: false,
    retry: 1,
    refetchOnMount: false,
  });

  useEffect(() => {
    if (hasPublishedRef.current || query.isLoading) {
      return;
    }

    hasPublishedRef.current = true;

    const nextCount = (query.data?.count ?? 0) + 1;

    void publishPageViewEvent(nostr, nextCount, pageId, pageUrl)
      .then(() => {
        queryClient.setQueryData<PageViewSnapshot>(queryKey, (current) => ({
          count: Math.max(current?.count ?? 0, nextCount),
          sampledTotals: filterOutlierTotals([...(current?.sampledTotals ?? []), nextCount].slice(-10)),
          sampledEvents: Math.min((current?.sampledEvents ?? 0) + 1, 10),
        }));
      })
      .catch((error: unknown) => {
        console.warn('Failed to publish page view event', error);
      });
  }, [nostr, pageId, pageUrl, query.data?.count, query.isLoading, queryClient]);

  return {
    count: query.data?.count ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
