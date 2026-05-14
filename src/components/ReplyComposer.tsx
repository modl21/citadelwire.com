import { useState } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';
import { Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { getPreferredRelay, getReplyRootId } from '@/lib/nostrPost';

interface ReplyComposerProps {
  root: NostrEvent;
  onCancel?: () => void;
  onSuccess?: () => void;
}

function buildReplyTags(root: NostrEvent): string[][] {
  const relay = getPreferredRelay(root);
  const rootId = getReplyRootId(root);
  const tags: string[][] = [];

  if (rootId === root.id) {
    tags.push(['e', root.id, relay, 'root', root.pubkey]);
  } else {
    tags.push(['e', rootId, relay, 'root', root.pubkey]);
    tags.push(['e', root.id, relay, 'reply', root.pubkey]);
  }

  const pubkeys = new Set<string>([root.pubkey]);
  root.tags.forEach(([name, value]) => {
    if (name === 'p' && value) pubkeys.add(value);
  });

  pubkeys.forEach((pubkey) => tags.push(['p', pubkey]));
  return tags;
}

export function ReplyComposer({ root, onCancel, onSuccess }: ReplyComposerProps) {
  const { user } = useCurrentUser();
  const { mutate: publishReply, isPending } = useNostrPublish();
  const [content, setContent] = useState('');

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = content.trim();
    if (!trimmed || !user) return;

    publishReply(
      {
        kind: 1,
        content: trimmed,
        tags: buildReplyTags(root),
      },
      {
        onSuccess: () => {
          setContent('');
          onSuccess?.();
        },
      },
    );
  };

  if (!user) return null;

  return (
    <Card className="overflow-hidden border-sky-400/20 bg-sky-400/[0.035] shadow-[0_0_40px_rgba(56,189,248,0.07)]">
      <CardContent className="p-4 sm:p-5">
        <form onSubmit={handleSubmit} className="space-y-3">
          <Textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Add a Nostr reply…"
            disabled={isPending}
            className="min-h-[112px] resize-none border-white/10 bg-background/80 text-base leading-7 focus-visible:ring-sky-400/40"
            autoFocus
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Published as a kind 1 reply to this post.
            </p>
            <div className="flex gap-2">
              {onCancel && (
                <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={isPending}>
                  <X className="mr-1 h-4 w-4" />
                  Cancel
                </Button>
              )}
              <Button type="submit" size="sm" disabled={!content.trim() || isPending}>
                <Send className="mr-1.5 h-4 w-4" />
                {isPending ? 'Posting…' : 'Reply'}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
