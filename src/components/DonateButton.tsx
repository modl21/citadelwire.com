import { useState, useEffect, useCallback } from 'react';
import { Zap, Copy, Check, ExternalLink, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerClose,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useToast } from '@/hooks/useToast';
import { useIsMobile } from '@/hooks/useIsMobile';
import QRCode from 'qrcode';

const LIGHTNING_ADDRESS = 'citadel@primal.net';

const presetAmounts = [21, 100, 500, 1000, 5000];

async function fetchInvoice(amountSats: number): Promise<string> {
  // Resolve lightning address to LNURL callback
  const [name, domain] = LIGHTNING_ADDRESS.split('@');
  const url = `https://${domain}/.well-known/lnurlp/${name}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to resolve lightning address');
  const data = await res.json();

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

  const invoiceRes = await fetch(callbackUrl.toString());
  if (!invoiceRes.ok) throw new Error('Failed to get invoice');
  const invoiceData = await invoiceRes.json();

  if (!invoiceData.pr) throw new Error('No invoice returned');
  return invoiceData.pr;
}

function DonateContent({
  onClose,
}: {
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [amount, setAmount] = useState<number | string>(100);
  const [invoice, setInvoice] = useState<string | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

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
          const pr = await fetchInvoice(finalAmount);
          await webln.sendPayment(pr);
          toast({ title: 'Donation sent!', description: `You sent ${finalAmount} sats. Thank you!` });
          onClose();
          return;
        } catch {
          // WebLN failed or was rejected, fall through to QR
        }
      }
      const pr = await fetchInvoice(finalAmount);
      setInvoice(pr);
    } catch (err) {
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [amount, toast, onClose]);

  const handleCopy = async () => {
    if (!invoice) return;
    await navigator.clipboard.writeText(invoice);
    setCopied(true);
    toast({ title: 'Copied!', description: 'Invoice copied to clipboard' });
    setTimeout(() => setCopied(false), 2000);
  };

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

        <button
          onClick={() => { setInvoice(null); setQrCodeUrl(''); }}
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
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent>
            <DrawerHeader className="text-center relative">
              <DrawerClose asChild>
                <Button variant="ghost" size="sm" className="absolute right-4 top-4">
                  <X className="h-4 w-4" />
                </Button>
              </DrawerClose>
              <DrawerTitle>Support CITADEL WIRE</DrawerTitle>
              <DrawerDescription>
                Send sats via Lightning to {LIGHTNING_ADDRESS}
              </DrawerDescription>
            </DrawerHeader>
            <div className="px-4 pb-6">
              <DonateContent onClose={() => setOpen(false)} />
            </div>
          </DrawerContent>
        </Drawer>
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
            <DialogDescription>
              Send sats via Lightning to {LIGHTNING_ADDRESS}
            </DialogDescription>
          </DialogHeader>
          <DonateContent onClose={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
