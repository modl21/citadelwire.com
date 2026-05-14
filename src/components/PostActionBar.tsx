import { useState } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';
import { MessageCircle, Repeat2, Zap, Heart, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ZapDialog } from '@/components/ZapDialog';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLikePost, useRepostPost } from '@/hooks/usePostActions';
import { usePostEngagement } from '@/hooks/usePostEngagement';
import { useAuthor } from '@/hooks/useAuthor';
import { ActionLoginDialog } from '@/components/auth/ActionLoginDialog';
import { cn } from '@/lib/utils';

interface PostActionBarProps {
  event: NostrEvent;
  onComment?: () => void;
  className?: string;
  expanded?: boolean;
}

type LoginAction = 'comment' | 'like' | 'repost' | 'zap';

function actionText(action: LoginAction | undefined): string {
  switch (action) {
    case 'comment':
      return 'comment on this post';
    case 'like':
      return 'like this post';
    case 'repost':
      return 'repost this to Nostr';
    case 'zap':
      return 'zap this author';
    default:
      return 'interact with this post';
  }
}

function formatCount(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 1_000_000) return `${(count / 1000).toFixed(count >= 10_000 ? 0 : 1)}K`;
  return `${(count / 1_000_000).toFixed(1)}M`;
}

export function PostActionBar({ event, onComment, className, expanded = false }: PostActionBarProps) {
  const { user } = useCurrentUser();
  const author = useAuthor(event.pubkey);
  const engagement = usePostEngagement(event, expanded);
  const likePost = useLikePost();
  const repostPost = useRepostPost();
  const [loginAction, setLoginAction] = useState<LoginAction>();
  const [loginOpen, setLoginOpen] = useState(false);

  const likes = expanded ? (engagement.data?.likes.length ?? 0) : 0;
  const replies = expanded ? (engagement.data?.replies.length ?? 0) + (engagement.data?.comments.length ?? 0) : 0;
  const reposts = expanded ? (engagement.data?.reposts.length ?? 0) : 0;
  const zaps = expanded ? (engagement.data?.totalZapSats ?? 0) : 0;
  const liked = user ? engagement.data?.likePubkeys.has(user.pubkey) : false;
  const reposted = user ? engagement.data?.repostPubkeys.has(user.pubkey) : false;
  const canZap = Boolean(author.data?.metadata?.lud16 || author.data?.metadata?.lud06) && user?.pubkey !== event.pubkey;

  const promptLogin = (action: LoginAction) => {
    setLoginAction(action);
    setLoginOpen(true);
  };

  const handleComment = () => {
    if (!user) {
      promptLogin('comment');
      return;
    }
    onComment?.();
  };

  const handleLike = () => {
    if (!user) {
      promptLogin('like');
      return;
    }
    if (liked || likePost.isPending) return;
    likePost.mutate(event);
  };

  const handleRepost = () => {
    if (!user) {
      promptLogin('repost');
      return;
    }
    if (reposted || repostPost.isPending) return;
    repostPost.mutate(event);
  };

  const stopClickPropagation = (clickEvent: React.MouseEvent) => {
    clickEvent.preventDefault();
    clickEvent.stopPropagation();
  };

  const zapButton = (() => {
    if (!user) {
      return (
        <Button
          type="button"
          variant="ghost"
          size={expanded ? 'default' : 'sm'}
          onClick={(clickEvent) => {
            stopClickPropagation(clickEvent);
            promptLogin('zap');
          }}
          className="group/action rounded-full px-3 text-muted-foreground hover:bg-amber-500/10 hover:text-amber-300"
        >
          <Zap className="mr-1.5 h-4 w-4 transition-transform group-hover/action:scale-110" />
          <span>{expanded && zaps > 0 ? formatCount(zaps) : 'Zap'}</span>
          {expanded && zaps > 0 && <span className="ml-1 hidden sm:inline">sats</span>}
        </Button>
      );
    }

    if (!canZap) {
      return (
        <Button
          type="button"
          variant="ghost"
          size={expanded ? 'default' : 'sm'}
          disabled
          onClick={stopClickPropagation}
          className="rounded-full px-3 text-muted-foreground disabled:opacity-45"
        >
          <Zap className="mr-1.5 h-4 w-4" />
          <span>{expanded && zaps > 0 ? formatCount(zaps) : 'Zap'}</span>
          {expanded && zaps > 0 && <span className="ml-1 hidden sm:inline">sats</span>}
        </Button>
      );
    }

    return (
      <div onClick={stopClickPropagation}>
        <ZapDialog target={event}>
          <Button
            type="button"
            variant="ghost"
            size={expanded ? 'default' : 'sm'}
            className="group/action rounded-full px-3 text-muted-foreground hover:bg-amber-500/10 hover:text-amber-300"
          >
            <Zap className="mr-1.5 h-4 w-4 transition-transform group-hover/action:scale-110" />
            <span>{expanded && zaps > 0 ? formatCount(zaps) : 'Zap'}</span>
            {expanded && zaps > 0 && <span className="ml-1 hidden sm:inline">sats</span>}
          </Button>
        </ZapDialog>
      </div>
    );
  })();

  const actions = (
    <>
      <Button
        type="button"
        variant="ghost"
        size={expanded ? 'default' : 'sm'}
        onClick={(clickEvent) => {
          stopClickPropagation(clickEvent);
          handleComment();
        }}
        className="group/action rounded-full px-3 text-muted-foreground hover:bg-sky-500/10 hover:text-sky-300"
      >
        <MessageCircle className="mr-1.5 h-4 w-4 transition-transform group-hover/action:scale-110" />
        {expanded && <span>{formatCount(replies)}</span>}
        {expanded ? <span className="ml-1 hidden sm:inline">Comments</span> : <span>Comment</span>}
      </Button>

      <Button
        type="button"
        variant="ghost"
        size={expanded ? 'default' : 'sm'}
        disabled={likePost.isPending || liked}
        onClick={(clickEvent) => {
          stopClickPropagation(clickEvent);
          handleLike();
        }}
        className={cn(
          'group/action rounded-full px-3 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-100',
          liked && 'text-rose-300',
        )}
      >
        {likePost.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Heart className={cn('mr-1.5 h-4 w-4 transition-transform group-hover/action:scale-110', liked && 'fill-current')} />}
        {expanded && <span>{formatCount(likes)}</span>}
        {expanded ? <span className="ml-1 hidden sm:inline">Likes</span> : <span>Like</span>}
      </Button>

      <Button
        type="button"
        variant="ghost"
        size={expanded ? 'default' : 'sm'}
        disabled={repostPost.isPending || reposted}
        onClick={(clickEvent) => {
          stopClickPropagation(clickEvent);
          handleRepost();
        }}
        className={cn(
          'group/action rounded-full px-3 text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-300 disabled:opacity-100',
          reposted && 'text-emerald-300',
        )}
      >
        {repostPost.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Repeat2 className="mr-1.5 h-4 w-4 transition-transform group-hover/action:scale-110" />}
        {expanded && <span>{formatCount(reposts)}</span>}
        {expanded ? <span className="ml-1 hidden sm:inline">Reposts</span> : <span>Repost</span>}
      </Button>

      {zapButton}
    </>
  );

  return (
    <>
      <div className={cn('flex flex-wrap items-center justify-between gap-1', className)}>
        {actions}
      </div>
      <ActionLoginDialog
        open={loginOpen}
        onOpenChange={setLoginOpen}
        action={actionText(loginAction)}
      />
    </>
  );
}
