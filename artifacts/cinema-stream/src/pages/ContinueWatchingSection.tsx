import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { useAuth } from '@/auth-context';
import { getContinueWatching, type ProgressItem } from '@/lib/supabase-helpers';

export function ContinueWatchingSection() {
  const { user } = useAuth();
  const [items, setItems] = useState<ProgressItem[]>([]);

  useEffect(() => {
    if (!user) return;
    getContinueWatching()
      .then(setItems)
      .catch(console.error);
  }, [user]);

  if (!user || items.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="mb-4 text-2xl font-bold">Continue Watching</h2>
      <ul className="space-y-2">
        {items.map(item => (
          <li
            key={item.id}
            className="flex justify-between border-b border-white/10 py-2"
          >
            <Link
              href={
                item.media_type === 'movie'
                  ? `/watch/movie/${item.media_id}`
                  : `/tv/${item.media_id}`
              }
              className="hover:text-primary"
            >
              {item.title}
            </Link>
            <span className="text-sm text-muted-foreground">
              {Math.round(item.progress_percent)}% • Age rating: N/A
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}