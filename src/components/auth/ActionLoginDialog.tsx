import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowUpRight, Check, QrCode, Rabbit, Shield, Sparkles, UserRoundPlus } from 'lucide-react';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
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

function createNostrConnectUri(): string {
  const clientSecretKey = generateSecretKey();
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

  return `nostrconnect://${clientPubkey}?${params.toString()}`;
}

export function ActionLoginDialog({ open, onOpenChange, action = 'interact' }: ActionLoginDialogProps) {
  const login = useLoginActions();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const [error, setError] = useState<string | null>(null);
  const [isCreatingGuest, setIsCreatingGuest] = useState(false);
  const [guestName, setGuestName] = useState<string | null>(null);
  const nostrConnectUri = useMemo(() => createNostrConnectUri(), [open]);
  const [qrCodeUrl, setQrCodeUrl] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    void QRCode.toDataURL(nostrConnectUri, {
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
  }, [nostrConnectUri, open]);

  useEffect(() => {
    if (!open) {
      setError(null);
      setIsCreatingGuest(false);
    }
  }, [open]);

  const closeAfterLogin = () => {
    setError(null);
    setIsCreatingGuest(false);
    onOpenChange(false);
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
      <DialogContent className="overflow-hidden border-white/10 bg-[#080b12]/95 p-0 text-white shadow-2xl shadow-amber-500/10 backdrop-blur-2xl sm:max-w-[440px] sm:rounded-[28px]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(245,158,11,0.26),transparent_38%),radial-gradient(circle_at_12%_18%,rgba(56,189,248,0.14),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.06),transparent_36%)]" />
        <div className="relative p-6 sm:p-7">
          <DialogHeader className="items-center text-center">
            <div className="relative mb-3 flex h-20 w-20 items-center justify-center rounded-full border border-amber-300/20 bg-amber-300/10 shadow-[0_0_60px_rgba(245,158,11,0.18)]">
              <div className="absolute inset-2 rounded-full border border-white/10" />
              <Shield className="h-9 w-9 text-amber-200" />
            </div>
            <DialogTitle className="text-2xl font-black tracking-[-0.04em] text-white">
              Join CITADEL WIRE
            </DialogTitle>
            <DialogDescription className="max-w-sm text-sm leading-6 text-white/62">
              Choose how you want to {action}. Start instantly with a browser-only guest key, or scan with Primal for your real Nostr identity.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <Alert className="mt-5 border-red-400/30 bg-red-500/10 text-red-100">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="mt-6 flex flex-col gap-4">
            <div className="rounded-[24px] border border-white/10 bg-white/[0.045] p-4 shadow-xl shadow-black/10">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-300/12 text-emerald-200">
                  <UserRoundPlus className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black tracking-[-0.02em]">Create guest account</h3>
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
                className="mt-5 h-11 w-full rounded-2xl bg-gradient-to-r from-emerald-300 to-amber-300 text-sm font-black text-black shadow-lg shadow-emerald-500/10 hover:from-emerald-200 hover:to-amber-200"
              >
                {isCreatingGuest ? 'Creating…' : 'Create guest account'}
              </Button>
            </div>

            <div className="rounded-[24px] border border-white/10 bg-white/[0.045] p-4 shadow-xl shadow-black/10">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-300/12 text-sky-200">
                  <QrCode className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black tracking-[-0.02em]">Sign in with Primal</h3>
                  <p className="text-xs text-white/48">Scan nsecbunker QR</p>
                </div>
              </div>
              <div className="mt-4 rounded-[20px] border border-white/10 bg-white p-3">
                {qrCodeUrl ? (
                  <img src={qrCodeUrl} alt="Primal Nostr Connect sign-in QR code" className="mx-auto aspect-square w-full max-w-64 rounded-2xl" />
                ) : (
                  <div className="mx-auto aspect-square w-full max-w-64 animate-pulse rounded-2xl bg-slate-200" />
                )}
              </div>
              <p className="mt-3 text-xs leading-5 text-white/52">
                Open Primal on your phone and scan this QR to approve CITADEL WIRE as a remote signer client.
              </p>
              <a
                href={PRIMAL_DOWNLOAD_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-amber-200 underline underline-offset-4 hover:text-amber-100"
              >
                Download Primal
                <ArrowUpRight className="h-4 w-4" />
              </a>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-2 text-xs font-medium text-white/48">
            <Rabbit className="h-4 w-4 text-amber-200/70" />
            Guest keys live only in this browser. Clear browser storage and they are gone.
            <Sparkles className="h-4 w-4 text-sky-200/70" />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
