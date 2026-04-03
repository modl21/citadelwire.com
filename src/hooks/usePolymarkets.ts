import { useQuery } from '@tanstack/react-query';

const CORS_PROXY = 'https://proxy.shakespeare.diy/?url=';

export interface ParsedMarket {
  id: string;
  eventSlug: string;
  question: string;
  /** Leading outcome name (e.g. "Yes", "Trump", "China") */
  leadName: string;
  /** Leading outcome probability 0–1 */
  leadPrice: number;
  /** Whether this is a simple Yes/No market vs multi-choice */
  isMultiChoice: boolean;
  /** Aggregate 24h volume across all markets in the event */
  volume24hr: number;
}

// Geopolitics keyword filter — applied to event title to ensure relevance
const GEO_KEYWORDS = [
  'war', 'ceasefire', 'peace', 'nato', 'sanction', 'tariff', 'trade',
  'invasion', 'annex', 'treaty', 'nuclear', 'missile', 'military',
  'ukraine', 'russia', 'china', 'taiwan', 'iran', 'israel', 'gaza',
  'palestine', 'korea', 'syria', 'iraq', 'afghanistan', 'india',
  'pakistan', 'eu ', 'european union', 'un ', 'united nations',
  'diplomat', 'geopolitic', 'conflict', 'border', 'territorial',
  'embargo', 'coup', 'regime', 'election', 'president', 'prime minister',
  'congress', 'senate', 'government', 'federal', 'policy', 'executive order',
  'trump', 'biden', 'zelensky', 'putin', 'xi jinping', 'modi',
  'summit', 'g7', 'g20', 'brics', 'opec', 'imf', 'world bank',
  'refugee', 'migration', 'asylum', 'deport', 'immigration',
  'recession', 'inflation', 'debt ceiling', 'default', 'treasury',
  'fed ', 'federal reserve', 'interest rate', 'gdp',
  'assassination', 'terror', 'attack', 'threat',
];

function isGeopolitics(title: string): boolean {
  const lower = title.toLowerCase();
  return GEO_KEYWORDS.some((kw) => lower.includes(kw));
}

function parseOutcome(raw: string | string[]): string[] {
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw); } catch { return []; }
}

function parsePrices(raw: string | (string | number)[]): number[] {
  const arr = Array.isArray(raw) ? raw : (() => { try { return JSON.parse(raw); } catch { return []; } })();
  return arr.map((v: string | number) => typeof v === 'number' ? v : parseFloat(v) || 0);
}

function parseVolume(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseFloat(v) || 0;
  return 0;
}

/**
 * Extract the option label from a multi-choice market's question.
 * Polymarket multi-choice markets have questions like "Will X win the election?"
 * or sometimes the groupItemTitle is just the option name.
 */
function extractOptionName(market: Record<string, unknown>): string {
  // groupItemTitle is the cleanest source for multi-choice option names
  if (typeof market.groupItemTitle === 'string' && market.groupItemTitle.trim()) {
    return market.groupItemTitle.trim();
  }
  // Fall back to the market question, stripped of common prefixes
  const q = typeof market.question === 'string' ? market.question.trim() : '';
  return q
    .replace(/^Will\s+/i, '')
    .replace(/\s+win.*$/i, '')
    .replace(/\?$/, '')
    .trim() || 'Yes';
}

async function fetchFromGammaAPI(useProxy: boolean): Promise<ParsedMarket[]> {
  const url = new URL('https://gamma-api.polymarket.com/events');
  url.searchParams.set('limit', '30');
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
  if (!Array.isArray(events)) throw new Error('Unexpected API response format');

  const parsed: ParsedMarket[] = [];

  for (const event of events) {
    if (!event.markets || !Array.isArray(event.markets) || event.markets.length === 0) continue;

    const title: string = event.title || '';

    // Filter to geopolitics-relevant events
    if (!isGeopolitics(title)) continue;

    const activeMarkets = event.markets.filter(
      (m: Record<string, unknown>) => m.active && !m.closed,
    );
    if (activeMarkets.length === 0) continue;

    const isMultiChoice = activeMarkets.length > 1;

    // Aggregate 24h volume across all markets in the event
    let totalVolume = 0;
    for (const m of activeMarkets) {
      totalVolume += parseVolume(m.volume24hr);
    }

    if (totalVolume < 1000) continue;

    let leadName = '';
    let leadPrice = 0;

    if (isMultiChoice) {
      // Multi-choice: scan all markets, find the one with the highest "Yes" price
      for (const m of activeMarkets) {
        const names = parseOutcome(m.outcomes);
        const prices = parsePrices(m.outcomePrices);
        const yesIdx = names.indexOf('Yes');
        const yesPrice = yesIdx >= 0 ? prices[yesIdx] : (prices[0] ?? 0);

        if (yesPrice > leadPrice) {
          leadPrice = yesPrice;
          leadName = extractOptionName(m);
        }
      }
    } else {
      // Binary Yes/No market
      const market = activeMarkets[0];
      const names = parseOutcome(market.outcomes);
      const prices = parsePrices(market.outcomePrices);
      const yesIdx = names.indexOf('Yes');
      const noIdx = names.indexOf('No');
      const yesPrice = yesIdx >= 0 ? prices[yesIdx] : 0;
      const noPrice = noIdx >= 0 ? prices[noIdx] : 0;

      if (yesPrice >= noPrice) {
        leadName = 'Yes';
        leadPrice = yesPrice;
      } else {
        leadName = 'No';
        leadPrice = noPrice;
      }
    }

    // Skip resolved/settled markets showing 100% (or rounding to it)
    if (Math.round(leadPrice * 100) >= 100) continue;

    parsed.push({
      id: event.id ?? activeMarkets[0].id ?? String(parsed.length),
      eventSlug: event.slug ?? event.id ?? '',
      question: title || activeMarkets[0].question || 'Untitled Market',
      leadName,
      leadPrice,
      isMultiChoice,
      volume24hr: totalVolume,
    });
  }

  // Sort by volume descending
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
  return await fetchFromGammaAPI(true);
}

export function usePolymarkets() {
  return useQuery<ParsedMarket[]>({
    queryKey: ['polymarkets'],
    queryFn: fetchPolymarkets,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    retry: 2,
  });
}
