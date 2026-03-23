import { useMemo } from 'react';
import { type NostrEvent } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import snarkdown from 'snarkdown';
import { cn } from '@/lib/utils';

interface NoteContentProps {
  event: NostrEvent;
  className?: string;
}

const NOSTR_URI_REGEX = /nostr:(npub1|note1|nprofile1|nevent1)([023456789acdefghjklmnpqrstuvwxyz]+)/g;
const HASHTAG_REGEX = /(^|\s)(#\w+)/g;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Pre-process Nostr URIs and hashtags into markdown links before markdown parsing. */
function preprocessNostrContent(text: string): string {
  // Replace nostr: URIs with links
  let processed = text.replace(NOSTR_URI_REGEX, (_match, prefix, data) => {
    const nostrId = `${prefix}${data}`;
    try {
      const decoded = nip19.decode(nostrId);
      if (decoded.type === 'npub' || decoded.type === 'nprofile') {
        const displayId = nostrId.slice(0, 16) + '…';
        return `[@${displayId}](/${nostrId})`;
      }
      return `[${nostrId.slice(0, 16)}…](/${nostrId})`;
    } catch {
      return nostrId;
    }
  });

  // Replace hashtags with links
  processed = processed.replace(HASHTAG_REGEX, (_match, space, hashtag) => {
    const tag = hashtag.slice(1);
    return `${space}[${hashtag}](/t/${encodeURIComponent(tag)})`;
  });

  return processed;
}

/** Parses content of text note events with markdown rendering plus Nostr URI handling. */
export function NoteContent({ event, className }: NoteContentProps) {
  const html = useMemo(() => {
    const preprocessed = preprocessNostrContent(event.content);
    return snarkdown(preprocessed);
  }, [event.content]);

  return (
    <div
      className={cn('note-content prose prose-sm dark:prose-invert max-w-none break-words', className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
