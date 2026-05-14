import { useState } from 'react';
import { AlertTriangle, ArrowRight, Check, KeyRound, Radio, Shield, Sparkles, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useLoginActions } from '@/hooks/useLoginActions';
import { cn } from '@/lib/utils';

interface ActionLoginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action?: string;
}

const validateNsec = (nsec: string) => /^nsec1[a-zA-Z0-9]{58}$/.test(nsec.trim());
const validateBunkerUri = (uri: string) => uri.trim().startsWith('bunker://');

export function ActionLoginDialog({ open, onOpenChange, action = 'interact' }: ActionLoginDialogProps) {
  const login = useLoginActions();
  const [nsec, setNsec] = useState('');
  const [bunkerUri, setBunkerUri] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const hasExtension = typeof window !== 'undefined' && 'nostr' in window;

  const closeAfterLogin = () => {
    setIsLoading(false);
    setError(null);
    setNsec('');
    setBunkerUri('');
    onOpenChange(false);
  };

  const handleNsecLogin = () => {
    if (!validateNsec(nsec)) {
      setError('Enter a valid nsec secret key beginning with nsec1.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      login.nsec(nsec.trim());
      closeAfterLogin();
    } catch {
      setError('That secret key could not be used. Check it and try again.');
      setIsLoading(false);
    }
  };

  const handleBunkerLogin = async () => {
    if (!validateBunkerUri(bunkerUri)) {
      setError('Enter a valid bunker:// remote signer URI.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await login.bunker(bunkerUri.trim());
      closeAfterLogin();
    } catch {
      setError('Could not connect to that bunker. Check the URI and approve the request in your signer.');
      setIsLoading(false);
    }
  };

  const handleExtensionLogin = async () => {
    setIsLoading(true);
    setError(null);

    try {
      await login.extension();
      closeAfterLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Extension login failed.');
      setIsLoading(false);
    }
  };

  const handleFileUpload = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result ?? '').trim();
      setNsec(value);
      if (validateNsec(value)) {
        try {
          login.nsec(value);
          closeAfterLogin();
        } catch {
          setError('The uploaded key could not be used.');
        }
      } else {
        setError('That file does not contain a valid nsec secret key.');
      }
    };
    reader.onerror = () => setError('Could not read that file.');
    reader.readAsText(file);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden border-white/10 bg-[#080b12]/95 p-0 text-white shadow-2xl shadow-amber-500/10 backdrop-blur-2xl sm:max-w-[460px] sm:rounded-[28px]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(245,158,11,0.26),transparent_38%),radial-gradient(circle_at_12%_18%,rgba(56,189,248,0.14),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.06),transparent_36%)]" />
        <div className="relative p-6 sm:p-7">
          <DialogHeader className="items-center text-center">
            <div className="relative mb-3 flex h-20 w-20 items-center justify-center rounded-full border border-amber-300/20 bg-amber-300/10 shadow-[0_0_60px_rgba(245,158,11,0.18)]">
              <div className="absolute inset-2 rounded-full border border-white/10" />
              <KeyRound className="h-9 w-9 text-amber-200" />
            </div>
            <DialogTitle className="text-2xl font-black tracking-[-0.04em] text-white">
              Join CITADEL WIRE
            </DialogTitle>
            <DialogDescription className="max-w-sm text-sm leading-6 text-white/62">
              Sign in with your Nostr key to {action}. Your identity stays under your control and every action is signed locally or by your bunker.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-6 grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-white/[0.035] p-2 text-[11px] font-semibold text-white/64">
            <div className="flex items-center justify-center gap-1.5 rounded-xl bg-white/[0.04] px-2 py-2">
              <Shield className="h-3.5 w-3.5 text-emerald-300" />
              Sovereign
            </div>
            <div className="flex items-center justify-center gap-1.5 rounded-xl bg-white/[0.04] px-2 py-2">
              <Radio className="h-3.5 w-3.5 text-sky-300" />
              Nostr
            </div>
            <div className="flex items-center justify-center gap-1.5 rounded-xl bg-white/[0.04] px-2 py-2">
              <Sparkles className="h-3.5 w-3.5 text-amber-200" />
              Live
            </div>
          </div>

          {error && (
            <Alert className="mt-4 border-red-400/30 bg-red-500/10 text-red-100">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {hasExtension && (
            <Button
              type="button"
              onClick={handleExtensionLogin}
              disabled={isLoading}
              className="mt-5 h-12 w-full rounded-2xl bg-gradient-to-r from-amber-300 to-orange-500 text-sm font-black text-black shadow-lg shadow-amber-500/20 hover:from-amber-200 hover:to-orange-400"
            >
              {isLoading ? 'Opening signer…' : 'Continue with extension'}
              {!isLoading && <ArrowRight className="ml-2 h-4 w-4" />}
            </Button>
          )}

          <Tabs defaultValue="bunker" className="mt-5 w-full">
            <TabsList className="grid h-11 w-full grid-cols-2 rounded-2xl border border-white/10 bg-black/30 p-1 text-white/52">
              <TabsTrigger value="bunker" className="rounded-xl data-[state=active]:bg-white/10 data-[state=active]:text-white data-[state=active]:shadow-none">
                Bunker
              </TabsTrigger>
              <TabsTrigger value="nsec" className="rounded-xl data-[state=active]:bg-white/10 data-[state=active]:text-white data-[state=active]:shadow-none">
                nsec
              </TabsTrigger>
            </TabsList>

            <TabsContent value="bunker" className="mt-4 space-y-3">
              <div className="space-y-2">
                <Input
                  value={bunkerUri}
                  onChange={(event) => {
                    setBunkerUri(event.target.value);
                    setError(null);
                  }}
                  placeholder="bunker://..."
                  autoComplete="off"
                  className="h-12 rounded-2xl border-white/10 bg-white/[0.055] font-mono text-sm text-white placeholder:text-white/28 focus-visible:ring-amber-300/40"
                />
                <p className="text-xs leading-5 text-white/42">
                  Best for daily use: approve signatures from a remote signer without pasting your secret key.
                </p>
              </div>
              <Button
                type="button"
                onClick={handleBunkerLogin}
                disabled={isLoading || !bunkerUri.trim()}
                className="h-11 w-full rounded-2xl bg-white text-sm font-black text-black hover:bg-amber-100"
              >
                {isLoading ? 'Connecting…' : 'Connect bunker'}
              </Button>
            </TabsContent>

            <TabsContent value="nsec" className="mt-4 space-y-3">
              <div className="space-y-2">
                <Input
                  type="password"
                  value={nsec}
                  onChange={(event) => {
                    setNsec(event.target.value);
                    setError(null);
                  }}
                  placeholder="nsec1..."
                  autoComplete="off"
                  className="h-12 rounded-2xl border-white/10 bg-white/[0.055] font-mono text-sm text-white placeholder:text-white/28 focus-visible:ring-amber-300/40"
                />
                <p className="text-xs leading-5 text-white/42">
                  Use only on a device you trust. The key is kept in this browser so the app can sign Nostr events.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={handleNsecLogin}
                  disabled={isLoading || !nsec.trim()}
                  className="h-11 flex-1 rounded-2xl bg-white text-sm font-black text-black hover:bg-amber-100"
                >
                  {isLoading ? 'Verifying…' : 'Unlock'}
                  {!isLoading && <Check className="ml-2 h-4 w-4" />}
                </Button>
                <label className={cn(
                  'inline-flex h-11 cursor-pointer items-center justify-center rounded-2xl border border-white/10 bg-white/[0.055] px-4 text-white/72 transition hover:bg-white/10',
                  isLoading && 'pointer-events-none opacity-50',
                )}>
                  <Upload className="h-4 w-4" />
                  <span className="sr-only">Upload nsec text file</span>
                  <input type="file" accept=".txt" className="hidden" onChange={(event) => handleFileUpload(event.target.files?.[0])} />
                </label>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
