import { useQuery } from '@tanstack/react-query';

const CORS_PROXY = 'https://proxy.shakespeare.diy/?url=';

export interface ParsedMarket {
  id: string;
  eventSlug: string;
  question: string;
  image: string;
  outcomes: { name: string; price: number }[];
  volume24hr: number;
  liquidity: number;
}

/**
 * Polymarket Gamma API — fetch trending high-volume political events.
 *
 * Tries multiple approaches for resilience:
 * 1. Direct fetch (gamma API may support CORS)
 * 2. Via CORS proxy as fallback
 */
async function fetchFromGammaAPI(useProxy: boolean): Promise<ParsedMarket[]> {
  const url = new URL('https://gamma-api.polymarket.com/events');
  url.searchParams.set('limit', '10');
  url.searchParams.set('active', 'true');
  url.searchParams.set('closed', 'false');
  url.searchParams.set('order', 'volume24hr');
  url.searchParams.set('ascending', 'false');
  url.searchParams.set('tag', 'Politics');

  const fetchUrl = useProxy
    ? `${CORS_PROXY}${encodeURIComponent(url.toString())}`
    : url.toString();

  const res = await fetch(fetchUrl, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) throw new Error(`Polymarket API error: ${res.status}`);

  const events = await res.json();

  if (!Array.isArray(events)) {
    throw new Error('Unexpected API response format');
  }

  const parsed: ParsedMarket[] = [];

  for (const event of events) {
    if (!event.markets || !Array.isArray(event.markets) || event.markets.length === 0) continue;

    // Use the first (primary) market of the event
    const market = event.markets[0];
    if (market.closed || !market.active) continue;

    let outcomes: { name: string; price: number }[] = [];
    try {
      const names: string[] = typeof market.outcomes === 'string'
        ? JSON.parse(market.outcomes)
        : market.outcomes;
      const prices: (string | number)[] = typeof market.outcomePrices === 'string'
        ? JSON.parse(market.outcomePrices)
        : market.outcomePrices;
      outcomes = names.map((name: string, i: number) => ({
        name,
        price: typeof prices[i] === 'number' ? prices[i] as number : parseFloat(prices[i] as string) || 0,
      }));
    } catch {
      continue;
    }

    const vol = typeof market.volume24hr === 'string'
      ? parseFloat(market.volume24hr)
      : (market.volume24hr ?? 0);

    parsed.push({
      id: market.id ?? event.id ?? String(parsed.length),
      eventSlug: event.slug ?? event.id ?? '',
      question: event.title || market.question || 'Untitled Market',
      image: event.image || market.image || '',
      outcomes,
      volume24hr: vol,
      liquidity: typeof market.liquidity === 'string'
        ? parseFloat(market.liquidity)
        : (market.liquidity ?? 0),
    });
  }

  // Sort by volume descending (in case API doesn't)
  parsed.sort((a, b) => b.volume24hr - a.volume24hr);

  return parsed;
}

async function fetchPolymarkets(): Promise<ParsedMarket[]> {
  // Try direct fetch first (gamma API may allow CORS)
  try {
    const result = await fetchFromGammaAPI(false);
    if (result.length > 0) return result;
  } catch {
    // Direct fetch failed, try via proxy
  }

  // Fallback: via CORS proxy
  const result = await fetchFromGammaAPI(true);
  return result;
}

export function usePolymarkets() {
  return useQuery<ParsedMarket[]>({
    queryKey: ['polymarkets'],
    queryFn: fetchPolymarkets,
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchInterval: 5 * 60 * 1000, // Auto-refresh every 5 minutes
    retry: 2,
  });
}
