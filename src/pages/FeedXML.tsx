import { useEffect } from 'react';
import { useCitadelFeed } from '@/hooks/useCitadelFeed';
import { generateRSS } from '@/lib/generateRSS';

export default function FeedXML() {
  const { data: posts } = useCitadelFeed();

  useEffect(() => {
    if (!posts || posts.length === 0) return;

    const xml = generateRSS(posts);
    const blob = new Blob([xml], { type: 'application/rss+xml; charset=utf-8' });
    const url = URL.createObjectURL(blob);

    // Redirect the browser to the blob so it renders/downloads the XML
    window.location.replace(url);
  }, [posts]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
      <p className="text-sm text-muted-foreground">Loading RSS feed...</p>
    </div>
  );
}
