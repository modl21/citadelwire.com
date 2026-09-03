import { openDB, type IDBPDatabase } from 'idb';
import type { NostrEvent } from '@nostrify/nostrify';

const DB_NAME = 'citadel-wire-feed-store';
const DB_VERSION = 1;
const STORE_NAME = 'feed';
const FEED_KEY = 'latest-posts';
const FEED_STATE_KEY = 'latest-posts-state';
const CACHE_VERSION = 2;

export interface CitadelFeedState {
  version: number;
  hasFullHistory: boolean;
  postCount: number;
  cachedAt: number;
}

async function openDatabase(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    },
  });
}

function isValidEvent(event: unknown): event is NostrEvent {
  if (!event || typeof event !== 'object') return false;
  const candidate = event as Partial<NostrEvent>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.pubkey === 'string' &&
    typeof candidate.created_at === 'number' &&
    typeof candidate.kind === 'number' &&
    Array.isArray(candidate.tags) &&
    typeof candidate.content === 'string' &&
    typeof candidate.sig === 'string'
  );
}

export async function readCachedCitadelFeedState(): Promise<CitadelFeedState | null> {
  try {
    const db = await openDatabase();
    const data: unknown = await db.get(STORE_NAME, FEED_STATE_KEY);
    if (!data || typeof data !== 'object') return null;
    const state = data as Partial<CitadelFeedState>;
    if (state.version !== CACHE_VERSION || typeof state.hasFullHistory !== 'boolean') return null;
    return {
      version: CACHE_VERSION,
      hasFullHistory: state.hasFullHistory,
      postCount: typeof state.postCount === 'number' ? state.postCount : 0,
      cachedAt: typeof state.cachedAt === 'number' ? state.cachedAt : 0,
    };
  } catch (error) {
    console.warn('Failed to read cached CITADEL WIRE feed state:', error);
    return null;
  }
}

export async function readCachedCitadelPosts(): Promise<NostrEvent[]> {
  try {
    const db = await openDatabase();
    const data: unknown = await db.get(STORE_NAME, FEED_KEY);
    if (!Array.isArray(data)) return [];
    return data.filter(isValidEvent).sort((a, b) => b.created_at - a.created_at);
  } catch (error) {
    console.warn('Failed to read cached CITADEL WIRE posts:', error);
    return [];
  }
}

export async function writeCachedCitadelPosts(posts: NostrEvent[], hasFullHistory: boolean): Promise<void> {
  try {
    const db = await openDatabase();
    await db.put(STORE_NAME, posts, FEED_KEY);
    await db.put(STORE_NAME, {
      version: CACHE_VERSION,
      hasFullHistory,
      postCount: posts.length,
      cachedAt: Date.now(),
    } satisfies CitadelFeedState, FEED_STATE_KEY);
  } catch (error) {
    console.warn('Failed to cache CITADEL WIRE posts:', error);
  }
}
