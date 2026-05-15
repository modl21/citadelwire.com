import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowUpRight, Check, Copy, Rabbit, Shield, Sparkles, UserRoundPlus } from 'lucide-react';
import { generateSecretKey, nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useLoginActions } from '@/hooks/useLoginActions';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { CITADEL_FEED_RELAYS } from '@/hooks/useCitadelFeed';

interface ActionLoginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action?: string;
  event?: NostrEvent;
}

const GUEST_NSEC_STORAGE_KEY = 'citadel-wire:guest-nsec';
const GUEST_NAME_STORAGE_KEY = 'citadel-wire:guest-name';
const PRIMAL_DOWNLOAD_URL = 'https://primal.net/downloads';
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


export function ActionLoginDialog({ open, onOpenChange, action = 'interact', event }: ActionLoginDialogProps) {
  const login = useLoginActions();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const [error, setError] = useState<string | null>(null);
  const [isCreatingGuest, setIsCreatingGuest] = useState(false);
  const [guestName, setGuestName] = useState<string | null>(null);
  const [copiedEventId, setCopiedEventId] = useState(false);
  const eventIdentifier = useMemo(() => event ? nip19.neventEncode({ id: event.id, author: event.pubkey, relays: CITADEL_FEED_RELAYS }) : undefined, [event]);
  const eventDeepLink = eventIdentifier ? `nostr:${eventIdentifier}` : undefined;


  useEffect(() => {
    if (!open) {
      setError(null);
      setIsCreatingGuest(false);
      setCopiedEventId(false);
    }
  }, [open]);


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
            about: 'ANON CITADEL WIRE account stored locally in this browser.',
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
                  <h3 className="text-sm font-black tracking-[-0.02em] sm:text-base">Create ANON ACCOUNT</h3>
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
                {isCreatingGuest ? 'Creating…' : 'Create ANON ACCOUNT'}
              </Button>
            </div>

          </div>

          {eventIdentifier && (
            <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.035] p-2.5 sm:mt-5 sm:p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/38">Open in any Nostr app</p>
                  <p className="mt-1 truncate font-mono text-[11px] text-white/58">{eventIdentifier}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {eventDeepLink && (
                    <a
                      href={eventDeepLink}
                      className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/72 hover:bg-white/10 hover:text-white"
                    >
                      Open
                    </a>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleCopyEventId}
                    className="rounded-xl border border-white/10 bg-white/[0.04] px-3 text-white/72 hover:bg-white/10 hover:text-white"
                  >
                    {copiedEventId ? <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-200" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                    {copiedEventId ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="mt-3 space-y-2 rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-2 text-center text-[11px] font-medium leading-4 text-white/48 sm:mt-5 sm:text-xs">
            <div className="flex items-center justify-center gap-2">
              <Rabbit className="h-4 w-4 text-amber-200/70" />
              ANON ACCOUNT keys live only in this browser. Clear browser storage and they are gone.
              <Sparkles className="h-4 w-4 text-sky-200/70" />
            </div>
            <a
              href={PRIMAL_DOWNLOAD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 font-bold text-amber-200 underline underline-offset-4 hover:text-amber-100"
            >
              Need a Nostr app?
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
