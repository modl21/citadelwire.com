import { NLogin, NUser } from '@nostrify/react/login';
import { generateSecretKey, nip19 } from 'nostr-tools';
import { SUPPORTER_DONATION_KIND } from '@/hooks/useTopSupporters';

export const LEGACY_SUPPORTER_KIND = 9633;

const VISITOR_SECRET_STORAGE_KEY = 'citadel-wire:page-view-visitor-secret';

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

/** Get an NUser signer from the visitor's ephemeral key (creates one if needed). */
export function getVisitorSigner(): NUser {
  const secretKey = getVisitorSecretKey();
  const login = NLogin.fromNsec(nip19.nsecEncode(secretKey));
  return NUser.fromNsecLogin(login);
}

type NostrClientLike = {
  event(event: Record<string, unknown>, opts?: Record<string, unknown>): Promise<unknown>;
};

export async function publishSupporterEvent(
  nostr: NostrClientLike,
  supporterPubkey: string,
  amountSats: number,
  bolt11: string,
): Promise<void> {
  const user = getVisitorSigner();
  const normalizedBolt11 = bolt11.trim().toLowerCase();

  if (!normalizedBolt11) {
    throw new Error('A paid bolt11 invoice is required to track a supporter');
  }

  const signedEvent = await user.signer.signEvent({
    kind: SUPPORTER_DONATION_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['p', supporterPubkey],
      ['amount', String(amountSats * 1000)],
      ['bolt11', normalizedBolt11],
      ['currency', 'msat'],
      ['t', 'citadel-wire'],
      ['t', 'supporter-donation'],
      ['alt', `CITADEL WIRE confirmed supporter donation of ${amountSats} sats`],
    ],
    content: '',
  });

  await nostr.event(signedEvent, { signal: AbortSignal.timeout(5000) });
}
