import { useEffect, useState } from 'react';

export interface SupporterMetadata {
  name?: string;
  display_name?: string;
  picture: string;
}

export interface Supporter {
  pubkey: string;
  totalSats: number;
  latestAt: number;
  metadata: SupporterMetadata;
  paymentKeys: string[];
}

interface StoredSupporterLeaderboard {
  version: 1;
  supporters: Supporter[];
}

export interface LocalSupporterDonation {
  pubkey: string;
  amountSats: number;
  paymentKey: string;
  metadata: SupporterMetadata;
}

const LOCAL_SUPPORTERS_STORAGE_KEY = 'citadel-wire:top-supporters:v1';
const LOCAL_SUPPORTERS_UPDATED_EVENT = 'citadel-wire:top-supporters-updated';

function isHexPubkey(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

function isSupporterMetadata(value: unknown): value is SupporterMetadata {
  if (!value || typeof value !== 'object') return false;
  const metadata = value as Partial<SupporterMetadata>;
  return typeof metadata.picture === 'string' && metadata.picture.length > 0;
}

function isSupporter(value: unknown): value is Supporter {
  if (!value || typeof value !== 'object') return false;
  const supporter = value as Partial<Supporter>;
  return (
    isHexPubkey(supporter.pubkey) &&
    typeof supporter.totalSats === 'number' &&
    Number.isFinite(supporter.totalSats) &&
    supporter.totalSats > 0 &&
    typeof supporter.latestAt === 'number' &&
    Number.isFinite(supporter.latestAt) &&
    isSupporterMetadata(supporter.metadata) &&
    Array.isArray(supporter.paymentKeys) &&
    supporter.paymentKeys.every((paymentKey) => typeof paymentKey === 'string')
  );
}

function readStoredLeaderboard(): Supporter[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(LOCAL_SUPPORTERS_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as Partial<StoredSupporterLeaderboard>;
    if (parsed.version !== 1 || !Array.isArray(parsed.supporters)) return [];

    return parsed.supporters
      .filter(isSupporter)
      .sort((a, b) => b.totalSats - a.totalSats);
  } catch (error) {
    console.warn('Failed to read local top supporters:', error);
    return [];
  }
}

function writeStoredLeaderboard(supporters: Supporter[]): void {
  if (typeof window === 'undefined') return;

  const leaderboard: StoredSupporterLeaderboard = {
    version: 1,
    supporters: supporters.sort((a, b) => b.totalSats - a.totalSats),
  };

  window.localStorage.setItem(LOCAL_SUPPORTERS_STORAGE_KEY, JSON.stringify(leaderboard));
  window.dispatchEvent(new Event(LOCAL_SUPPORTERS_UPDATED_EVENT));
}

export function getLocalTopSupporters(limit: number = 10): Supporter[] {
  return readStoredLeaderboard().slice(0, limit);
}

export function recordLocalSupporterDonation(donation: LocalSupporterDonation): void {
  if (!isHexPubkey(donation.pubkey)) return;
  if (!Number.isFinite(donation.amountSats) || donation.amountSats <= 0) return;
  if (!donation.paymentKey.trim()) return;
  if (!isSupporterMetadata(donation.metadata)) return;

  const paymentKey = donation.paymentKey.trim().toLowerCase();
  const supporters = readStoredLeaderboard();
  const existing = supporters.find((supporter) => supporter.pubkey === donation.pubkey);
  const now = Math.floor(Date.now() / 1000);

  if (existing) {
    if (existing.paymentKeys.includes(paymentKey)) return;

    existing.totalSats += donation.amountSats;
    existing.latestAt = now;
    existing.metadata = donation.metadata;
    existing.paymentKeys = [...existing.paymentKeys, paymentKey].slice(-200);
  } else {
    supporters.push({
      pubkey: donation.pubkey,
      totalSats: donation.amountSats,
      latestAt: now,
      metadata: donation.metadata,
      paymentKeys: [paymentKey],
    });
  }

  writeStoredLeaderboard(supporters);
}

export function useTopSupporters(limit: number = 10) {
  const [supporters, setSupporters] = useState<Supporter[]>(() => getLocalTopSupporters(limit));

  useEffect(() => {
    const refreshSupporters = () => setSupporters(getLocalTopSupporters(limit));

    const handleStorage = (event: StorageEvent) => {
      if (event.key === LOCAL_SUPPORTERS_STORAGE_KEY) refreshSupporters();
    };

    window.addEventListener(LOCAL_SUPPORTERS_UPDATED_EVENT, refreshSupporters);
    window.addEventListener('storage', handleStorage);
    refreshSupporters();

    return () => {
      window.removeEventListener(LOCAL_SUPPORTERS_UPDATED_EVENT, refreshSupporters);
      window.removeEventListener('storage', handleStorage);
    };
  }, [limit]);

  return {
    data: supporters,
    isLoading: false,
  };
}
