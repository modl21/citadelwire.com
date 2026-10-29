import { memo, useMemo } from 'react';
import { type NostrEvent } from '@nostrify/nostrify';
import { cn } from '@/lib/utils';

interface NoteContentProps {
  event: NostrEvent;
  className?: string;
  showMoreInfo?: boolean;
  titleClassName?: string;
  /** Render with editor-wire formatting: bold headline line + clean sources list. */
  editorWire?: boolean;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function createGoogleSearchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function stripLeadingHeadlineMarker(text: string): string {
  return text
    .replace(/^[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE00}-\u{FEFF}\s]+/u, '')
    .trim();
}

function renderMoreInfoButton(headline: string): string {
  const query = stripLeadingHeadlineMarker(headline) || headline;
  const url = createGoogleSearchUrl(query);
  const label = `More info about ${query}`;

  return `<a class="more-info-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"><svg class="more-info-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2 13h4l2-6 4 12 3-9 2 3h5" /></svg></a>`;
}

/** Render inline formatting: bold, italic, code, links, nostr URIs, hashtags. */
function renderInline(text: string): string {
  let html = escapeHtml(text);

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Italic (single *)
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');

  // URLs → clickable links
  html = html.replace(/(https?:\/\/[^\s<&]+)/g, (url) => {
    // Clean trailing punctuation that's not part of the URL
    let clean = url;
    const trailingMatch = clean.match(/[),.:;!?]+$/);
    let trailing = '';
    if (trailingMatch) {
      trailing = trailingMatch[0];
      clean = clean.slice(0, -trailing.length);
    }
    return `<a href="${clean}" target="_blank" rel="noopener noreferrer">${clean}</a>${trailing}`;
  });

  // Nostr URIs
  html = html.replace(/nostr:(npub1|note1|nprofile1|nevent1)([023456789acdefghjklmnpqrstuvwxyz]+)/g, (_m, prefix, data) => {
    const nostrId = `${prefix}${data}`;
    const display = nostrId.slice(0, 16) + '&hellip;';
    return `<a href="/${nostrId}">@${display}</a>`;
  });

  // Hashtags
  html = html.replace(/(^|[\s>])(#[A-Za-z]\w*)/g, (_, before, tag) => {
    const name = tag.slice(1);
    return `${before}<a href="/t/${encodeURIComponent(name)}">${tag}</a>`;
  });

  return html;
}

/** Detect if a line looks like a title/headline (short, no period, possibly has emoji prefix). */
function isTitleLine(line: string, lineIndex: number, allLines: string[]): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (lineIndex > 2) return false; // Only first few lines can be titles
  if (trimmed.length > 120) return false; // Too long for a title
  if (trimmed.endsWith('.') && !trimmed.match(/\d+\./)) return false; // Ends with period (not a numbered item)

  // Check if next non-empty line exists (title should have content after it)
  const nextContentLine = allLines.slice(lineIndex + 1).find(l => l.trim().length > 0);
  if (!nextContentLine) return false;

  // Has emoji prefix or is ALL CAPS or is notably short
  const hasEmoji = /^[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE00}-\u{FEFF}]/u.test(trimmed);
  const isShort = trimmed.length < 80;
  const isMostlyUppercase = trimmed.replace(/[^a-zA-Z]/g, '').length > 3 &&
    trimmed.replace(/[^A-Z]/g, '').length / trimmed.replace(/[^a-zA-Z]/g, '').length > 0.6;

  return (hasEmoji && isShort) || isMostlyUppercase || (lineIndex === 0 && isShort && !trimmed.match(/^\d+[\.\)]/));
}

/** Detect if a line is a numbered list item. */
function isNumberedListItem(line: string): boolean {
  return /^\s*\d+[\.\)]\s/.test(line);
}

/** Detect if a line is a bullet list item. */
function isBulletListItem(line: string): boolean {
  return /^\s*[-•–]\s/.test(line);
}

/** Detect if a line is a sub-item (starts with --). */
function isSubItem(line: string): boolean {
  return /^\s*--\s/.test(line);
}

/** Render a list item, highlighting the leading category/title if present. */
function renderListItem(text: string, showMoreInfo: boolean): string {
  // Match patterns like "TITLE: rest", "TITLE - rest", "TITLE — rest", "**TITLE**: rest"
  const categoryMatch = text.match(/^(\*{0,2})([^:–—\-\n]{2,50}?)(\*{0,2})\s*[:–—\-]\s+(.+)$/s);
  if (categoryMatch) {
    const [, , title, , rest] = categoryMatch;
    return `<strong>${escapeHtml(title.trim())}</strong> — <span class="story-headline">${renderInline(rest.trim())}${showMoreInfo ? renderMoreInfoButton(rest.trim()) : ''}</span>`;
  }
  return `<span class="story-headline">${renderInline(text)}${showMoreInfo ? renderMoreInfoButton(text) : ''}</span>`;
}

/** Nest sub-items (class="sub-item") under the preceding parent <li>. */
function nestSubItems(items: string[]): string {
  const result: string[] = [];
  let i = 0;

  while (i < items.length) {
    const item = items[i];
    if (item.includes('class="sub-item"')) {
      // Collect consecutive sub-items
      const subs: string[] = [];
      while (i < items.length && items[i].includes('class="sub-item"')) {
        // Remove the sub-item class and re-wrap as a plain <li>
        subs.push(items[i].replace(' class="sub-item"', ''));
        i++;
      }
      // Attach to the last parent item
      if (result.length > 0) {
        const lastParent = result[result.length - 1];
        result[result.length - 1] = lastParent.replace('</li>', `<ul class="nested">${subs.join('')}</ul></li>`);
      } else {
        result.push(`<li><ul class="nested">${subs.join('')}</ul></li>`);
      }
    } else {
      result.push(item);
      i++;
    }
  }

  return result.join('');
}

/** Parse the content into structured HTML. */
function renderContent(content: string, showMoreInfo: boolean, titleClassName?: string): string {
  const lines = content.split('\n');
  const blocks: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Empty line → spacer
    if (!trimmed) {
      i++;
      continue;
    }

    // Title detection
    if (isTitleLine(trimmed, i, lines)) {
      const titleClasses = titleClassName ? ` class="${escapeHtml(titleClassName)}"` : '';
      blocks.push(`<h3${titleClasses}>${renderInline(trimmed)}</h3>`);
      i++;
      continue;
    }

    // Numbered list → render as bullets with highlighted category title
    if (isNumberedListItem(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && (isNumberedListItem(lines[i].trim()) || isSubItem(lines[i].trim()))) {
        const currentLine = lines[i].trim();
        if (isSubItem(currentLine)) {
          const subText = currentLine.replace(/^\s*--\s*/, '');
          items.push(`<li class="sub-item">${renderInline(subText)}</li>`);
        } else {
          const itemText = currentLine.replace(/^\d+[\.\)]\s*/, '');
          items.push(`<li>${renderListItem(itemText, showMoreInfo)}</li>`);
        }
        i++;
      }
      blocks.push(`<ul>${nestSubItems(items)}</ul>`);
      continue;
    }

    // Sub-items on their own (-- lines outside a numbered list)
    if (isSubItem(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && isSubItem(lines[i].trim())) {
        const subText = lines[i].trim().replace(/^\s*--\s*/, '');
        items.push(`<li>${renderInline(subText)}</li>`);
        i++;
      }
      blocks.push(`<ul class="nested">${items.join('')}</ul>`);
      continue;
    }

    // Bullet list
    if (isBulletListItem(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && (isBulletListItem(lines[i].trim()) || isSubItem(lines[i].trim()))) {
        const currentLine = lines[i].trim();
        if (isSubItem(currentLine)) {
          const subText = currentLine.replace(/^\s*--\s*/, '');
          items.push(`<li class="sub-item">${renderInline(subText)}</li>`);
        } else {
          const itemText = currentLine.replace(/^\s*[-•–]\s*/, '');
          items.push(`<li>${renderListItem(itemText, showMoreInfo)}</li>`);
        }
        i++;
      }
      blocks.push(`<ul>${nestSubItems(items)}</ul>`);
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s*/, ''));
        i++;
      }
      blocks.push(`<blockquote><p>${renderInline(quoteLines.join(' '))}</p></blockquote>`);
      continue;
    }

    // Regular paragraph — collect consecutive non-empty, non-special lines
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !isNumberedListItem(lines[i].trim()) &&
      !isBulletListItem(lines[i].trim()) &&
      !lines[i].trim().startsWith('>') &&
      !isTitleLine(lines[i].trim(), i, lines)
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }

    if (paraLines.length > 0) {
      blocks.push(`<p>${paraLines.map(renderInline).join('<br />')}</p>`);
    }
  }

  return blocks.join('');
}

// ── Editor wire formatting ──────────────────────────────────

interface WireSource {
  num: number;
  url: string;
  title?: string;
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Short "domain/path" display for sources that have no title. */
function getDisplayUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const display = parsed.hostname.replace(/^www\./, '') + (parsed.pathname === '/' ? '' : parsed.pathname);
    return display.length > 64 ? `${display.slice(0, 61)}…` : display;
  } catch {
    return url;
  }
}

/** Parse the lines of an editor wire's trailing sources section. */
function parseWireSources(sourceLines: string[]): WireSource[] {
  const sources: WireSource[] = [];
  let nextNum = 1;

  for (const rawLine of sourceLines) {
    const line = rawLine.trim();
    if (!line) continue;

    // "[n] url — title" or "[n] url"
    const numbered = line.match(/^\[(\d+)\]\s*(https?:\/\/\S+?)(?:\s+[—–-]\s*(.+))?$/);
    if (numbered) {
      const num = parseInt(numbered[1], 10);
      sources.push({ num, url: numbered[2], title: numbered[3]?.trim() });
      nextNum = num + 1;
      continue;
    }

    // Bare "url — title" or "url"
    const bare = line.match(/^(https?:\/\/\S+?)(?:\s+[—–-]\s*(.+))?$/);
    if (bare) {
      sources.push({ num: nextNum++, url: bare[1], title: bare[2]?.trim() });
      continue;
    }

    // Anything else is continuation text for the previous source.
    const last = sources[sources.length - 1];
    if (last) last.title = last.title ? `${last.title} ${line}` : line;
  }

  return sources;
}

function renderWireSources(sources: WireSource[]): string {
  const items = sources.map(({ num, url, title }) => {
    const label = title || getDisplayUrl(url);
    const domainHtml = title ? `<span class="wire-source-domain">${escapeHtml(getDomain(url))}</span>` : '';
    return `<li><span class="wire-source-num">${num}</span><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>${domainHtml}</li>`;
  });

  return `<div class="wire-sources"><div class="wire-sources-label">Sources</div><ol class="wire-sources-list">${items.join('')}</ol></div>`;
}

/** Find the index of the headline line: the first text line after the metadata headers. */
function findEditorWireHeadlineIndex(bodyLines: string[]): number {
  let i = 0;
  const skipBlank = () => { while (i < bodyLines.length && !bodyLines[i].trim()) i++; };

  skipBlank();
  // "EDITOR WIRE | …" metadata line
  if (i < bodyLines.length && /^editor\s*wire\b/i.test(bodyLines[i].trim())) {
    i++;
    skipBlank();
  }
  // "BITCOIN $… | GOLD $…" markets line
  if (i < bodyLines.length && /^bitcoin\s*\$/i.test(bodyLines[i].trim())) {
    i++;
    skipBlank();
  }

  return i < bodyLines.length ? i : -1;
}

/** Render an editor wire: bold headline after the headers, clean sources list at the end. */
function renderEditorWireContent(content: string, showMoreInfo: boolean, titleClassName?: string): string {
  const lines = content.split('\n');

  // Split off the trailing "Sources" / "## Sources" section.
  const sourcesHeaderIndex = lines.findIndex((line) => /^\s*(?:#{1,6}\s*)?sources:?\s*$/i.test(line));
  const bodyLines = sourcesHeaderIndex === -1 ? lines : lines.slice(0, sourcesHeaderIndex);
  const sourceLines = sourcesHeaderIndex === -1 ? [] : lines.slice(sourcesHeaderIndex + 1);

  const headlineIndex = findEditorWireHeadlineIndex(bodyLines);

  const blocks: string[] = [];

  if (headlineIndex === -1) {
    blocks.push(renderContent(bodyLines.join('\n'), showMoreInfo, titleClassName));
  } else {
    // Header lines (EDITOR WIRE metadata + markets) keep their heading style.
    const titleClasses = titleClassName ? ` class="${escapeHtml(titleClassName)}"` : '';
    for (const headerLine of bodyLines.slice(0, headlineIndex)) {
      if (!headerLine.trim()) continue;
      blocks.push(`<h3${titleClasses}>${renderInline(headerLine.trim())}</h3>`);
    }
    // The headline is always the first line of text — render it bold.
    blocks.push(`<p class="editor-wire-headline">${renderInline(bodyLines[headlineIndex].trim())}</p>`);
    blocks.push(renderContent(bodyLines.slice(headlineIndex + 1).join('\n'), showMoreInfo, titleClassName));
  }

  const sources = parseWireSources(sourceLines);
  if (sources.length > 0) {
    blocks.push(renderWireSources(sources));
  }

  return blocks.join('');
}

/** Parses content of text note events with smart formatting. */
export const NoteContent = memo(function NoteContent({ event, className, showMoreInfo = false, titleClassName, editorWire = false }: NoteContentProps) {
  const html = useMemo(
    () => editorWire
      ? renderEditorWireContent(event.content, showMoreInfo, titleClassName)
      : renderContent(event.content, showMoreInfo, titleClassName),
    [event.content, showMoreInfo, titleClassName, editorWire],
  );

  return (
    <div
      className={cn('note-content prose prose-sm dark:prose-invert max-w-none break-words', className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});
