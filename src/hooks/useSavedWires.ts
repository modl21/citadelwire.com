import { useCallback, useSyncExternalStore } from 'react';

const SAVED_WIRES_STORAGE_KEY = 'citadel-wire:saved-wire-ids';
const MAX_SAVED_WIRES = 500;

const listeners = new Set<() => void>();
let cachedIds: Set<string> | null = null;

function loadSavedIds(): Set<string> {
  if (cachedIds) return cachedIds;
  if (typeof window === 'undefined') {
    cachedIds = new Set();
    return cachedIds;
  }
  try {
    const raw = window.localStorage.getItem(SAVED_WIRES_STORAGE_KEY);
    if (!raw) {
      cachedIds = new Set();
      return cachedIds;
    }
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      cachedIds = new Set(parsed.filter((item): item is string => typeof item === 'string'));
      return cachedIds;
    }
  } catch {
    // Ignore corrupt localStorage entries
  }
  cachedIds = new Set();
  return cachedIds;
}

function persistSavedIds(next: Set<string>) {
  cachedIds = next;
  if (typeof window !== 'undefined') {
    try {
      const trimmed = Array.from(next).slice(-MAX_SAVED_WIRES);
      window.localStorage.setItem(SAVED_WIRES_STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      // Ignore storage quota errors
    }
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const emptySet = new Set<string>();
const getServerSnapshot = () => emptySet;

/** Shared bookmark store persisted in localStorage across feed and post pages. */
export function useSavedWires() {
  const savedIds = useSyncExternalStore(subscribe, loadSavedIds, getServerSnapshot);

  const toggleSaved = useCallback((eventId: string) => {
    const current = loadSavedIds();
    const next = new Set(current);
    if (next.has(eventId)) {
      next.delete(eventId);
    } else {
      next.add(eventId);
    }
    persistSavedIds(next);
  }, []);

  return {
    savedIds,
    savedCount: savedIds.size,
    toggleSaved,
  };
}
