import type { NostrEvent } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toRFC822(unixTimestamp: number): string {
  return new Date(unixTimestamp * 1000).toUTCString();
}

export function generateRSS(posts: NostrEvent[]): string {
  const sorted = [...posts].sort((a, b) => b.created_at - a.created_at);

  const items = sorted.map((event) => {
    const nevent = nip19.neventEncode({ id: event.id, author: event.pubkey });
    const link = `https://primal.net/e/${nevent}`;
    // Use first 100 chars as title, full content as description
    const titleText = event.content.split('\n')[0].slice(0, 100) || 'Note';
    const title = escapeXml(titleText);
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
    <lastBuildDate>${sorted.length > 0 ? toRFC822(sorted[0].created_at) : toRFC822(Math.floor(Date.now() / 1000))}</lastBuildDate>
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

export function createRSSBlobUrl(posts: NostrEvent[]): string {
  const xml = generateRSS(posts);
  const blob = new Blob([xml], { type: 'application/rss+xml' });
  return URL.createObjectURL(blob);
}
