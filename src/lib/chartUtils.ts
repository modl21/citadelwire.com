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
