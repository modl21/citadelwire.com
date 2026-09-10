import { useQuery } from '@tanstack/react-query';

const CORS_PROXY = 'https://proxy.shakespeare.diy/?url=';
const HYPERLIQUID_INFO_URL = 'https://api.hyperliquid.xyz/info';

export interface MarketData {
  btcPrice: number | null;
  goldPrice: number | null;
  sp500Price: number | null;
  brentOilPrice: number | null;
  us10yPrice: number | null;
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

interface HyperliquidPerpUniverseItem {
  name: string;
}

interface HyperliquidPerpAssetContext {
  midPx?: string | null;
  markPx?: string;
  oraclePx?: string;
}

interface HyperliquidPerpMeta {
  universe: HyperliquidPerpUniverseItem[];
}

type HyperliquidSpotMetaAndAssetCtxs = [HyperliquidSpotMeta, HyperliquidSpotAssetContext[]];
type HyperliquidMetaAndAssetCtxs = [HyperliquidPerpMeta, HyperliquidPerpAssetContext[]];

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

async function fetchHyperliquidPrices(): Promise<Pick<MarketData, 'btcPrice' | 'goldPrice' | 'sp500Price' | 'brentOilPrice' | 'us10yPrice'>> {
  try {
    const [spotData, xyzPerpData, paraPerpData] = await Promise.all([
      postHyperliquidInfoWithProxyFallback<HyperliquidSpotMetaAndAssetCtxs>(
        { type: 'spotMetaAndAssetCtxs' },
        5000,
      ),
      postHyperliquidInfoWithProxyFallback<HyperliquidMetaAndAssetCtxs>(
        { type: 'metaAndAssetCtxs', dex: 'xyz' },
        5000,
      ),
      postHyperliquidInfoWithProxyFallback<HyperliquidMetaAndAssetCtxs>(
        { type: 'metaAndAssetCtxs', dex: 'para' },
        5000,
      ),
    ]);
    const [spotMeta, spotContexts] = spotData;
    const [xyzPerpMeta, xyzPerpContexts] = xyzPerpData;
    const [paraPerpMeta, paraPerpContexts] = paraPerpData;

    // Hyperliquid spot mids are keyed as @{universe index}. The UI-facing BTC
    // market is UBTC/USDC, while XAUT0/USDC is the tokenized gold market.
    const btcPairIndex = findSpotPairIndex(spotMeta, 'UBTC');
    const goldPairIndex = findSpotPairIndex(spotMeta, 'XAUT0');

    const btcContext = btcPairIndex === null
      ? undefined
      : spotContexts.find((context) => context.coin === `@${btcPairIndex}`);
    const goldContext = goldPairIndex === null
      ? undefined
      : spotContexts.find((context) => context.coin === `@${goldPairIndex}`);

    const sp500Index = xyzPerpMeta.universe.findIndex((item) => item.name === 'xyz:SP500');
    const brentOilIndex = xyzPerpMeta.universe.findIndex((item) => item.name === 'xyz:BRENTOIL');
    const us10yIndex = paraPerpMeta.universe.findIndex((item) => item.name === 'para:10Y');
    const sp500Context = sp500Index >= 0 ? xyzPerpContexts[sp500Index] : undefined;
    const brentOilContext = brentOilIndex >= 0 ? xyzPerpContexts[brentOilIndex] : undefined;
    const us10yContext = us10yIndex >= 0 ? paraPerpContexts[us10yIndex] : undefined;

    return {
      btcPrice: parsePrice(btcContext?.midPx ?? btcContext?.markPx),
      goldPrice: parsePrice(goldContext?.midPx ?? goldContext?.markPx),
      sp500Price: parsePrice(sp500Context?.midPx ?? sp500Context?.markPx ?? sp500Context?.oraclePx),
      brentOilPrice: parsePrice(brentOilContext?.midPx ?? brentOilContext?.markPx ?? brentOilContext?.oraclePx),
      us10yPrice: parsePrice(us10yContext?.midPx ?? us10yContext?.markPx ?? us10yContext?.oraclePx),
    };
  } catch {
    return { btcPrice: null, goldPrice: null, sp500Price: null, brentOilPrice: null, us10yPrice: null };
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
      const [{ btcPrice, goldPrice, sp500Price, brentOilPrice, us10yPrice }, blockHeight] = await Promise.all([
        fetchHyperliquidPrices(),
        fetchBlockHeight(),
      ]);
      return { btcPrice, goldPrice, sp500Price, brentOilPrice, us10yPrice, blockHeight };
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
