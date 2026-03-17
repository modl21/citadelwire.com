import WebSocket from 'ws';
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { nip19 } from 'nostr-tools';

// Polyfill WebSocket for Node
globalThis.WebSocket = WebSocket;

const __dirname = dirname(fileURLToPath(import.meta.url));

const CITADEL_PUBKEY = '01d077c7b21bfee89a6883edabcd408ef324e9ab431f46bf57d5860430bcb97c';
const SITE_URL = 'https://citadelwire.com';
const RELAYS = [
  'wss://relay.primal.net',
  'wss://relay.damus.io',
];
const NOTE_CONTENT_REGEX = /(https?:\/\/[^\s]+)|nostr:(npub1|note1|nprofile1|nevent1)([023456789acdefghjklmnpqrstuvwxyz]+)|(#\w+)/g;

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeCdata(str) {
  return str.replace(/]]>/g, ']]]]><![CDATA[>');
}

function formatTextFragment(text) {
  return escapeHtml(text).replace(/\n/g, '<br />');
}

function renderNoteContentHtml(content) {
  const parts = [];
  let lastIndex = 0;
  let match;

  NOTE_CONTENT_REGEX.lastIndex = 0;

  while ((match = NOTE_CONTENT_REGEX.exec(content)) !== null) {
    const [fullMatch, url, nostrPrefix, nostrData, hashtag] = match;
    const index = match.index;

    if (index > lastIndex) {
      parts.push(formatTextFragment(content.slice(lastIndex, index)));
    }

    if (url) {
      const escapedUrl = escapeHtml(url);
      parts.push(`<a href="${escapedUrl}">${escapedUrl}</a>`);
    } else if (nostrPrefix && nostrData) {
      const nostrId = `${nostrPrefix}${nostrData}`;
      const href = `${SITE_URL}/${nostrId}`;
      parts.push(`<a href="${escapeHtml(href)}">${escapeHtml(fullMatch)}</a>`);
    } else if (hashtag) {
      const tag = hashtag.slice(1);
      const href = `${SITE_URL}/t/${encodeURIComponent(tag)}`;
      parts.push(`<a href="${escapeHtml(href)}">${escapeHtml(hashtag)}</a>`);
    }

    lastIndex = index + fullMatch.length;
  }

  if (lastIndex < content.length) {
    parts.push(formatTextFragment(content.slice(lastIndex)));
  }

  if (parts.length === 0) {
    parts.push(formatTextFragment(content));
  }

  return `<div>${parts.join('')}</div>`;
}

function toRFC822(ts) {
  return new Date(ts * 1000).toUTCString();
}

function queryRelay(url, filter) {
  return new Promise((resolvePromise) => {
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

  return all.sort((a, b) => b.created_at - a.created_at);
}

function buildRSS(posts) {
  const items = posts.map((event) => {
    const nevent = nip19.neventEncode({ id: event.id, author: event.pubkey });
    const link = `https://primal.net/e/${nevent}`;
    const firstLine = event.content.split('\n')[0].slice(0, 100) || 'Note';
    const title = escapeXml(firstLine);
    const formattedContent = renderNoteContentHtml(event.content);
    const cdataContent = escapeCdata(formattedContent);

    return `    <item>
      <title>${title}</title>
      <link>${link}</link>
      <guid isPermaLink="false">${event.id}</guid>
      <pubDate>${toRFC822(event.created_at)}</pubDate>
      <description><![CDATA[${cdataContent}]]></description>
      <content:encoded><![CDATA[${cdataContent}]]></content:encoded>
    </item>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>CITADEL WIRE</title>
    <link>${SITE_URL}</link>
    <description>high signal news</description>
    <language>en</language>
    <lastBuildDate>${posts.length > 0 ? toRFC822(posts[0].created_at) : new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml"/>
    <image>
      <url>https://blossom.primal.net/7e50fc1128859dfdc43d504e2cafec4a1e1e5067b5c6245232a11ee75fdc84d7.jpg</url>
      <title>CITADEL WIRE</title>
      <link>${SITE_URL}</link>
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
