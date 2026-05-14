import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowUpRight, Check, Copy, QrCode, Rabbit, Shield, Sparkles, UserRoundPlus } from 'lucide-react';
import { generateSecretKey, getPublicKey, nip19, nip44 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import QRCode from 'qrcode';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useLoginActions } from '@/hooks/useLoginActions';
import { useNostrPublish } from '@/hooks/useNostrPublish';

interface ActionLoginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action?: string;
  event?: NostrEvent;
}

const GUEST_NSEC_STORAGE_KEY = 'citadel-wire:guest-nsec';
const GUEST_NAME_STORAGE_KEY = 'citadel-wire:guest-name';
const PRIMAL_DOWNLOAD_URL = 'https://primal.net/downloads';
const NOSTR_CONNECT_RELAYS = [
  'wss://relay.primal.net',
  'wss://relay.ditto.pub',
  'wss://relay.damus.io',
];
const GUEST_ANIMALS = [
  'Aardvark',
  'Albatross',
  'Badger',
  'Bison',
  'Bobcat',
  'Caribou',
  'Cobra',
  'Condor',
  'Coyote',
  'Falcon',
  'Fox',
  'Gecko',
  'Heron',
  'Jaguar',
  'Kestrel',
  'Lynx',
  'Marmot',
  'Ocelot',
  'Otter',
  'Panther',
  'Peregrine',
  'Raven',
  'Salmon',
  'Snowcat',
  'Sparrow',
  'Stallion',
  'Viper',
  'Wolf',
];

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

function generateGuestName(): string {
  const animal = GUEST_ANIMALS[Math.floor(Math.random() * GUEST_ANIMALS.length)];
  const suffix = randomHex(2).toUpperCase();
  return `Citadel ${animal} ${suffix}`;
}

function getOrCreateGuestAccount(): { nsec: string; name: string } {
  const existingNsec = localStorage.getItem(GUEST_NSEC_STORAGE_KEY);
  const existingName = localStorage.getItem(GUEST_NAME_STORAGE_KEY);

  if (existingNsec && existingName) {
    return { nsec: existingNsec, name: existingName };
  }

  const secretKey = generateSecretKey();
  const nsec = nip19.nsecEncode(secretKey);
  const name = existingName ?? generateGuestName();

  localStorage.setItem(GUEST_NSEC_STORAGE_KEY, nsec);
  localStorage.setItem(GUEST_NAME_STORAGE_KEY, name);

  return { nsec, name };
}

interface NostrConnectSession {
  uri: string;
  clientNsec: `nsec1${string}`;
  clientPubkey: string;
  secret: string;
}

interface NostrConnectResponsePayload {
  id?: string;
  result?: string;
  error?: string;
}

function createNostrConnectSession(): NostrConnectSession {
  const clientSecretKey = generateSecretKey();
  const clientNsec = nip19.nsecEncode(clientSecretKey);
  const clientPubkey = getPublicKey(clientSecretKey);
  const secret = randomHex(16);
  const params = new URLSearchParams();

  NOSTR_CONNECT_RELAYS.forEach((relay) => params.append('relay', relay));
  params.set('secret', secret);
  params.set('name', 'CITADEL WIRE');
  params.set('perms', [
    'get_public_key',
    'sign_event:1',
    'sign_event:6',
    'sign_event:7',
    'sign_event:1111',
    'sign_event:9734',
  ].join(','));

  if (typeof window !== 'undefined') {
    params.set('url', window.location.origin);
  }

  return {
    uri: `nostrconnect://${clientPubkey}?${params.toString()}`,
    clientNsec,
    clientPubkey,
    secret,
  };
}

export function ActionLoginDialog({ open, onOpenChange, action = 'interact', event }: ActionLoginDialogProps) {
  const login = useLoginActions();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const [error, setError] = useState<string | null>(null);
  const [isCreatingGuest, setIsCreatingGuest] = useState(false);
  const [guestName, setGuestName] = useState<string | null>(null);
  const [copiedEventId, setCopiedEventId] = useState(false);
  const nostrConnectSession = useMemo(() => createNostrConnectSession(), [open]);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const hasCompletedPrimalLogin = useRef(false);
  const eventIdentifier = useMemo(() => event ? nip19.neventEncode({ id: event.id, author: event.pubkey, relays: NOSTR_CONNECT_RELAYS }) : undefined, [event]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    setQrCodeUrl('');

    void QRCode.toDataURL(nostrConnectSession.uri, {
      width: 384,
      margin: 2,
      color: {
        dark: '#020617',
        light: '#ffffff',
      },
    }).then((url) => {
      if (!cancelled) setQrCodeUrl(url);
    }).catch(() => {
      if (!cancelled) setError('Could not generate the Primal sign-in QR code.');
    });

    return () => {
      cancelled = true;
    };
  }, [nostrConnectSession.uri, open]);

  useEffect(() => {
    if (!open) {
      setError(null);
      setIsCreatingGuest(false);
      setCopiedEventId(false);
      hasCompletedPrimalLogin.current = false;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const since = Math.floor(Date.now() / 1000) - 10;
    const sockets = NOSTR_CONNECT_RELAYS.map((relay) => {
      const socket = new WebSocket(relay);
      const subscriptionId = `primal-login-${randomHex(4)}`;

      socket.addEventListener('open', () => {
        socket.send(JSON.stringify([
          'REQ',
          subscriptionId,
          {
            kinds: [24133],
            '#p': [nostrConnectSession.clientPubkey],
            since,
          },
        ]));
      });

      socket.addEventListener('message', (message) => {
        if (cancelled || hasCompletedPrimalLogin.current) return;

        try {
          const relayMessage = JSON.parse(String(message.data));
          if (!Array.isArray(relayMessage) || relayMessage[0] !== 'EVENT') return;
          const event = relayMessage[2] as { pubkey?: string; content?: string };
          if (!event?.pubkey || typeof event.content !== 'string') return;
          const clientSecretKey = (nip19.decode(nostrConnectSession.clientNsec) as { type: 'nsec'; data: Uint8Array }).data;
          const conversationKey = nip44.v2.utils.getConversationKey(clientSecretKey, event.pubkey);
          const decryptedContent = nip44.v2.decrypt(event.content, conversationKey);
          const payload = JSON.parse(decryptedContent) as NostrConnectResponsePayload;
          if (payload.result !== nostrConnectSession.secret) return;

          hasCompletedPrimalLogin.current = true;
          cancelled = true;
          login.nsec(nostrConnectSession.clientNsec);
          sockets.forEach((item) => item.close());
          setTimeout(() => window.location.reload(), 150);
        } catch (err) {
          console.warn('Ignored invalid Nostr Connect response', err);
        }
      });

      socket.addEventListener('error', () => {
        // Other relays may still receive the authorization response.
      });

      return socket;
    });

    return () => {
      cancelled = true;
      sockets.forEach((socket) => {
        try {
          socket.close();
        } catch {
          // Ignore cleanup errors.
        }
      });
    };
  }, [login, nostrConnectSession, open]);

  const closeAfterLogin = () => {
    setError(null);
    setIsCreatingGuest(false);
    onOpenChange(false);
  };

  const handleCopyEventId = async () => {
    if (!eventIdentifier) return;

    try {
      await navigator.clipboard.writeText(eventIdentifier);
      setCopiedEventId(true);
      setTimeout(() => setCopiedEventId(false), 1800);
    } catch {
      setError('Could not copy the event ID.');
    }
  };

  const handleCreateGuest = async () => {
    setIsCreatingGuest(true);
    setError(null);

    try {
      const account = getOrCreateGuestAccount();
      setGuestName(account.name);
      login.nsec(account.nsec);

      try {
        await publishEvent({
          kind: 0,
          content: JSON.stringify({
            name: account.name,
            display_name: account.name,
            about: 'Guest CITADEL WIRE account stored locally in this browser.',
          }),
          tags: [],
        });
      } catch (profileError) {
        console.warn('Guest profile publish failed', profileError);
      }

      closeAfterLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create a guest account.');
      setIsCreatingGuest(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-hidden border-white/10 bg-[#080b12]/95 p-0 text-white shadow-2xl shadow-amber-500/10 backdrop-blur-2xl sm:max-w-[440px] sm:rounded-[28px]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(245,158,11,0.26),transparent_38%),radial-gradient(circle_at_12%_18%,rgba(56,189,248,0.14),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.06),transparent_36%)]" />
        <div className="relative max-h-[92dvh] overflow-y-auto p-4 sm:p-7">
          <DialogHeader className="items-center text-center">
            <div className="relative mb-1 flex h-12 w-12 items-center justify-center rounded-full border border-amber-300/20 bg-amber-300/10 shadow-[0_0_60px_rgba(245,158,11,0.18)] sm:h-16 sm:w-16">
              <div className="absolute inset-2 rounded-full border border-white/10" />
              <Shield className="h-5 w-5 text-amber-200 sm:h-7 sm:w-7" />
            </div>
            <DialogTitle className="sr-only">Sign in</DialogTitle>
            <DialogDescription className="sr-only">Choose a sign in method.</DialogDescription>
          </DialogHeader>

          {error && (
            <Alert className="mt-5 border-red-400/30 bg-red-500/10 text-red-100">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="mt-4 flex flex-col gap-3 sm:mt-6 sm:gap-4">
            <div className="rounded-[20px] border border-white/10 bg-white/[0.045] p-3 shadow-xl shadow-black/10 sm:rounded-[24px] sm:p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-300/12 text-emerald-200 sm:h-11 sm:w-11">
                  <UserRoundPlus className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black tracking-[-0.02em] sm:text-base">Create guest account</h3>
                </div>
              </div>
              {guestName && (
                <div className="mt-3 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-xs font-semibold text-emerald-100">
                  <Check className="mr-1 inline h-3.5 w-3.5" />
                  {guestName}
                </div>
              )}
              <Button
                type="button"
                onClick={handleCreateGuest}
                disabled={isCreatingGuest}
                className="mt-3 h-10 w-full rounded-2xl bg-gradient-to-r from-emerald-300 to-amber-300 text-sm font-black text-black shadow-lg shadow-emerald-500/10 hover:from-emerald-200 hover:to-amber-200 sm:mt-5 sm:h-11"
              >
                {isCreatingGuest ? 'Creating…' : 'Create guest account'}
              </Button>
            </div>

            <div className="rounded-[20px] border border-white/10 bg-white/[0.045] p-3 shadow-xl shadow-black/10 sm:rounded-[24px] sm:p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sky-300/12 text-sky-200 sm:h-11 sm:w-11">
                  <QrCode className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black tracking-[-0.02em] sm:text-base">Sign in with Primal</h3>
                  <p className="text-xs text-white/48">Scan nsecbunker QR</p>
                </div>
              </div>
              <div className="mt-3 rounded-[18px] border border-white/10 bg-white p-2 sm:mt-4 sm:rounded-[20px] sm:p-3">
                {qrCodeUrl ? (
                  <img src={qrCodeUrl} alt="Primal Nostr Connect sign-in QR code" className="mx-auto aspect-square w-full max-w-44 rounded-2xl sm:max-w-64" />
                ) : (
                  <div className="mx-auto aspect-square w-full max-w-44 animate-pulse rounded-2xl bg-slate-200 sm:max-w-64" />
                )}
              </div>
              <p className="mt-2 text-[11px] leading-4 text-white/52 sm:mt-3 sm:text-xs sm:leading-5">
                Open Primal on your phone and scan this QR to approve CITADEL WIRE as a remote signer client.
              </p>
              <a
                href={PRIMAL_DOWNLOAD_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-amber-200 underline underline-offset-4 hover:text-amber-100 sm:mt-3 sm:text-sm"
              >
                Download Primal
                <ArrowUpRight className="h-4 w-4" />
              </a>
            </div>
          </div>

          {eventIdentifier && (
            <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.035] p-2.5 sm:mt-5 sm:p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/38">Open elsewhere</p>
                  <p className="mt-1 truncate font-mono text-[11px] text-white/58">{eventIdentifier}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyEventId}
                  className="shrink-0 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-white/72 hover:bg-white/10 hover:text-white"
                >
                  {copiedEventId ? <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-200" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                  {copiedEventId ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>
          )}

          <div className="mt-3 flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-2 text-[11px] font-medium leading-4 text-white/48 sm:mt-5 sm:text-xs">
            <Rabbit className="h-4 w-4 text-amber-200/70" />
            Guest keys live only in this browser. Clear browser storage and they are gone.
            <Sparkles className="h-4 w-4 text-sky-200/70" />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
