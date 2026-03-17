import type { NostrEvent } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';

const SITE_URL = 'https://citadelwire.com';
const NOTE_CONTENT_REGEX = /(https?:\/\/[^\s]+)|nostr:(npub1|note1|nprofile1|nevent1)([023456789acdefghjklmnpqrstuvwxyz]+)|(#\w+)/g;

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeCdata(str: string): string {
  return str.replace(/]]>/g, ']]]]><![CDATA[>');
}

function formatTextFragment(text: string): string {
  return escapeHtml(text).replace(/\n/g, '<br />');
}

function renderNoteContentHtml(content: string): string {
  const parts: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

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

function toRFC822(unixTimestamp: number): string {
  return new Date(unixTimestamp * 1000).toUTCString();
}

export function generateRSS(posts: NostrEvent[]): string {
  const sorted = [...posts].sort((a, b) => b.created_at - a.created_at);

  const items = sorted.map((event) => {
    const nevent = nip19.neventEncode({ id: event.id, author: event.pubkey });
    const link = `https://primal.net/e/${nevent}`;
    const titleText = event.content.split('\n')[0].slice(0, 100) || 'Note';
    const title = escapeXml(titleText);
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
    <lastBuildDate>${sorted.length > 0 ? toRFC822(sorted[0].created_at) : toRFC822(Math.floor(Date.now() / 1000))}</lastBuildDate>
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

export function createRSSBlobUrl(posts: NostrEvent[]): string {
  const xml = generateRSS(posts);
  const blob = new Blob([xml], { type: 'application/rss+xml' });
  return URL.createObjectURL(blob);
}
