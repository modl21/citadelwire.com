import WebSocket from 'ws';
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Polyfill WebSocket for Node
globalThis.WebSocket = WebSocket;

const __dirname = dirname(fileURLToPath(import.meta.url));

const CITADEL_PUBKEY = '01d077c7b21bfee89a6883edabcd408ef324e9ab431f46bf57d5860430bcb97c';
const RELAYS = [
  'wss://relay.primal.net',
  'wss://relay.damus.io',
];

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toRFC822(ts) {
  return new Date(ts * 1000).toUTCString();
}

// Minimal nevent encoder (bech32)
function neventEncode(eventId, pubkey) {
  // We'll just use note ID hex for the link since we don't have nostr-tools in this script
  return eventId;
}

function queryRelay(url, filter) {
  return new Promise((resolvePromise, reject) => {
    const events = [];
    const subId = 'feed-' + Math.random().toString(36).slice(2, 8);
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { ws.close(); } catch {}
        resolvePromise(events);
      }
    }, 10000);

    const ws = new WebSocket(url);

    ws.on('open', () => {
      ws.send(JSON.stringify(['REQ', subId, filter]));
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg[0] === 'EVENT' && msg[1] === subId) {
          events.push(msg[2]);
        } else if (msg[0] === 'EOSE' && msg[1] === subId) {
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            try { ws.close(); } catch {}
            resolvePromise(events);
          }
        }
      } catch {}
    });

    ws.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        console.warn(`Relay ${url} error:`, err.message);
        resolvePromise(events);
      }
    });

    ws.on('close', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolvePromise(events);
      }
    });
  });
}

async function fetchPosts() {
  const filter = {
    kinds: [1],
    authors: [CITADEL_PUBKEY],
    limit: 50,
  };

  const results = await Promise.all(
    RELAYS.map((url) => queryRelay(url, filter).catch(() => []))
  );

  // Deduplicate by event ID
  const seen = new Set();
  const all = [];
  for (const events of results) {
    for (const event of events) {
      if (!seen.has(event.id)) {
        seen.add(event.id);
        all.push(event);
      }
    }
  }

  // Sort newest first
  return all.sort((a, b) => b.created_at - a.created_at);
}

function buildRSS(posts) {
  const items = posts.map((event) => {
    const link = `https://primal.net/e/${event.id}`;
    const firstLine = event.content.split('\n')[0].slice(0, 100) || 'Note';
    const title = escapeXml(firstLine);
    const description = escapeXml(event.content);

    return `    <item>
      <title>${title}</title>
      <link>${link}</link>
      <guid isPermaLink="false">${event.id}</guid>
      <pubDate>${toRFC822(event.created_at)}</pubDate>
      <description>${description}</description>
    </item>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>CITADEL WIRE</title>
    <link>https://citadelwire.com</link>
    <description>high signal news</description>
    <language>en</language>
    <lastBuildDate>${posts.length > 0 ? toRFC822(posts[0].created_at) : new Date().toUTCString()}</lastBuildDate>
    <atom:link href="https://citadelwire.com/feed.xml" rel="self" type="application/rss+xml"/>
    <image>
      <url>https://blossom.primal.net/7e50fc1128859dfdc43d504e2cafec4a1e1e5067b5c6245232a11ee75fdc84d7.jpg</url>
      <title>CITADEL WIRE</title>
      <link>https://citadelwire.com</link>
    </image>
${items}
  </channel>
</rss>`;
}

async function main() {
  console.log('Fetching posts from Nostr relays...');
  const posts = await fetchPosts();
  console.log(`Fetched ${posts.length} posts`);

  const xml = buildRSS(posts);
  const outPath = resolve(__dirname, '..', 'public', 'feed.xml');
  writeFileSync(outPath, xml, 'utf-8');
  console.log(`RSS feed written to ${outPath}`);
}

main().catch((err) => {
  console.error('Failed to generate feed:', err);
  process.exit(1);
});
