import { useQuery } from '@tanstack/react-query';

const CORS_PROXY = 'https://proxy.shakespeare.diy/?url=';

interface MarketData {
  btcPrice: number | null;
  goldPrice: number | null;
  blockHeight: number | null;
}

async function fetchBtcPrice(): Promise<number | null> {
  try {
    const res = await fetch(`${CORS_PROXY}${encodeURIComponent('https://mempool.space/api/v1/prices')}`);
    if (!res.ok) throw new Error('Failed to fetch BTC price');
    const data = await res.json();
    return data.USD ?? null;
  } catch {
    return null;
  }
}

async function fetchGoldPrice(): Promise<number | null> {
  try {
    // CoinGecko free API for XAUT (Tether Gold) price
    const res = await fetch(
      `${CORS_PROXY}${encodeURIComponent('https://api.coingecko.com/api/v3/simple/price?ids=tether-gold&vs_currencies=usd')}`,
    );
    if (!res.ok) throw new Error('Failed to fetch gold price');
    const data = await res.json();
    return data['tether-gold']?.usd ?? null;
  } catch {
    return null;
  }
}

async function fetchBlockHeight(): Promise<number | null> {
  try {
    const res = await fetch(`${CORS_PROXY}${encodeURIComponent('https://mempool.space/api/blocks/tip/height')}`);
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
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // Auto-refresh every 60 seconds
    retry: 2,
  });
}
