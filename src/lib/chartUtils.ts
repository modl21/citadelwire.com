import { useQuery } from '@tanstack/react-query';

const CORS_PROXY = 'https://proxy.shakespeare.diy/?url=';
const HYPERLIQUID_INFO_URL = 'https://api.hyperliquid.xyz/info';

export const CHART_SPANS = [
  { label: '24H', days: 1 },
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '6M', days: 180 },
] as const;

export interface HyperliquidMarketConfig {
  coin: string;
  dex?: string;
}

export const MARKETS: Record<string, HyperliquidMarketConfig> = {
  BTC: { coin: 'BTC' },
  SP500: { coin: 'xyz:SP500', dex: 'xyz' },
  XAUT: { coin: 'xyz:GOLD', dex: 'xyz' },
  BRENTOIL: { coin: 'xyz:BRENTOIL', dex: 'xyz' },
};

const DAY_MS = 24 * 60 * 60 * 1000;

interface HyperliquidCandle {
  t: number;
  T: number;
  s: string;
  i: string;
  o: string;
  c: string;
  h: string;
  l: string;
  v: string;
  n: number;
}

interface HyperliquidPerpUniverseItem {
  name: string;
}

interface HyperliquidPerpAssetContext {
  funding?: string;
  openInterest?: string;
  prevDayPx?: string;
  dayNtlVlm?: string;
  premium?: string | null;
  oraclePx?: string;
  markPx?: string;
  midPx?: string | null;
  dayBaseVlm?: string;
}

interface HyperliquidPerpMeta {
  universe: HyperliquidPerpUniverseItem[];
}

type HyperliquidMetaAndAssetCtxs = [HyperliquidPerpMeta, HyperliquidPerpAssetContext[]];

async function postHyperliquidInfo<T>(body: Record<string, unknown>, timeoutMs = 8000): Promise<T> {
  const request = async (url: string) => fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  try {
    const direct = await request(HYPERLIQUID_INFO_URL);
    if (direct.ok) return direct.json();
  } catch {
    // Fall back to the configured proxy below.
  }

  const proxied = await request(`${CORS_PROXY}${encodeURIComponent(HYPERLIQUID_INFO_URL)}`);
  if (!proxied.ok) throw new Error(`Hyperliquid error: ${proxied.status}`);
  return proxied.json();
}

function getChartInterval(days: number): string {
  if (days <= 1) return '1h';
  if (days <= 7) return '4h';
  if (days <= 30) return '12h';
  return '1d';
}

export function useCoinChart(market: HyperliquidMarketConfig, days: number, enabled: boolean) {
  return useQuery<number[][]>({
    queryKey: ['coin-chart', market.coin, market.dex ?? '', days],
    queryFn: async () => {
      const endTime = Date.now();
      const startTime = endTime - days * DAY_MS;
      const candles = await postHyperliquidInfo<HyperliquidCandle[]>({
        type: 'candleSnapshot',
        req: {
          coin: market.coin,
          interval: getChartInterval(days),
          startTime,
          endTime,
        },
      });

      return candles
        .map((candle) => [candle.t, Number(candle.c)] as [number, number])
        .filter(([, close]) => Number.isFinite(close) && close > 0);
    },
    enabled,
    staleTime: 15 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
    refetchOnMount: false,
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

function parseNumber(value: string | undefined | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pctChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

async function fetchStatsForMarket(market: HyperliquidMarketConfig): Promise<CoinStats> {
  const [metaAndContexts, candles] = await Promise.all([
    postHyperliquidInfo<HyperliquidMetaAndAssetCtxs>({
      type: 'metaAndAssetCtxs',
      ...(market.dex !== undefined ? { dex: market.dex } : {}),
    }),
    postHyperliquidInfo<HyperliquidCandle[]>({
      type: 'candleSnapshot',
      req: {
        coin: market.coin,
        interval: '1h',
        startTime: Date.now() - DAY_MS,
        endTime: Date.now(),
      },
    }),
  ]);

  const [meta, contexts] = metaAndContexts;
  const marketIndex = meta.universe.findIndex((item) => item.name === market.coin);
  const context = marketIndex >= 0 ? contexts[marketIndex] : undefined;

  const currentPrice = parseNumber(context?.midPx) ?? parseNumber(context?.markPx) ?? parseNumber(context?.oraclePx);
  const prevDayPrice = parseNumber(context?.prevDayPx);
  const priceChangePct24h = pctChange(currentPrice, prevDayPrice);
  const priceChange24h = currentPrice !== null && prevDayPrice !== null ? currentPrice - prevDayPrice : null;

  const highs = candles.map((candle) => Number(candle.h)).filter((value) => Number.isFinite(value) && value > 0);
  const lows = candles.map((candle) => Number(candle.l)).filter((value) => Number.isFinite(value) && value > 0);

  return {
    marketCap: null,
    volume24h: parseNumber(context?.dayNtlVlm),
    high24h: highs.length > 0 ? Math.max(...highs) : null,
    low24h: lows.length > 0 ? Math.min(...lows) : null,
    ath: null,
    athDate: null,
    athChangePercent: null,
    circulatingSupply: null,
    totalSupply: null,
    maxSupply: null,
    priceChange24h,
    priceChangePct24h,
    priceChangePct7d: null,
    priceChangePct30d: null,
  };
}

export function useCoinStats(market: HyperliquidMarketConfig, enabled: boolean) {
  return useQuery<CoinStats>({
    queryKey: ['coin-stats', market.coin, market.dex ?? ''],
    queryFn: () => fetchStatsForMarket(market),
    enabled,
    staleTime: 15 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
    refetchOnMount: false,
  });
}
