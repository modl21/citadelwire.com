import WebSocket from 'ws';
import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync, rmSync } from 'fs';
import { resolve, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import { nip19 } from 'nostr-tools';

// Polyfill WebSocket for Node
globalThis.WebSocket = WebSocket;

const __dirname = dirname(fileURLToPath(import.meta.url));

const CITADEL_PUBKEY = '01d077c7b21bfee89a6883edabcd408ef324e9ab431f46bf57d5860430bcb97c';
const SITE_URL = 'https://citadelwire.com';
const OG_IMAGE = 'https://blossom.primal.net/7e50fc1128859dfdc43d504e2cafec4a1e1e5067b5c6245232a11ee75fdc84d7.jpg';
const RELAYS = [
  'wss://premium.primal.net',
  'wss://relay.primal.net',
  'wss://relay.ditto.pub',
  'wss://relay.damus.io',
  'wss://antiprimal.net',
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

function escapeAttribute(str) {
  return escapeHtml(str).replace(/'/g, '&#39;');
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

function padUtcPart(value) {
  return value.toString().padStart(2, '0');
}

function getPostUtcSlug(event) {
  const date = new Date(event.created_at * 1000);
  return `${date.getUTCFullYear()}-${padUtcPart(date.getUTCMonth() + 1)}-${padUtcPart(date.getUTCDate())}-${padUtcPart(date.getUTCHours())}${padUtcPart(date.getUTCMinutes())}${padUtcPart(date.getUTCSeconds())}`;
}

function getPostUrl(event) {
  return `${SITE_URL}/posts/${getPostUtcSlug(event)}`;
}

function getPostCanonicalPath(event) {
  return `/posts/${getPostUtcSlug(event)}`;
}

function getPostTitle(event) {
  const firstLine = event.content
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) return 'CITADEL WIRE post';
  return firstLine.length > 92 ? `${firstLine.slice(0, 89)}…` : firstLine;
}

function getPostDescription(event) {
  const normalized = event.content.replace(/\s+/g, ' ').trim();
  if (!normalized) return 'CITADEL WIRE post with Nostr discussion, likes, reposts, and zaps.';
  return normalized.length > 220 ? `${normalized.slice(0, 217)}…` : normalized;
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

function parsePostsFromExistingFeed() {
  const feedPath = resolve(__dirname, '..', 'public', 'feed.xml');
  if (!existsSync(feedPath)) return [];

  const feed = readFileSync(feedPath, 'utf-8');
  return [...feed.matchAll(/<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<link>https:\/\/citadelwire\.com\/posts\/([^<]+)<\/link>[\s\S]*?<guid[^>]*>([^<]+)<\/guid>[\s\S]*?<pubDate>([^<]+)<\/pubDate>[\s\S]*?<description><!\[CDATA\[<div>([\s\S]*?)<\/div>\]\]><\/description>[\s\S]*?<\/item>/g)]
    .map((match) => {
      const [, title, slug, id, pubDate, htmlDescription] = match;
      const content = htmlDescription
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<a\s+href="[^"]*">([\s\S]*?)<\/a>/gi, '$1')
        .replace(/<[^>]*>/g, '')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      const createdAt = Math.floor(new Date(pubDate).getTime() / 1000);

      return {
        id,
        pubkey: CITADEL_PUBKEY,
        created_at: Number.isFinite(createdAt) ? createdAt : 0,
        kind: 1,
        tags: [['client', 'citadelwire-feed-cache'], ['d', slug], ['title', title]],
        content,
      };
    })
    .filter((event) => event.id && event.created_at > 0 && event.content);
}

async function fetchPosts() {
  const filter = {
    kinds: [1],
    authors: [CITADEL_PUBKEY],
    limit: 100,
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

  const sorted = all.sort((a, b) => b.created_at - a.created_at);
  return sorted.length > 0 ? sorted : parsePostsFromExistingFeed();
}

function buildRSS(posts) {
  const items = posts.map((event) => {
    const link = getPostUrl(event);
    const title = escapeXml(getPostTitle(event));
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
      <url>${OG_IMAGE}</url>
      <title>CITADEL WIRE</title>
      <link>${SITE_URL}</link>
    </image>
${items}
  </channel>
</rss>`;
}

function replaceOrInsertHeadTag(html, pattern, replacement) {
  return pattern.test(html)
    ? html.replace(pattern, replacement)
    : html.replace('</head>', `    ${replacement}\n  </head>`);
}

function applyPostMeta(appHtml, { title, description, url }) {
  const escapedTitle = escapeAttribute(title);
  const escapedDescription = escapeAttribute(description);
  const escapedUrl = escapeAttribute(url);
  const escapedImage = escapeAttribute(OG_IMAGE);

  const htmlWithTitle = replaceOrInsertHeadTag(appHtml, /<title>.*?<\/title>/s, `<title>${escapedTitle}</title>`);
  const metaReplacements = [
    [/<meta name="description" content="[^"]*"\s*\/?>(?![\s\S]*<meta name="description")/, `<meta name="description" content="${escapedDescription}" />`],
    [/<meta property="og:title" content="[^"]*"\s*\/?>(?![\s\S]*<meta property="og:title")/, `<meta property="og:title" content="${escapedTitle}" />`],
    [/<meta property="og:description" content="[^"]*"\s*\/?>(?![\s\S]*<meta property="og:description")/, `<meta property="og:description" content="${escapedDescription}" />`],
    [/<meta property="og:image" content="[^"]*"\s*\/?>(?![\s\S]*<meta property="og:image")/, `<meta property="og:image" content="${escapedImage}" />`],
    [/<meta property="og:type" content="[^"]*"\s*\/?>(?![\s\S]*<meta property="og:type")/, '<meta property="og:type" content="article" />'],
    [/<meta property="og:url" content="[^"]*"\s*\/?>(?![\s\S]*<meta property="og:url")/, `<meta property="og:url" content="${escapedUrl}" />`],
    [/<meta name="twitter:card" content="[^"]*"\s*\/?>(?![\s\S]*<meta name="twitter:card")/, '<meta name="twitter:card" content="summary_large_image" />'],
    [/<meta name="twitter:title" content="[^"]*"\s*\/?>(?![\s\S]*<meta name="twitter:title")/, `<meta name="twitter:title" content="${escapedTitle}" />`],
    [/<meta name="twitter:description" content="[^"]*"\s*\/?>(?![\s\S]*<meta name="twitter:description")/, `<meta name="twitter:description" content="${escapedDescription}" />`],
    [/<meta name="twitter:image" content="[^"]*"\s*\/?>(?![\s\S]*<meta name="twitter:image")/, `<meta name="twitter:image" content="${escapedImage}" />`],
  ];

  return metaReplacements.reduce(
    (html, [pattern, replacement]) => replaceOrInsertHeadTag(html, pattern, replacement),
    htmlWithTitle,
  );
}

function getMetaContent(html, pattern) {
  return pattern.exec(html)?.[1];
}

function withCanonicalLink(html, canonicalPath) {
  const canonicalScript = `<script>window.__CITADEL_CANONICAL_PATH__=${JSON.stringify(canonicalPath)};<\/script>`;
  if (html.includes('__CITADEL_CANONICAL_PATH__')) return html;
  if (html.includes('<div id="root"></div>')) {
    return html.replace('<div id="root"></div>', `<div id="root"></div>\n    ${canonicalScript}`);
  }
  return html.replace('</head>', `    ${canonicalScript}\n  </head>`);
}

function buildPostHtml(event, appHtml) {
  return withCanonicalLink(applyPostMeta(appHtml, {
    title: `${getPostTitle(event)} · CITADEL WIRE`,
    description: getPostDescription(event),
    url: getPostUrl(event),
  }), getPostCanonicalPath(event));
}

function buildPostHtmlFromPreview(slug, previewHtml, appHtml) {
  const title = getMetaContent(previewHtml, /<title>(.*?)<\/title>/s) ?? 'CITADEL WIRE post · CITADEL WIRE';
  const description = getMetaContent(previewHtml, /<meta name="description" content="([^"]*)"\s*\/?>(?![\s\S]*<meta name="description")/) ?? 'CITADEL WIRE post with Nostr discussion, likes, reposts, and zaps.';
  const url = getMetaContent(previewHtml, /<meta property="og:url" content="([^"]*)"\s*\/?>(?![\s\S]*<meta property="og:url")/) ?? `${SITE_URL}/posts/${slug}`;

  return withCanonicalLink(applyPostMeta(appHtml, { title, description, url }), `/posts/${slug}`);
}

function writePostPreviewPages(posts) {
  const indexPath = resolve(__dirname, '..', 'index.html');
  const appHtml = readFileSync(indexPath, 'utf-8');
  const postsDir = resolve(__dirname, '..', 'public', 'posts');
  mkdirSync(postsDir, { recursive: true });
  const seenSlugs = new Set();

  for (const event of posts) {
    const slug = getPostUtcSlug(event);
    seenSlugs.add(slug);
    const postDir = resolve(postsDir, slug);
    mkdirSync(postDir, { recursive: true });
    writeFileSync(resolve(postDir, 'index.html'), buildPostHtml(event, appHtml), 'utf-8');
  }

  return seenSlugs;
}

function getExistingPostSlugs() {
  const postsDir = resolve(__dirname, '..', 'public', 'posts');
  if (!existsSync(postsDir)) return [];

  return readdirSync(postsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(resolve(postsDir, entry.name, 'index.html')))
    .map((entry) => entry.name);
}

function syncPostPreviewPagesToDist(posts, extraSlugs = []) {
  const distDir = resolve(__dirname, '..', 'dist');
  if (!existsSync(distDir)) return;
  const indexPath = resolve(distDir, 'index.html');
  if (!existsSync(indexPath)) return;

  const appHtml = readFileSync(indexPath, 'utf-8');
  const postsDir = resolve(distDir, 'posts');
  rmSync(postsDir, { recursive: true, force: true });
  mkdirSync(postsDir, { recursive: true });
  const seenSlugs = new Set(extraSlugs);

  for (const event of posts) {
    const slug = getPostUtcSlug(event);
    seenSlugs.add(slug);
    const postDir = resolve(postsDir, slug);
    mkdirSync(postDir, { recursive: true });
    writeFileSync(resolve(postDir, 'index.html'), buildPostHtml(event, appHtml), 'utf-8');
  }

  for (const slug of seenSlugs) {
    const publicPostPath = resolve(__dirname, '..', 'public', 'posts', slug, 'index.html');
    if (!existsSync(publicPostPath)) continue;
    const postDir = resolve(postsDir, slug);
    mkdirSync(postDir, { recursive: true });
    const previewHtml = readFileSync(publicPostPath, 'utf-8');
    writeFileSync(resolve(postDir, 'index.html'), buildPostHtmlFromPreview(slug, previewHtml, appHtml), 'utf-8');
  }
}

async function main() {
  console.log('Fetching posts from Nostr relays...');
  const posts = await fetchPosts();
  console.log(`Fetched ${posts.length} posts`);

  const xml = buildRSS(posts);
  const outPath = resolve(__dirname, '..', 'public', 'feed.xml');
  writeFileSync(outPath, xml, 'utf-8');
  const existingSlugs = getExistingPostSlugs();
  const generatedSlugs = writePostPreviewPages(posts);
  syncPostPreviewPagesToDist(posts, [...existingSlugs, ...generatedSlugs]);
  const distPostsDir = resolve(__dirname, '..', 'dist', 'posts');
  if (existsSync(distPostsDir)) {
    console.log(`Post preview HTML written to ${relative(resolve(__dirname, '..'), distPostsDir)}`);
  }
  console.log(`RSS feed and ${posts.length} post previews written`);
}

main().catch((err) => {
  console.error('Failed to generate feed:', err);
  process.exit(1);
});
