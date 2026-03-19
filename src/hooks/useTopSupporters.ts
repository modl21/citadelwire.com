import type { NostrEvent } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { NLogin, NUser } from '@nostrify/react/login';
import { useQuery } from '@tanstack/react-query';
import { generateSecretKey, nip19 } from 'nostr-tools';

export const SUPPORTER_KIND = 9633;
export const SUPPORTER_SITE_ID = 'com.citadelwire.supporters';

const VISITOR_SECRET_STORAGE_KEY = 'citadel-wire:page-view-visitor-secret';

type NostrClient = ReturnType<typeof useNostr>['nostr'];

export interface Supporter {
  pubkey: string;
  totalSats: number;
  latestAt: number;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error('Invalid key');
  }
  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
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

function parseAmount(content: string): number | null {
  const trimmed = content.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const amount = Number.parseInt(trimmed, 10);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

function aggregateSupporters(events: NostrEvent[]): Supporter[] {
  const map = new Map<string, { totalSats: number; latestAt: number }>();

  for (const event of events) {
    if (event.kind !== SUPPORTER_KIND) continue;

    const pTag = event.tags.find(([name]) => name === 'p')?.[1];
    if (!pTag || !/^[0-9a-f]{64}$/.test(pTag)) continue;

    const sats = parseAmount(event.content);
    if (!sats) continue;

    const existing = map.get(pTag);
    if (existing) {
      existing.totalSats += sats;
      if (event.created_at > existing.latestAt) {
        existing.latestAt = event.created_at;
      }
    } else {
      map.set(pTag, { totalSats: sats, latestAt: event.created_at });
    }
  }

  return Array.from(map.entries())
    .map(([pubkey, data]) => ({ pubkey, ...data }))
    .sort((a, b) => b.totalSats - a.totalSats);
}

export async function publishSupporterEvent(
  nostr: NostrClient,
  supporterPubkey: string,
  amountSats: number,
): Promise<void> {
  const secretKey = getVisitorSecretKey();
  const login = NLogin.fromNsec(nip19.nsecEncode(secretKey));
  const user = NUser.fromNsecLogin(login);

  const signedEvent = await user.signer.signEvent({
    kind: SUPPORTER_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['d', SUPPORTER_SITE_ID],
      ['p', supporterPubkey],
      ['t', 'supporter'],
      ['t', 'citadel-wire'],
      ['alt', `Citadel Wire supporter donation of ${amountSats} sats`],
    ],
    content: String(amountSats),
  });

  await nostr.event(signedEvent, { signal: AbortSignal.timeout(5000) });
}

export function useTopSupporters(limit: number = 10) {
  const { nostr } = useNostr();

  return useQuery<Supporter[]>({
    queryKey: ['top-supporters', SUPPORTER_SITE_ID],
    queryFn: async () => {
      const events = await nostr.query([
        {
          kinds: [SUPPORTER_KIND],
          '#d': [SUPPORTER_SITE_ID],
          limit: 200,
        },
      ]);

      return aggregateSupporters(events).slice(0, limit);
    },
    staleTime: 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
    retry: 1,
  });
}
