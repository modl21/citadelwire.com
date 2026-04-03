import { useQuery } from '@tanstack/react-query';

const CORS_PROXY = 'https://proxy.shakespeare.diy/?url=';

export interface PolymarketEvent {
  id: string;
  slug: string;
  title: string;
  /** The top-level image for the event (may be empty). */
  image: string;
  /** Markets within this event. */
  markets: PolymarketMarket[];
}

export interface PolymarketMarket {
  id: string;
  question: string;
  /** JSON string of outcomes, e.g. '["Yes","No"]' */
  outcomes: string;
  /** JSON string of outcome prices, e.g. '[0.73,0.27]' */
  outcomePrices: string;
  /** 24h volume in USD cents (string). */
  volume24hr: number;
  /** Total liquidity. */
  liquidity: number;
  /** Active flag. */
  active: boolean;
  /** Closed flag. */
  closed: boolean;
  /** Image for the specific market (often same as event image). */
  image: string;
}

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
 * Polymarket Gamma API — fetch trending high-volume events.
 *
 * We query the /events endpoint sorted by 24hr volume descending.
 * The `tag` param filters by topic; "Politics" captures most geopolitics.
 * We then parse each event's first market for display.
 */
async function fetchPolymarkets(): Promise<ParsedMarket[]> {
  const url = new URL('https://gamma-api.polymarket.com/events');
  url.searchParams.set('limit', '8');
  url.searchParams.set('active', 'true');
  url.searchParams.set('closed', 'false');
  url.searchParams.set('order', 'volume24hr');
  url.searchParams.set('ascending', 'false');
  // Focus on geopolitics / politics-related markets
  url.searchParams.set('tag', 'Politics');

  const res = await fetch(`${CORS_PROXY}${encodeURIComponent(url.toString())}`);
  if (!res.ok) throw new Error(`Polymarket API error: ${res.status}`);

  const events: PolymarketEvent[] = await res.json();

  const parsed: ParsedMarket[] = [];

  for (const event of events) {
    if (!event.markets || event.markets.length === 0) continue;

    // Use the first (primary) market of the event
    const market = event.markets[0];
    if (market.closed || !market.active) continue;

    let outcomes: { name: string; price: number }[] = [];
    try {
      const names: string[] = JSON.parse(market.outcomes);
      const prices: string[] = JSON.parse(market.outcomePrices);
      outcomes = names.map((name, i) => ({
        name,
        price: parseFloat(prices[i]) || 0,
      }));
    } catch {
      continue;
    }

    // Skip markets with no meaningful volume
    if (market.volume24hr < 1000) continue;

    parsed.push({
      id: market.id,
      eventSlug: event.slug,
      question: event.title || market.question,
      image: event.image || market.image,
      outcomes,
      volume24hr: market.volume24hr,
      liquidity: market.liquidity,
    });
  }

  return parsed;
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
