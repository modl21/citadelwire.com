import { useQuery } from '@tanstack/react-query';

const CORS_PROXY = 'https://proxy.shakespeare.diy/?url=';

interface MarketData {
  btcPrice: number | null;
  goldPrice: number | null;
  blockHeight: number | null;
}

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

async function fetchBtcPrice(): Promise<number | null> {
  try {
    const res = await fetchWithProxyFallback('https://mempool.space/api/v1/prices', 5000);
    if (!res.ok) throw new Error('Failed to fetch BTC price');
    const data = await res.json();
    return data.USD ?? null;
  } catch {
    return null;
  }
}

async function fetchGoldPrice(): Promise<number | null> {
  try {
    // GeckoTerminal API — reads XAUT price from Uniswap on-chain pools
    const res = await fetchWithProxyFallback(
      'https://api.geckoterminal.com/api/v2/networks/eth/tokens/0x68749665FF8D2d112Fa859AA293F07a622782F38',
      5000,
    );
    if (!res.ok) throw new Error('Failed to fetch gold price');
    const data = await res.json();
    const price = parseFloat(data?.data?.attributes?.price_usd);
    return isNaN(price) ? null : price;
  } catch {
    return null;
  }
}

async function fetchBlockHeight(): Promise<number | null> {
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

export function useMarketData() {
  return useQuery<MarketData>({
    queryKey: ['market-data'],
    queryFn: async () => {
      const [btcPrice, goldPrice, blockHeight] = await Promise.all([
        fetchBtcPrice(),
        fetchGoldPrice(),
        fetchBlockHeight(),
      ]);
      return { btcPrice, goldPrice, blockHeight };
    },
    staleTime: 60 * 1000, // 1 minute
    refetchInterval: 60 * 1000, // Auto-refresh every 60 seconds
    retry: 1,
    refetchOnMount: false,
  });
}
