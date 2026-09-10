import { useQuery } from '@tanstack/react-query';

const CORS_PROXY = 'https://proxy.shakespeare.diy/?url=';
const HYPERLIQUID_INFO_URL = 'https://api.hyperliquid.xyz/info';

export interface MarketData {
  btcPrice: number | null;
  goldPrice: number | null;
  blockHeight: number | null;
}

interface HyperliquidSpotToken {
  name: string;
  index: number;
}

interface HyperliquidSpotUniverseItem {
  name: string;
  index: number;
  tokens: number[];
}

interface HyperliquidSpotMeta {
  tokens: HyperliquidSpotToken[];
  universe: HyperliquidSpotUniverseItem[];
}

interface HyperliquidSpotAssetContext {
  coin: string;
  midPx?: string;
  markPx?: string;
}

type HyperliquidSpotMetaAndAssetCtxs = [HyperliquidSpotMeta, HyperliquidSpotAssetContext[]];

function withTimeout(ms: number): AbortSignal {
  return AbortSignal.timeout(ms);
}

async function fetchWithProxyFallback(url: string, timeoutMs: number): Promise<Response> {
  try {
    const direct = await fetch(url, { signal: withTimeout(timeoutMs) });
    if (direct.ok) return direct;
  } catch {
    // Fall back to the configured proxy below.
  }

  return fetch(`${CORS_PROXY}${encodeURIComponent(url)}`, { signal: withTimeout(timeoutMs) });
}

async function postHyperliquidInfoWithProxyFallback<T>(body: Record<string, unknown>, timeoutMs: number): Promise<T> {
  const request = async (url: string) => fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: withTimeout(timeoutMs),
  });

  try {
    const direct = await request(HYPERLIQUID_INFO_URL);
    if (direct.ok) return direct.json();
  } catch {
    // Fall back to the configured proxy below.
  }

  const proxied = await request(`${CORS_PROXY}${encodeURIComponent(HYPERLIQUID_INFO_URL)}`);
  if (!proxied.ok) throw new Error(`Hyperliquid info error: ${proxied.status}`);
  return proxied.json();
}

function parsePrice(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function findSpotPairIndex(meta: HyperliquidSpotMeta, tokenName: string): number | null {
  const token = meta.tokens.find((item) => item.name === tokenName);
  if (!token) return null;

  const pair = meta.universe.find((item) => item.tokens[0] === token.index && item.tokens[1] === 0);
  return pair?.index ?? null;
}

async function fetchHyperliquidPrices(): Promise<{ btcPrice: number | null; goldPrice: number | null }> {
  try {
    const data = await postHyperliquidInfoWithProxyFallback<HyperliquidSpotMetaAndAssetCtxs>(
      { type: 'spotMetaAndAssetCtxs' },
      5000,
    );
    const [meta, assetContexts] = data;

    // Hyperliquid spot mids are keyed as @{universe index}. The UI-facing BTC
    // market is UBTC/USDC, while XAUT0/USDC is the tokenized gold market.
    const btcPairIndex = findSpotPairIndex(meta, 'UBTC');
    const goldPairIndex = findSpotPairIndex(meta, 'XAUT0');

    const btcContext = btcPairIndex === null
      ? undefined
      : assetContexts.find((context) => context.coin === `@${btcPairIndex}`);
    const goldContext = goldPairIndex === null
      ? undefined
      : assetContexts.find((context) => context.coin === `@${goldPairIndex}`);

    return {
      btcPrice: parsePrice(btcContext?.midPx ?? btcContext?.markPx),
      goldPrice: parsePrice(goldContext?.midPx ?? goldContext?.markPx),
    };
  } catch {
    return { btcPrice: null, goldPrice: null };
  }
}

export async function fetchBlockHeight(): Promise<number | null> {
  try {
    const res = await fetchWithProxyFallback('https://mempool.space/api/blocks/tip/height', 5000);
    if (!res.ok) throw new Error('Failed to fetch block height');
    const text = await res.text();
    const height = parseInt(text, 10);
    return isNaN(height) ? null : height;
  } catch {
    return null;
  }
}

export function useMarketData(enabled = true) {
  return useQuery<MarketData>({
    queryKey: ['market-data'],
    queryFn: async () => {
      const [{ btcPrice, goldPrice }, blockHeight] = await Promise.all([
        fetchHyperliquidPrices(),
        fetchBlockHeight(),
      ]);
      return { btcPrice, goldPrice, blockHeight };
    },
    enabled,
    staleTime: 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchInterval: enabled ? 60 * 1000 : false,
    retry: 1,
    refetchOnMount: false,
    refetchIntervalInBackground: false,
  });
}
