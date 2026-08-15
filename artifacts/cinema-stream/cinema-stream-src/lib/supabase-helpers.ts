import { supabase } from '../supabase'; // agar supabase.ts src/ mein hai

export type WatchlistItem = {
  id: string;
  media_id: number;
  media_type: 'movie' | 'tv';
  title: string;
  added_at: string;
};

export type ProgressItem = {
  id: string;
  media_id: number;
  media_type: 'movie' | 'tv';
  title: string;
  progress_percent: number;
  last_watched_at: string;
};

// ---------- Watchlist ----------
export async function getWatchlist() {
  const { data, error } = await supabase
    .from('watchlist')
    .select('*')
    .order('added_at', { ascending: false });

  if (error) throw error;
  return (data || []) as WatchlistItem[];
}

export async function addToWatchlist(item: {
  media_id: number;
  media_type: 'movie' | 'tv';
  title: string;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in');

  const { error } = await supabase.from('watchlist').upsert({
    user_id: user.id,
    media_id: item.media_id,
    media_type: item.media_type,
    title: item.title,
  }, { onConflict: 'user_id,media_id,media_type' });

  if (error) throw error;
}

export async function removeFromWatchlist(media_id: number, media_type: 'movie' | 'tv') {
  const { error } = await supabase
    .from('watchlist')
    .delete()
    .eq('media_id', media_id)
    .eq('media_type', media_type);

  if (error) throw error;
}

// ---------- Watch Progress ----------
export async function getContinueWatching() {
  const { data, error } = await supabase
    .from('watch_progress')
    .select('*')
    .gt('progress_percent', 5)
    .lt('progress_percent', 95)
    .order('last_watched_at', { ascending: false })
    .limit(15);

  if (error) throw error;
  return (data || []) as ProgressItem[];
}

export async function upsertProgress(item: {
  media_id: number;
  media_type: 'movie' | 'tv';
  title: string;
  progress_percent: number;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase.from('watch_progress').upsert({
    user_id: user.id,
    media_id: item.media_id,
    media_type: item.media_type,
    title: item.title,
    progress_percent: Math.round(item.progress_percent * 100) / 100,
    last_watched_at: new Date().toISOString(),
  }, { onConflict: 'user_id,media_id,media_type' });

  if (error) console.error('Progress save failed', error);
}