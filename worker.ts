const CITADEL_PUBKEY = '01d077c7b21bfee89a6883edabcd408ef324e9ab431f46bf57d5860430bcb97c';

const ZAP_KIND = 9735;
const RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://relay.ditto.pub',
  'wss://purplepag.es',
  'wss://relay.nostr.band',
  'wss://nostr-pub.wellorder.net',
  'wss://relay.nostr.bg',
  'wss://antiprimal.net'
] as const;
const CACHE_TTL = 300; // 5 minutes
const MAX_EVENTS = 2000;

interface Supporter {
  pubkey: string;
  totalSats: number;
}

const EXCLUDED_PUBKEYS = new Set([
  'a341f45ff9758f570a21b000c17d4e53a3a497c8397f26c0e6d61e5acffc7a98', // Michael Saylor
  CITADEL_PUBKEY,
]);

async function queryRelay(relay: string, filter: any): Promise<any[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const ws = new WebSocket(relay);
    const events: any[] = [];
    const subId = `sub-${Math.random().toString(36).slice(2)}`;

    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => {
        ws.send(JSON.stringify(['REQ', subId, filter]));
      };

      ws.onmessage = (event) => {
        const [, type, id, data] = JSON.parse(event.data);
        if (type === 'EVENT' && id === subId) {
          events.push(data);
        } else if (type === 'EOSE' && id === subId) {
          ws.close();
          resolve();
        }
      };

      ws.onerror = reject;
      ws.onclose = () => {
        clearTimeout(timeout);
        resolve();
      };
    });

    return events;
  } catch {
    return [];
  }
}

async function getAllZaps(): Promise<any[]> {
  const filter = {
    kinds: [ZAP_KIND],
    '#p': [CITADEL_PUBKEY],
    limit: MAX_EVENTS,
  };

  const allEvents = await Promise.all(
    RELAYS.map(relay => queryRelay(relay, filter))
  );

  // Dedup by ID
  const seen = new Set();
  const unique = allEvents.flat().filter(event => {
    if (seen.has(event.id)) return false;
    seen.add(event.id);
    return true;
  });

  return unique;
}

function getZapSender(event: any): string | null {
  const pTag = event.tags.find((t: string[]) => t[0] === 'P')?.[1];
  if (pTag && /^[0-9a-f]{64}$/.test(pTag)) return pTag;

  const description = event.tags.find((t: string[]) => t[0] === 'description')?.[1];
  if (description) {
    try {
      const zapReq = JSON.parse(description);
      const pubkey = zapReq.pubkey;
      if (pubkey && /^[0-9a-f]{64}$/.test(pubkey)) return pubkey;
    } catch {}
  }

  return null;
}

function getZapAmount(event: any): number | null {
  const amountTag = event.tags.find((t: string[]) => t[0] === 'amount')?.[1];
  if (amountTag) {
    const msats = Number.parseInt(amountTag, 10);
    if (Number.isSafeInteger(msats) && msats > 0) return Math.floor(msats / 1000);
  }

  const bolt11 = event.tags.find((t: string[]) => t[0] === 'bolt11')?.[1];
  if (bolt11) {
    const match = bolt11.match(/^lnbc(\d+)([munp]?)/i);
    if (match) {
      let sats = Number.parseInt(match[1], 10);
      const unit = match[2].toLowerCase();
      switch (unit) {
        case 'm': sats *= 100000; break;
        case 'u': sats *= 100; break;
        case 'n': sats = Math.floor(sats / 10); break;
        case 'p': sats = Math.floor(sats / 10000); break;
      }
      if (Number.isSafeInteger(sats) && sats > 0) return sats;
    }
  }

  return null;
}

function aggregateSupporters(events: any[]): Supporter[] {
  const map = new Map<string, Supporter>();

  for (const event of events) {
    const sender = getZapSender(event);
    if (!sender || EXCLUDED_PUBKEYS.has(sender)) continue;

    const sats = getZapAmount(event);
    if (!sats || sats <= 0) continue;

    const existing = map.get(sender);
    if (existing) {
      existing.totalSats += sats;
    } else {
      map.set(sender, { pubkey: sender, totalSats: sats });
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.totalSats - a.totalSats)
    .slice(0, 10);
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/top-supporters') {
      const cacheKey = 'top-supporters-v2';
      let cached = await env.SUPPORTERS_CACHE.get(cacheKey, { type: 'json' });

      if (cached && Date.now() - cached.timestamp < CACHE_TTL * 1000) {
        return Response.json(cached.supporters);
      }

      const events = await getAllZaps();
      const supporters = aggregateSupporters(events);

      const result = {
        timestamp: Date.now(),
        supporters,
      };

      await env.SUPPORTERS_CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: CACHE_TTL });

      return Response.json(supporters);
    }

    return new Response('Not Found', { status: 404 });
    },
};
