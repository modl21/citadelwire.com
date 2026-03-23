import { useMemo } from 'react';
import { type NostrEvent } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import { cn } from '@/lib/utils';

interface NoteContentProps {
  event: NostrEvent;
  className?: string;
}

const NOSTR_URI_REGEX = /nostr:(npub1|note1|nprofile1|nevent1)([023456789acdefghjklmnpqrstuvwxyz]+)/g;
const HASHTAG_REGEX = /(^|\s)(#[A-Za-z]\w*)/g;
const URL_REGEX = /(https?:\/\/[^\s<]+)/g;
const BOLD_REGEX = /\*\*(.+?)\*\*/g;
const ITALIC_REGEX = /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g;
const INLINE_CODE_REGEX = /`([^`]+)`/g;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
function renderListItem(text: string): string {
  // Match patterns like "TITLE: rest", "TITLE - rest", "TITLE — rest", "**TITLE**: rest"
  const categoryMatch = text.match(/^(\*{0,2})([^:–—\-\n]{2,50}?)(\*{0,2})\s*[:–—\-]\s+(.+)$/s);
  if (categoryMatch) {
    const [, , title, , rest] = categoryMatch;
    return `<strong>${escapeHtml(title.trim())}</strong> — ${renderInline(rest.trim())}`;
  }
  return renderInline(text);
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
function renderContent(content: string): string {
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
      blocks.push(`<h3>${renderInline(trimmed)}</h3>`);
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
          items.push(`<li>${renderListItem(itemText)}</li>`);
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
          items.push(`<li>${renderListItem(itemText)}</li>`);
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

/** Parses content of text note events with smart formatting. */
export function NoteContent({ event, className }: NoteContentProps) {
  const html = useMemo(() => renderContent(event.content), [event.content]);

  return (
    <div
      className={cn('note-content prose prose-sm dark:prose-invert max-w-none break-words', className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
