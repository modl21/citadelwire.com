import { useState, useEffect, useCallback, useRef } from 'react';
import { Zap, Copy, Check, ExternalLink, User, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useToast } from '@/hooks/useToast';
import { useIsMobile } from '@/hooks/useIsMobile';
import { publishSupporterEvent, getVisitorSigner } from '@/lib/publishSupporter';
import { CITADEL_PUBKEY } from '@/hooks/useCitadelFeed';
import { useNostr } from '@nostrify/react';
import { nip19 } from 'nostr-tools';
import QRCode from 'qrcode';

const LIGHTNING_ADDRESS = 'wire@primal.net';
const ZAP_POLL_INTERVAL_MS = 3000;
const ZAP_POLL_MAX_DURATION_MS = 10 * 60 * 1000; // stop polling after 10 minutes
const ZAP_RELAYS = ['wss://relay.primal.net', 'wss://relay.damus.io', 'wss://relay.ditto.pub'];

const presetAmounts = [1000, 5000, 10000, 21000, 42000];

interface LnurlPayEndpoint {
  callback: string;
  minSendable: number;
  maxSendable: number;
  allowsNostr?: boolean;
  nostrPubkey?: string;
  commentAllowed?: number;
}

async function resolveLnurlEndpoint(): Promise<LnurlPayEndpoint> {
  const [name, domain] = LIGHTNING_ADDRESS.split('@');
  const url = `https://${domain}/.well-known/lnurlp/${name}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to resolve lightning address');
  return res.json();
}

async function fetchInvoice(amountSats: number, comment?: string): Promise<string> {
  const data = await resolveLnurlEndpoint();
  if (!data.callback) throw new Error('No callback URL found');

  const amountMsat = amountSats * 1000;
  if (data.minSendable && amountMsat < data.minSendable) {
    throw new Error(`Minimum amount is ${Math.ceil(data.minSendable / 1000)} sats`);
  }
  if (data.maxSendable && amountMsat > data.maxSendable) {
    throw new Error(`Maximum amount is ${Math.floor(data.maxSendable / 1000)} sats`);
  }

  const callbackUrl = new URL(data.callback);
  callbackUrl.searchParams.set('amount', amountMsat.toString());

  // NIP-57: If the endpoint supports Nostr zaps, create and attach a zap request
  if (data.allowsNostr && data.nostrPubkey) {
    try {
      const visitor = getVisitorSigner();
      const zapRequest = await visitor.signer.signEvent({
        kind: 9734,
        created_at: Math.floor(Date.now() / 1000),
        content: comment?.trim() || '',
        tags: [
          ['relays', ...ZAP_RELAYS],
          ['amount', String(amountMsat)],
          ['p', CITADEL_PUBKEY],
        ],
      });
      callbackUrl.searchParams.set('nostr', JSON.stringify(zapRequest));
    } catch {
      // If zap request signing fails, fall back to plain invoice
    }
  }

  if (comment && comment.trim() && data.commentAllowed && data.commentAllowed > 0) {
    callbackUrl.searchParams.set('comment', comment.trim().slice(0, data.commentAllowed));
  }

  const invoiceRes = await fetch(callbackUrl.toString());
  if (!invoiceRes.ok) throw new Error('Failed to get invoice');
  const invoiceData = await invoiceRes.json();

  if (!invoiceData.pr) throw new Error('No invoice returned');
  return invoiceData.pr;
}

function validateNpub(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const decoded = nip19.decode(trimmed);
    if (decoded.type === 'npub') {
      return decoded.data;
    }
    if (decoded.type === 'nprofile') {
      return decoded.data.pubkey;
    }
    return null;
  } catch {
    return null;
  }
}

function DonateContent({
  onClose,
}: {
  onClose: () => void;
}) {
  const { toast } = useToast();
  const { nostr } = useNostr();
  const [amount, setAmount] = useState<number | string>(1000);
  const [memo, setMemo] = useState('');
  const [npubInput, setNpubInput] = useState('');
  const [invoice, setInvoice] = useState<string | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [donationCompleted, setDonationCompleted] = useState(false);
  const [completedAmount, setCompletedAmount] = useState(0);
  const [zapDetected, setZapDetected] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef = useRef<number>(0);

  // Define callbacks BEFORE effects that reference them
  const recordSupporter = useCallback(async (sats: number) => {
    const pubkey = validateNpub(npubInput);
    if (!pubkey) return;

    try {
      await publishSupporterEvent(nostr, pubkey, sats);
    } catch (err) {
      console.warn('Failed to publish supporter event:', err);
    }
  }, [nostr, npubInput]);

  const handleGetInvoice = useCallback(async () => {
    const finalAmount = typeof amount === 'string' ? parseInt(amount, 10) : amount;
    if (!finalAmount || finalAmount <= 0) {
      toast({ title: 'Enter an amount', variant: 'destructive' });
      return;
    }
    setIsLoading(true);
    try {
      // Try WebLN first
      if (typeof window !== 'undefined' && 'webln' in window) {
        try {
          const webln = (window as Record<string, unknown>).webln as { enable: () => Promise<void>; sendPayment: (invoice: string) => Promise<void> };
          await webln.enable();
          const pr = await fetchInvoice(finalAmount, memo);
          await webln.sendPayment(pr);
          toast({ title: 'Donation sent!', description: `You sent ${finalAmount} sats. Thank you!` });
          await recordSupporter(finalAmount);
          onClose();
          return;
        } catch {
          // WebLN failed or was rejected, fall through to QR
        }
      }
      const pr = await fetchInvoice(finalAmount, memo);
      setInvoice(pr);
      setCompletedAmount(finalAmount);
    } catch (err) {
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [amount, memo, toast, onClose, recordSupporter]);

  const handleCopy = async () => {
    if (!invoice) return;
    await navigator.clipboard.writeText(invoice);
    setCopied(true);
    toast({ title: 'Copied!', description: 'Invoice copied to clipboard' });
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePaid = async () => {
    toast({ title: 'Thank you!', description: `Your support means everything.` });
    await recordSupporter(completedAmount);
    setDonationCompleted(true);
    setTimeout(() => window.location.reload(), 2000);
  };

  // Poll for zap receipt (kind 9735) matching the invoice
  useEffect(() => {
    if (!invoice) {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }

    pollStartRef.current = Date.now();

    const checkForZapReceipt = async () => {
      // Stop polling after max duration
      if (Date.now() - pollStartRef.current > ZAP_POLL_MAX_DURATION_MS) {
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
        return;
      }

      try {
        const since = Math.floor(pollStartRef.current / 1000) - 30;
        const events = await nostr.query([
          {
            kinds: [9735],
            '#p': [CITADEL_PUBKEY],
            since,
            limit: 20,
          },
        ]);

        // Check if any zap receipt contains a bolt11 tag matching our invoice
        const match = events.find((event) => {
          const bolt11Tag = event.tags.find(([name]) => name === 'bolt11')?.[1];
          return bolt11Tag && bolt11Tag.toLowerCase() === invoice.toLowerCase();
        });

        if (match) {
          setZapDetected(true);
          if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
          }
        }
      } catch {
        // Silently ignore polling errors
      }
    };

    // Initial check after a short delay
    const initialTimeout = setTimeout(checkForZapReceipt, 2000);
    pollTimerRef.current = setInterval(checkForZapReceipt, ZAP_POLL_INTERVAL_MS);

    return () => {
      clearTimeout(initialTimeout);
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [invoice, nostr]);

  // Auto-confirm when zap receipt is detected
  useEffect(() => {
    if (!zapDetected || donationCompleted) return;

    const confirm = async () => {
      toast({ title: 'Payment confirmed!', description: `Zap receipt detected. Thank you!` });
      await recordSupporter(completedAmount);
      setDonationCompleted(true);
      setTimeout(() => window.location.reload(), 2000);
    };

    void confirm();
  }, [zapDetected, donationCompleted, completedAmount, recordSupporter, toast, onClose]);

  // Generate QR code when invoice changes
  useEffect(() => {
    if (!invoice) {
      setQrCodeUrl('');
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(invoice.toUpperCase(), {
      width: 400,
      margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' },
    }).then((url) => {
      if (!cancelled) setQrCodeUrl(url);
    });
    return () => { cancelled = true; };
  }, [invoice]);

  if (donationCompleted) {
    return (
      <div className="py-8 px-1 text-center space-y-3">
        <div className="text-4xl">🧡</div>
        <p className="text-sm text-muted-foreground">Thank you for supporting CITADEL WIRE!</p>
      </div>
    );
  }

  if (invoice) {
    const displayAmount = typeof amount === 'string' ? parseInt(amount, 10) : amount;
    return (
      <div className="space-y-4 px-1">
        <div className="text-center">
          <span className="text-2xl font-bold">{displayAmount.toLocaleString()}</span>
          <span className="text-muted-foreground ml-1.5 text-sm">sats</span>
        </div>

        <div className="flex justify-center">
          <div className="bg-white rounded-xl p-2.5 shadow-sm">
            {qrCodeUrl ? (
              <img src={qrCodeUrl} alt="Lightning QR" className="w-52 h-52 sm:w-56 sm:h-56" />
            ) : (
              <div className="w-52 h-52 sm:w-56 sm:h-56 bg-muted animate-pulse rounded" />
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <Input
            value={invoice}
            readOnly
            className="font-mono text-[11px] flex-1 min-w-0"
            onClick={(e) => e.currentTarget.select()}
          />
          <Button variant="outline" size="icon" onClick={handleCopy} className="shrink-0">
            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>

        <Button
          variant="outline"
          className="w-full"
          onClick={() => window.open(`lightning:${invoice}`, '_blank')}
        >
          <ExternalLink className="h-4 w-4 mr-2" />
          Open in Wallet
        </Button>

        <div className="flex items-center justify-center gap-2 py-1.5 text-xs text-muted-foreground/60">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Waiting for payment confirmation...</span>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs text-muted-foreground/60 hover:text-foreground"
          onClick={handlePaid}
        >
          Confirm manually
        </Button>

        <button
          onClick={() => { setInvoice(null); setQrCodeUrl(''); setZapDetected(false); }}
          className="text-xs text-muted-foreground/50 hover:text-muted-foreground w-full text-center transition-colors"
        >
          Change amount
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 px-1">
      <ToggleGroup
        type="single"
        value={String(amount)}
        onValueChange={(v) => { if (v) setAmount(parseInt(v, 10)); }}
        className="grid grid-cols-5 gap-1.5"
      >
        {presetAmounts.map((a) => (
          <ToggleGroupItem key={a} value={String(a)} className="text-xs font-semibold tabular-nums py-2.5">
            {a >= 1000 ? `${a / 1000}k` : a}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className="relative">
        <Input
          type="number"
          placeholder="Custom amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="pr-12"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground/50">sats</span>
      </div>

      <Input
        type="text"
        placeholder="Add a memo (optional)"
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
      />

      <div className="relative">
        <Input
          type="text"
          placeholder="Your npub (optional, to appear as supporter)"
          value={npubInput}
          onChange={(e) => setNpubInput(e.target.value)}
          className="pl-9 text-sm"
        />
        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
      </div>
      {npubInput && !validateNpub(npubInput) && (
        <p className="text-[11px] text-destructive -mt-2 ml-1">Enter a valid npub or nprofile</p>
      )}

      <Button onClick={handleGetInvoice} className="w-full" disabled={isLoading}>
        <Zap className="h-4 w-4 mr-2" />
        {isLoading ? 'Getting invoice...' : 'Donate'}
      </Button>
    </div>
  );
}

export function DonateButton() {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-amber-500/15 text-amber-500 hover:bg-amber-500/25 transition-colors text-xs font-semibold"
        >
          <Zap className="h-3.5 w-3.5" />
          Donate
        </button>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="rounded-t-2xl max-h-[90dvh] overflow-y-auto">
            <SheetHeader className="text-center pb-2">
              <SheetTitle>Support CITADEL WIRE</SheetTitle>
            </SheetHeader>
            <div className="px-2 pb-6">
              <DonateContent onClose={() => setOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-amber-500/15 text-amber-500 hover:bg-amber-500/25 transition-colors text-xs font-semibold"
      >
        <Zap className="h-3.5 w-3.5" />
        Donate
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Support CITADEL WIRE</DialogTitle>
          </DialogHeader>
          <DonateContent onClose={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
