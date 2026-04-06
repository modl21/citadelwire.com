import { useQuery } from '@tanstack/react-query';

const CORS_PROXY = 'https://proxy.shakespeare.diy/?url=';

export const CHART_SPANS = [
  { label: '24H', days: 1 },
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '6M', days: 180 },
] as const;

export function useCoinChart(coinId: string, days: number, enabled: boolean) {
  return useQuery<number[][]>({
    queryKey: ['coin-chart', coinId, days],
    queryFn: async () => {
      const url = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`;
      let res: Response;
      try {
        res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error('direct failed');
      } catch {
        res = await fetch(`${CORS_PROXY}${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(10000) });
      }
      if (!res.ok) throw new Error(`CoinGecko error: ${res.status}`);
      const data = await res.json();
      return data.prices as number[][];
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export interface PriceChange {
  first: number;
  last: number;
  change: number;
  pct: number;
  isUp: boolean;
}

export function getChange(prices: number[][]): PriceChange {
  const first = prices[0][1];
  const last = prices[prices.length - 1][1];
  const change = last - first;
  const pct = first !== 0 ? (change / first) * 100 : 0;
  return { first, last, change, pct, isUp: change >= 0 };
}

export function formatPricePrecise(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ── Coin Stats ───────────────────────────────────────────────

export interface CoinStats {
  marketCap: number | null;
  volume24h: number | null;
  high24h: number | null;
  low24h: number | null;
  ath: number | null;
  athDate: string | null;
  athChangePercent: number | null;
  circulatingSupply: number | null;
  totalSupply: number | null;
  maxSupply: number | null;
  priceChange24h: number | null;
  priceChangePct24h: number | null;
  priceChangePct7d: number | null;
  priceChangePct30d: number | null;
}

export function useCoinStats(coinId: string, enabled: boolean) {
  return useQuery<CoinStats>({
    queryKey: ['coin-stats', coinId],
    queryFn: async () => {
      const url = `https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false`;
      let res: Response;
      try {
        res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error('direct failed');
      } catch {
        res = await fetch(`${CORS_PROXY}${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(10000) });
      }
      if (!res.ok) throw new Error(`CoinGecko error: ${res.status}`);
      const data = await res.json();
      const md = data.market_data;
      return {
        marketCap: md?.market_cap?.usd ?? null,
        volume24h: md?.total_volume?.usd ?? null,
        high24h: md?.high_24h?.usd ?? null,
        low24h: md?.low_24h?.usd ?? null,
        ath: md?.ath?.usd ?? null,
        athDate: md?.ath_date?.usd ?? null,
        athChangePercent: md?.ath_change_percentage?.usd ?? null,
        circulatingSupply: md?.circulating_supply ?? null,
        totalSupply: md?.total_supply ?? null,
        maxSupply: md?.max_supply ?? null,
        priceChange24h: md?.price_change_24h ?? null,
        priceChangePct24h: md?.price_change_percentage_24h ?? null,
        priceChangePct7d: md?.price_change_percentage_7d ?? null,
        priceChangePct30d: md?.price_change_percentage_30d ?? null,
      };
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
