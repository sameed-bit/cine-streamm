import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { useAuth } from '@/auth-context';
import { getWatchlist, removeFromWatchlist, type WatchlistItem } from '@/lib/supabase-helpers';

export function MyListPage() {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await getWatchlist();
      setItems(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) load();
  }, [user]);

  const handleRemove = async (item: WatchlistItem) => {
    try {
      await removeFromWatchlist(item.media_id, item.media_type);
      setItems(prev => prev.filter(x => x.id !== item.id));
    } catch (e: any) {
      alert(e.message);
    }
  };

  if (authLoading) return <p className="p-8 text-muted-foreground">Loading…</p>;
  
  if (!user) {
    return (
      <div className="p-8">
        <p>
          Please{' '}
          <Link href="/sign-in" className="text-primary underline">
            sign in
          </Link>{' '}
          to see your list.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-6">
      <h1 className="text-3xl font-bold">My List</h1>
      <p className="text-muted-foreground">Saved titles (text only)</p>

      {loading && <p>Loading…</p>}
      {error && <p className="text-red-400">{error}</p>}

      {!loading && items.length === 0 && (
        <p className="text-muted-foreground">Your list is empty.</p>
      )}

      <ul className="space-y-2">
        {items.map(item => (
          <li
            key={item.id}
            className="flex items-center justify-between border-b border-white/10 py-3"
          >
            <div>
              <span className="font-medium">{item.title}</span>
              <span className="ml-3 text-sm text-muted-foreground">
                {item.media_type === 'movie' ? 'Movie' : 'TV'} • Age rating: N/A
              </span>
            </div>
            <button
              onClick={() => handleRemove(item)}
              className="text-sm text-red-400 hover:underline"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}