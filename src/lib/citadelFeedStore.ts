import { openDB, type IDBPDatabase } from 'idb';
import type { NostrEvent } from '@nostrify/nostrify';

const DB_NAME = 'citadel-wire-feed-store';
const DB_VERSION = 1;
const STORE_NAME = 'feed';
const FEED_KEY = 'latest-posts';

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

export async function writeCachedCitadelPosts(posts: NostrEvent[]): Promise<void> {
  try {
    const db = await openDatabase();
    await db.put(STORE_NAME, posts, FEED_KEY);
  } catch (error) {
    console.warn('Failed to cache CITADEL WIRE posts:', error);
  }
}
