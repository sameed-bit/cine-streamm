import { MyListPage } from '@/pages/MyListPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import {
  Link,
  Route,
  Switch,
  useLocation,
  useParams,
  Router as WouterRouter,
} from 'wouter';

import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  ChevronDown,
  CircleUserRound,
  Clapperboard,
  Clock3,
  Film,
  History,
  Info,
  List,
  Menu,
  Play,
  Search,
  Settings2,
  Sparkles,
  Star,
  Tv,
  UserRound,
  X,
} from 'lucide-react';

import { ErrorBoundary } from '@/components/error-boundary';
import { VideoPlayer } from '@/components/VideoPlayer';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';

// Supabase auth — put these files in src/ (or adjust paths):
//   src/lib/supabase.ts   OR  src/supabase.ts
//   src/auth-context.tsx
//   src/AuthPages.tsx
import { AuthProvider, useAuth } from '@/auth-context';
import { SignInPage, SignUpPage } from '@/AuthPages';

/* =========================================================
   TMDB CONFIG
   ========================================================= */

const TMDB_KEY =
  (typeof import.meta !== 'undefined' &&
    (import.meta as any).env?.VITE_TMDB_KEY) ||
  '6afd448245181f37b7cac9d779ab7e71';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p/';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

/* =========================================================
   TYPES
   ========================================================= */

type Media = {
  id: number;
  media_type: 'movie' | 'tv';
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string;
  release_date: string | null;
  vote_average: number;
  vote_count?: number;
};

type MediaDetails = Media & {
  runtime?: number | null;
  genres?: { id: number; name: string }[];
  production_companies?: string[];
  cast?: {
    id: number;
    name: string;
    character: string;
    profile_path: string | null;
  }[];
  seasons?: Season[];
};

type Season = {
  season_number: number;
  name: string;
  episode_count: number;
};

type Video = {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
  official: boolean;
  published_at?: string;
};

/* =========================================================
   HELPERS
   ========================================================= */

const poster = (path: string | null | undefined, size = 'w500') =>
  path ? `${TMDB_IMG}${size}${path}` : '';

const year = (date?: string | null) => date?.slice(0, 4) || '—';

const duration = (runtime?: number | null) =>
  runtime ? `${Math.floor(runtime / 60)}h ${runtime % 60}m` : 'Feature';

const safeJson = <T,>(key: string, fallback: T): T => {
  try {
    return JSON.parse(localStorage.getItem(key) || '') as T;
  } catch {
    return fallback;
  }
};

const mediaKey = (item: Pick<Media, 'id' | 'media_type'>) =>
  `${item.media_type}-${item.id}`;

function uniqueMedia(items: Media[] = []) {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = mediaKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeUniqueMedia(current: Media[], incoming: Media[]) {
  return uniqueMedia([...current, ...incoming]);
}

function normalize(item: any, forcedType?: 'movie' | 'tv'): Media {
  const isTv =
    forcedType === 'tv' ||
    item.media_type === 'tv' ||
    !!item.first_air_date ||
    !!item.name;

  return {
    id: item.id,
    media_type: isTv ? 'tv' : 'movie',
    title: item.title || item.name || 'Untitled',
    poster_path: item.poster_path ?? null,
    backdrop_path: item.backdrop_path ?? null,
    overview: item.overview || '',
    release_date: item.release_date || item.first_air_date || null,
    vote_average: item.vote_average ?? 0,
    vote_count: item.vote_count,
  };
}

/* =========================================================
   LOCAL WATCH HISTORY
   ========================================================= */

const HISTORY_KEY = 'cinema-history-items';
const HISTORY_USER_PREFIX = 'cinema-history-user-';
const PROGRESS_USER_PREFIX = 'cinema-progress-user-';
const LIST_USER_PREFIX = 'cinema-list-user-';
const LIST_ITEMS_USER_PREFIX = 'cinema-list-items-user-';
const MAX_HISTORY = 30;

/** Active account id (null = guest / signed out) */
function getActiveUserId(): string | null {
  try {
    return localStorage.getItem('cinema-active-user-id');
  } catch {
    return null;
  }
}

function setActiveUserId(userId: string | null) {
  try {
    if (userId) localStorage.setItem('cinema-active-user-id', userId);
    else localStorage.removeItem('cinema-active-user-id');
  } catch {
    /* ignore */
  }
}

function userHistoryKey(userId: string) {
  return `${HISTORY_USER_PREFIX}${userId}`;
}

function getWatchHistory(): Media[] {
  const uid = getActiveUserId();
  if (!uid) return []; // signed out → empty history
  return uniqueMedia(safeJson<Media[]>(userHistoryKey(uid), []));
}

function addToWatchHistory(item: Media) {
  const uid = getActiveUserId();
  if (!uid) return; // only track while signed in

  const current = getWatchHistory();
  const next = [
    item,
    ...current.filter(x => mediaKey(x) !== mediaKey(item)),
  ].slice(0, MAX_HISTORY);

  localStorage.setItem(userHistoryKey(uid), JSON.stringify(next));
  window.dispatchEvent(new Event('cinema-history-updated'));
}

function removeFromWatchHistory(item: Pick<Media, 'id' | 'media_type'>) {
  const uid = getActiveUserId();
  if (!uid) return;

  const current = getWatchHistory();
  const next = current.filter(x => mediaKey(x) !== mediaKey(item));
  localStorage.setItem(userHistoryKey(uid), JSON.stringify(next));
  window.dispatchEvent(new Event('cinema-history-updated'));
}

function clearWatchHistory() {
  const uid = getActiveUserId();
  if (uid) localStorage.removeItem(userHistoryKey(uid));
  window.dispatchEvent(new Event('cinema-history-updated'));
}

function normalizeProgressPercent(
  percent?: number,
  currentTime?: number,
  duration?: number,
): number {
  let value = Number(percent);
  if (!Number.isFinite(value) || value <= 0) {
    const t = Number(currentTime);
    const d = Number(duration);
    if (Number.isFinite(t) && Number.isFinite(d) && d > 0) {
      value = (t / d) * 100;
    } else {
      return 0;
    }
  }
  // Some players report 0–1 instead of 0–100
  if (value > 0 && value <= 1) value *= 100;
  return Math.min(100, Math.max(0, value));
}

function getWatchProgress(item: Pick<Media, 'id' | 'media_type'>): number {
  try {
    const uid = getActiveUserId();
    if (!uid) return 0;
    const raw = localStorage.getItem(
      `${PROGRESS_USER_PREFIX}${uid}-${item.media_type}-${item.id}`,
    );
    if (!raw) return 0;
    const data = JSON.parse(raw) as {
      percent?: number;
      currentTime?: number;
      duration?: number;
    };
    return normalizeProgressPercent(
      data.percent,
      data.currentTime,
      data.duration,
    );
  } catch {
    return 0;
  }
}

function saveWatchProgress(
  item: Pick<Media, 'id' | 'media_type'>,
  progress: {
    percent?: number;
    currentTime?: number;
    duration?: number;
    [key: string]: unknown;
  },
) {
  const uid = getActiveUserId();
  if (!uid) return;
  const percent = normalizeProgressPercent(
    progress.percent as number | undefined,
    progress.currentTime as number | undefined,
    progress.duration as number | undefined,
  );
  localStorage.setItem(
    `${PROGRESS_USER_PREFIX}${uid}-${item.media_type}-${item.id}`,
    JSON.stringify({ ...progress, percent }),
  );
}

/** Call on sign-in: bind this browser session to the account (history comes back) */
function bindUserSession(userId: string) {
  setActiveUserId(userId);
  window.dispatchEvent(new Event('cinema-history-updated'));
}

/** Call on sign-out: hide history (data stays saved under the user id) */
function unbindUserSession() {
  setActiveUserId(null);
  window.dispatchEvent(new Event('cinema-history-updated'));
}



/* =========================================================
   TMDB FETCHERS
   ========================================================= */

async function tmdbFetch(path: string, params: Record<string, string | number> = {}) {
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set('api_key', TMDB_KEY);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  return res.json();
}

const ORIGIN_COUNTRIES = [
  { code: 'US', label: 'USA' },
  { code: 'GB', label: 'UK' },
  { code: 'IN', label: 'India' },
  { code: 'KR', label: 'Korea' },
  { code: 'JP', label: 'Japan' },
  { code: 'FR', label: 'France' },
  { code: 'ES', label: 'Spain' },
  { code: 'DE', label: 'Germany' },
  { code: 'IT', label: 'Italy' },
  { code: 'CA', label: 'Canada' },
  { code: 'AU', label: 'Australia' },
  { code: 'BR', label: 'Brazil' },
  { code: 'MX', label: 'Mexico' },
  { code: 'CN', label: 'China' },
  { code: 'TR', label: 'Turkey' },
  { code: 'PK', label: 'Pakistan' },
] as const;

function useGetDiscoverMedia(
  opts: {
    type: 'movie' | 'tv';
    category: string;
    page?: number;
    genre?: number;
    country?: string;
    year?: string;
  },
  queryOpts?: any,
) {
  const { type, category, page = 1, genre, country, year } = opts;

  return useQuery({
    queryKey: ['discover', type, category, page, genre, country, year],
    queryFn: async () => {
      let path = '';
      if (type === 'movie') {
        if (category === 'popular') path = '/movie/popular';
        else if (category === 'top_rated') path = '/movie/top_rated';
        else if (category === 'now_playing') path = '/movie/now_playing';
        else if (category === 'upcoming') path = '/movie/upcoming';
        else path = '/movie/popular';
      } else {
        if (category === 'popular') path = '/tv/popular';
        else if (category === 'top_rated') path = '/tv/top_rated';
        else if (category === 'on_the_air') path = '/tv/on_the_air';
        else if (category === 'airing_today') path = '/tv/airing_today';
        else path = '/tv/popular';
      }

      const params: Record<string, string | number> = { page };
      if (genre || country || year) {
        path = type === 'movie' ? '/discover/movie' : '/discover/tv';
        params.sort_by = 'popularity.desc';
        if (genre) params.with_genres = genre;
        if (country) params.with_origin_country = country;
        if (year) {
          if (type === 'movie') params.primary_release_year = year;
          else params.first_air_date_year = year;
        }
      }

      const data = await tmdbFetch(path, params);
      return {
        items: (data.results || []).map((r: any) => normalize(r, type)),
        total_pages: data.total_pages || 1,
        page: data.page || 1,
      };
    },
    enabled: queryOpts?.query?.enabled !== false,
    ...queryOpts?.query,
  });
}

function useGetTrending(opts: { page?: number }, queryOpts?: any) {
  const page = opts.page || 1;
  return useQuery({
    queryKey: ['trending', page],
    queryFn: async () => {
      const data = await tmdbFetch('/trending/all/day', { page });
      return {
        items: (data.results || [])
          .filter((r: any) => r.media_type === 'movie' || r.media_type === 'tv')
          .map((r: any) => normalize(r)),
        total_pages: data.total_pages || 1,
      };
    },
    ...queryOpts?.query,
  });
}

function useGetMovieDetails(id: number, queryOpts?: any) {
  return useQuery({
    queryKey: ['movie', id],
    queryFn: async () => {
      const [details, credits] = await Promise.all([
        tmdbFetch(`/movie/${id}`),
        tmdbFetch(`/movie/${id}/credits`),
      ]);
      const media = normalize(details, 'movie');
      return {
        ...media,
        runtime: details.runtime,
        genres: details.genres,
        production_companies: (details.production_companies || []).map(
          (c: any) => c.name,
        ),
        cast: (credits.cast || []).slice(0, 12).map((c: any) => ({
          id: c.id,
          name: c.name,
          character: c.character,
          profile_path: c.profile_path,
        })),
      } as MediaDetails;
    },
    enabled: !!id && queryOpts?.query?.enabled !== false,
    ...queryOpts?.query,
  });
}

function useGetTvDetails(id: number, queryOpts?: any) {
  return useQuery({
    queryKey: ['tv', id],
    queryFn: async () => {
      const [details, credits] = await Promise.all([
        tmdbFetch(`/tv/${id}`),
        tmdbFetch(`/tv/${id}/credits`),
      ]);
      const media = normalize(details, 'tv');
      return {
        ...media,
        runtime: details.episode_run_time?.[0] || null,
        genres: details.genres,
        production_companies: (details.production_companies || []).map(
          (c: any) => c.name,
        ),
        seasons: details.seasons || [],
        cast: (credits.cast || []).slice(0, 12).map((c: any) => ({
          id: c.id,
          name: c.name,
          character: c.character,
          profile_path: c.profile_path,
        })),
      } as MediaDetails;
    },
    enabled: !!id && queryOpts?.query?.enabled !== false,
    ...queryOpts?.query,
  });
}

function useGetVideos(type: 'movie' | 'tv', id: number, queryOpts?: any) {
  return useQuery({
    queryKey: ['videos', type, id],
    queryFn: async () => {
      const data = await tmdbFetch(`/${type}/${id}/videos`);
      return (data.results || []) as Video[];
    },
    enabled: !!id && queryOpts?.query?.enabled !== false,
    ...queryOpts?.query,
  });
}

/** Prefer official YouTube Trailer, then any Trailer, then Teaser */
function pickBestTrailer(videos: Video[] = []): Video | null {
  const youtube = videos.filter(v => v.site === 'YouTube');
  if (!youtube.length) return null;

  const officialTrailer = youtube.find(
    v => v.type === 'Trailer' && v.official,
  );
  if (officialTrailer) return officialTrailer;

  const anyTrailer = youtube.find(v => v.type === 'Trailer');
  if (anyTrailer) return anyTrailer;

  const teaser = youtube.find(v => v.type === 'Teaser');
  if (teaser) return teaser;

  return youtube[0] || null;
}

function useGetGenres() {
  return useQuery({
    queryKey: ['genres'],
    queryFn: async () => {
      const [movies, tv] = await Promise.all([
        tmdbFetch('/genre/movie/list'),
        tmdbFetch('/genre/tv/list'),
      ]);
      return {
        movies: movies.genres || [],
        tv: tv.genres || [],
      };
    },
  });
}

function useSearchCatalog(
  opts: { query: string; filter: string },
  queryOpts?: any,
) {
  return useQuery({
    queryKey: ['search', opts.query, opts.filter],
    queryFn: async () => {
      if (!opts.query) return { items: [], people: [] };

      const data = await tmdbFetch('/search/multi', {
        query: opts.query,
        page: 1,
      });

      const items: Media[] = [];
      const people: any[] = [];

      for (const r of data.results || []) {
        if (r.media_type === 'person') {
          people.push(r);
        } else if (
          (opts.filter === 'all' || opts.filter === r.media_type) &&
          (r.media_type === 'movie' || r.media_type === 'tv')
        ) {
          items.push(normalize(r));
        }
      }

      return { items, people };
    },
    enabled: opts.query.length > 0 && queryOpts?.query?.enabled !== false,
    ...queryOpts?.query,
  });
}

function useHealthCheck(queryOpts?: any) {
  return useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      await tmdbFetch('/configuration');
      return { status: 'ok' };
    },
    ...queryOpts?.query,
  });
}

/* =========================================================
   SAVED MEDIA (My List)
   ========================================================= */

function userListKey(userId: string) {
  return `${LIST_USER_PREFIX}${userId}`;
}

function userListItemsKey(userId: string) {
  return `${LIST_ITEMS_USER_PREFIX}${userId}`;
}

function getSavedKeys(): string[] {
  const uid = getActiveUserId();
  if (!uid) return [];
  return safeJson<string[]>(userListKey(uid), []);
}

function getSavedItems(): Media[] {
  const uid = getActiveUserId();
  if (!uid) return [];
  const keys = new Set(getSavedKeys());
  return uniqueMedia(
    safeJson<Media[]>(userListItemsKey(uid), []).filter(item =>
      keys.has(mediaKey(item)),
    ),
  );
}

function useSavedMedia() {
  const [saved, setSaved] = useState<string[]>(() => getSavedKeys());

  // Re-sync when user signs in / out (same event as history)
  useEffect(() => {
    const handler = () => setSaved(getSavedKeys());
    window.addEventListener('cinema-history-updated', handler);
    return () => window.removeEventListener('cinema-history-updated', handler);
  }, []);

  const toggle = (item: Pick<Media, 'id' | 'media_type'>) => {
    const uid = getActiveUserId();
    if (!uid) return; // guests cannot save

    setSaved(current => {
      const key = mediaKey(item);
      const next = current.includes(key)
        ? current.filter(x => x !== key)
        : [...current, key];

      const stored = safeJson<Media[]>(userListItemsKey(uid), []);
      const nextItems = next.includes(key)
        ? [...stored.filter(x => mediaKey(x) !== key), item as Media]
        : stored.filter(x => mediaKey(x) !== key);

      localStorage.setItem(userListKey(uid), JSON.stringify(next));
      localStorage.setItem(userListItemsKey(uid), JSON.stringify(nextItems));
      return next;
    });
  };

  return { saved, toggle };
}

/* =========================================================
   UI COMPONENTS
   ========================================================= */

function Poster({
  item,
  className = '',
  eager = false,
}: {
  item: Media;
  className?: string;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <div
      className={`group/poster relative overflow-hidden bg-[hsl(var(--muted))] ${className}`}
    >
      {item.poster_path && !failed ? (
        <img
          src={poster(item.poster_path)}
          alt={`${item.title} poster`}
          loading={eager ? 'eager' : 'lazy'}
          onError={() => setFailed(true)}
          className="h-full w-full object-cover transition duration-500 group-hover/poster:scale-105"
        />
      ) : (
        <div className="flex h-full flex-col justify-end bg-[radial-gradient(circle_at_35%_20%,hsl(353_71%_51%/.65),transparent_45%),linear-gradient(145deg,hsl(224_24%_18%),hsl(222_23%_7%))] p-4">
          <Film className="mb-auto h-7 w-7 text-[hsl(var(--accent))]" />
          <span className="font-display text-lg leading-tight text-foreground">
            {item.title}
          </span>
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-70" />
    </div>
  );
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton-shimmer rounded-sm ${className}`} />;
}

function LoadingRail() {
  return (
    <div className="stagger-grid grid grid-cols-2 min-[400px]:grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="aspect-[2/3]" />
      ))}
    </div>
  );
}

function QueryMessage({
  error,
  retry,
}: {
  error?: unknown;
  retry?: () => void;
}) {
  return (
    <div className="flex min-h-36 flex-col items-center justify-center border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card)/.45)] px-5 text-center">
      <Info className="mb-3 h-5 w-5 text-[hsl(var(--accent))]" />
      <p className="text-sm text-muted-foreground">
        {error
          ? 'The projector missed a frame. Try again.'
          : 'Nothing is playing in this reel yet.'}
      </p>
      {retry && (
        <button
          data-testid="button-retry"
          onClick={retry}
          className="mt-3 text-xs font-bold uppercase tracking-[.18em] text-primary"
        >
          Try again
        </button>
      )}
    </div>
  );
}

function TrailerModal({
  videoKey,
  title,
  onClose,
}: {
  videoKey: string;
  title: string;
  onClose: () => void;
}) {
  const [chromeVisible, setChromeVisible] = useState(true);
  const hideTimer = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, [onClose]);

  const bumpChrome = () => {
    setChromeVisible(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setChromeVisible(false), 2800);
  };

  useEffect(() => {
    bumpChrome();
    // Jump viewport to top so theater mode isn't stuck under the fold
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Render on document.body so fixed positioning is always full-screen
  // (not trapped by transformed ancestors lower on the page)
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex h-[100dvh] w-screen flex-col items-stretch justify-center bg-black"
      style={{ margin: 0, top: 0, left: 0, right: 0, bottom: 0 }}
      onMouseMove={bumpChrome}
      onTouchStart={bumpChrome}
      role="dialog"
      aria-modal="true"
      aria-label={`Theater mode trailer for ${title}`}
    >
      {/* Cinema letterbox ambient */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.55)_100%)]" />

      {/* Floating theater chrome */}
      <div
        className={`absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-4 px-4 py-4 transition-opacity duration-500 sm:px-8 sm:py-5 ${
          chromeVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
            Theater mode · Official trailer
          </p>
          <h3 className="mt-0.5 truncate text-base font-semibold text-white sm:text-lg">
            {title}
          </h3>
        </div>
        <button
          onClick={onClose}
          aria-label="Exit theater mode"
          className="flex h-11 shrink-0 items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 text-sm font-semibold text-white backdrop-blur-md transition hover:border-white/40 hover:bg-white/20"
        >
          <X className="h-4 w-4" />
          <span className="hidden sm:inline">Exit</span>
        </button>
      </div>

      {/* Full-bleed theater stage – truly centered */}
      <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center px-3 py-14 sm:px-8 sm:py-16">
        <div
          className="relative overflow-hidden bg-black shadow-[0_0_80px_rgba(0,0,0,0.9)] sm:rounded-lg"
          style={{
            aspectRatio: '16 / 9',
            width: 'min(100%, 1600px, calc(78dvh * 16 / 9))',
            maxHeight: '78dvh',
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
          onClick={e => e.stopPropagation()}
        >
          <iframe
            src={`https://www.youtube.com/embed/${videoKey}?autoplay=1&rel=0&modestbranding=1&playsinline=1&iv_load_policy=3&fs=1`}
            title={`${title} Trailer`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
            allowFullScreen
            className="absolute inset-0 h-full w-full border-0"
          />
        </div>
      </div>

      {/* Soft bottom cue */}
      <div
        className={`absolute inset-x-0 bottom-0 z-20 flex justify-center pb-5 transition-opacity duration-500 ${
          chromeVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <p className="rounded-full border border-white/10 bg-black/50 px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-white/55 backdrop-blur-sm">
          Esc to exit theater
        </p>
      </div>
    </div>,
    document.body,
  );
}

function MarkButton({
  item,
  saved,
  toggle,
}: {
  item: Media;
  saved: boolean;
  toggle: (item: Pick<Media, 'id' | 'media_type'>) => void;
}) {
  const { user, loading } = useAuth();

  // Bookmark only for signed-in users
  if (loading || !user) return null;

  return (
    <button
      aria-label={
        saved
          ? `Remove ${item.title} from My List`
          : `Add ${item.title} to My List`
      }
      data-testid={`button-save-${item.media_type}-${item.id}`}
      onClick={() => toggle(item)}
      className={`absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-black/55 text-white backdrop-blur transition hover:border-primary hover:bg-primary ${
        saved ? 'bg-primary' : ''
      }`}
    >
      <Bookmark className={`h-4 w-4 ${saved ? 'fill-current' : ''}`} />
    </button>
  );
}

function MediaCard({
  item,
  saved,
  toggle,
  onRemove,
  showProgress = false,
}: {
  item: Media;
  saved?: boolean;
  toggle?: (item: Pick<Media, 'id' | 'media_type'>) => void;
  onRemove?: (item: Pick<Media, 'id' | 'media_type'>) => void;
  showProgress?: boolean;
}) {
  const href =
    item.media_type === 'movie' ? `/movie/${item.id}` : `/tv/${item.id}`;
  const progress = showProgress ? getWatchProgress(item) : 0;

  return (
    <motion.div
      data-testid={`card-media-${item.media_type}-${item.id}`}
      className="cinema-media-card min-w-0"
      initial={{ opacity: 0, y: 40, scale: 0.96 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -8, scale: 1.03, transition: { duration: 0.25 } }}
      whileTap={{ scale: 0.97 }}
    >
      <div className="cinema-poster-shell group relative aspect-[2/3] overflow-hidden rounded-xl border border-white/8">
        {toggle && (
          <MarkButton item={item} saved={!!saved} toggle={toggle} />
        )}
        {onRemove && (
          <button
            onClick={() => onRemove(item)}
            className="absolute left-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-black/60 text-white backdrop-blur transition hover:border-red-500 hover:bg-red-600"
            aria-label="Remove from history"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}

        <Link
          href={href}
          aria-label={`View ${item.title}`}
          data-testid={`link-media-${item.media_type}-${item.id}`}
          className="block h-full"
        >
          <Poster item={item} />
        </Link>

        <div className="cinema-shine" />

        <Link
          href={href}
          className="absolute inset-x-0 bottom-0 z-[2] bg-gradient-to-t from-black via-black/70 to-transparent px-2 sm:px-3.5 pb-2.5 sm:pb-4 pt-10 sm:pt-16 text-white opacity-100 sm:opacity-0 transition-all duration-500 sm:group-hover:opacity-100"
        >
          <span className="text-[11px] sm:text-[13px] font-semibold leading-tight line-clamp-2">
            {item.title}
          </span>
        </Link>

        {/* Resume progress line – where the user left off */}
        {showProgress && (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] h-1.5 bg-black/50"
            aria-hidden
          >
            <div
              className="h-full rounded-r-full bg-[hsl(353_78%_55%)] shadow-[0_0_10px_rgba(220,38,80,0.75)] transition-[width] duration-300"
              style={{
                width: `${progress > 0 ? Math.max(progress, 2) : 0}%`,
                opacity: progress > 0 ? 1 : 0,
              }}
            />
          </div>
        )}
      </div>

      <div className="flex items-start justify-between gap-1.5 sm:gap-2 pt-2 sm:pt-3.5">
        <Link
          href={href}
          className="line-clamp-1 text-[13px] sm:text-[15px] font-semibold text-foreground transition-all duration-300 hover:translate-x-1 hover:text-primary"
        >
          {item.title}
        </Link>

        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
          {year(item.release_date)}
        </span>
      </div>

      <motion.div
        className="mt-1.5 flex items-center gap-1.5 font-mono text-[12px] text-red-500"
        whileHover={{ x: 3 }}
      >
        <Star className="h-3.5 w-3.5 fill-red-500 text-red-500" />
        {item.vote_average ? item.vote_average.toFixed(1) : 'NR'}
      </motion.div>
    </motion.div>
  );
}

function Rail({
  title,
  eyebrow,
  items,
  saved,
  toggle,
  href,
  showProgress = false,
}: {
  title: string;
  eyebrow?: string;
  items?: Media[];
  saved: string[];
  toggle: (item: Pick<Media, 'id' | 'media_type'>) => void;
  href?: string;
  showProgress?: boolean;
}) {
  const cleanItems = uniqueMedia(items || []);

  return (
    <section className="space-y-5">
      <div className="flex items-end justify-between border-b border-white/10 pb-3">
        <div>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            {eyebrow || 'Curated for tonight'}
          </p>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-foreground sm:text-2xl md:text-3xl">
            {title}
          </h2>
        </div>
        {href && (
          <Link
            href={href}
            className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.12em] text-muted-foreground transition hover:text-foreground"
          >
            See all
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>

      {cleanItems.length ? (
        <div className="stagger-grid grid grid-cols-2 min-[400px]:grid-cols-3 gap-x-2.5 gap-y-5 sm:grid-cols-4 sm:gap-y-6 lg:grid-cols-6">
          {cleanItems.map(item => (
            <MediaCard
              key={mediaKey(item)}
              item={item}
              saved={saved.includes(mediaKey(item))}
              toggle={toggle}
              showProgress={showProgress}
            />
          ))}
        </div>
      ) : (
        <QueryMessage />
      )}
    </section>
  );
}

/* =========================================================
   SHELL – Bigger & Bolder Navbar
   ========================================================= */

/** Navbar account buttons — Sign in / Sign up or Profile + avatar */
function AuthNavActions() {
  const { user, loading } = useAuth();
 
  if (loading) {
    return (
      <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-2xl bg-white/5">
        <span className="h-4 w-4 animate-pulse rounded-full bg-white/20" />
      </div>
    );
  }
 
  if (user) {
    const initial =
      (user.user_metadata?.full_name as string)?.[0]?.toUpperCase() ||
      user.email?.[0]?.toUpperCase() ||
      'U';
    return (
      <Link
        href="/profile"
        aria-label="Profile"
        className="flex h-10 sm:h-12 items-center gap-2 rounded-2xl border-0 bg-white/10 px-2.5 sm:px-3 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-md transition hover:bg-white/16"
      >
        <span className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary">
          {initial}
        </span>
        <span className="hidden max-w-[100px] truncate text-[13px] font-semibold sm:inline">
          {(user.user_metadata?.full_name as string) || user.email}
        </span>
      </Link>
    );
  }
 
  return (
    <>
      <Link
        href="/sign-in"
        className="flex h-10 sm:h-12 items-center rounded-2xl border-0 bg-white/10 px-2.5 sm:px-4 text-[12px] sm:text-[13px] font-semibold text-foreground backdrop-blur-md transition hover:bg-white/16"
      >
        Sign in
      </Link>
      <Link
        href="/sign-up"
        className="hidden sm:flex h-10 sm:h-12 items-center rounded-2xl bg-primary px-2.5 sm:px-4 text-[12px] sm:text-[13px] font-semibold text-primary-foreground transition hover:brightness-110"
      >
        Sign up
      </Link>
    </>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [menu, setMenu] = useState(false);
 
  // Always start at the top when opening a movie / any new page
  useEffect(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [location]);
 
  const nav = [
    { href: '/', label: 'Tonight', icon: Clapperboard },
    { href: '/movies', label: 'Movies', icon: Film },
    { href: '/tv-shows', label: 'Series', icon: Tv },
    { href: '/anime', label: 'Anime', icon: Sparkles },
    { href: '/genres', label: 'Genres', icon: List },
  ];
 
  return (
    <div
      className="min-h-[100dvh] bg-background"
      style={{
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif',
      }}
    >
      <header
        className="fixed inset-x-0 top-0 z-40 border-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 100%), rgba(12, 12, 16, 0.75)',
          backdropFilter: 'blur(24px) saturate(140%)',
          WebkitBackdropFilter: 'blur(24px) saturate(140%)',
          boxShadow: '0 8px 28px rgba(0,0,0,0.18)',
        }}
      >
        <div className="mx-auto flex h-14 sm:h-16 md:h-[72px] lg:h-[80px] max-w-[1480px] items-center gap-2 px-3 sm:gap-4 sm:px-5 lg:gap-6 lg:px-10">
          <Link href="/" className="flex min-w-0 shrink-0 items-center gap-2 group">
            <span className="shrink-0 transition group-hover:scale-105 group-hover:brightness-110">
              <BrandLogo size={32} className="sm:hidden" />
              <BrandLogo size={48} className="hidden sm:block lg:hidden" />
              <BrandLogo size={56} className="hidden lg:block" />
            </span>
            <span className="hidden xs:inline text-base sm:text-lg font-semibold tracking-tight text-foreground min-[380px]:inline">
              Cine <span className="text-primary">Stream</span>
            </span>
          </Link>

          <nav className="hidden lg:flex lg:items-center lg:gap-1">
            {nav.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={
                  location === href
                    ? 'flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-[14px] font-semibold tracking-tight bg-white/18 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]'
                    : 'flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-[14px] font-semibold tracking-tight text-white/70 transition-all duration-200 hover:bg-white/10 hover:text-foreground'
                }
              >
                <Icon className={location === href ? 'h-[17px] w-[17px] text-primary' : 'h-[17px] w-[17px]'} />
                {label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-2">
            <Link
              href="/search"
              aria-label="Search"
              className="flex h-10 w-10 sm:h-11 sm:w-auto shrink-0 items-center justify-center gap-2 rounded-xl sm:rounded-2xl border-0 bg-white/10 px-0 sm:px-4 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-md transition hover:bg-white/16 sm:min-w-[160px]"
            >
              <Search className="h-4.5 w-4.5 sm:h-5 sm:w-5 shrink-0 stroke-[2.5]" />
              <span className="hidden text-[15px] font-semibold tracking-tight sm:inline">
                Search
              </span>
            </Link>

            <Link
              href="/my-list"
              aria-label="My List"
              className="hidden sm:flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-2xl border-0 bg-white/10 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-md transition hover:bg-white/16"
            >
              <Bookmark className="h-5 w-5 stroke-[2.25]" />
            </Link>
            <Link
              href="/history"
              aria-label="Watch History"
              className="hidden sm:flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-2xl border-0 bg-white/10 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-md transition hover:bg-white/16"
            >
              <History className="h-5 w-5 stroke-[2.25]" />
            </Link>
            <AuthNavActions />
          </div>
        </div>

      </header>
 
      <main
        className={`animate-fade-in mx-auto max-w-[1480px] px-3 sm:px-5 lg:px-10 ${!['/search', '/sign-in', '/sign-up'].includes(location) ? 'pt-16 sm:pt-20 lg:pt-24 pb-24 lg:pb-16' : 'pt-16 sm:pt-20 lg:pt-24 pb-16'}`}
        key={location}
      >
        {children}
      </main>
 

      {/* Mobile bottom tab bar — Netflix-style */}
      {!['/search', '/sign-in', '/sign-up'].includes(location) && (
        <nav
          className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 lg:hidden safe-bottom"
          style={{
            background: 'rgba(8, 4, 4, 0.92)',
            backdropFilter: 'blur(20px) saturate(160%)',
            WebkitBackdropFilter: 'blur(20px) saturate(160%)',
            paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))',
          }}
          aria-label="Primary"
        >
          <div className="mx-auto flex h-14 max-w-[1480px] items-stretch justify-around px-1">
            {[
              { href: '/', label: 'Home', icon: Clapperboard },
              { href: '/movies', label: 'Movies', icon: Film },
              { href: '/tv-shows', label: 'Series', icon: Tv },
              { href: '/anime', label: 'Anime', icon: Sparkles },
              { href: '/my-list', label: 'My List', icon: Bookmark },
            ].map(({ href, label, icon: Icon }) => {
              const active = location === href || (href !== '/' && location.startsWith(href));
              return (
                <Link
                  key={href}
                  href={href}
                  className={
                    active
                      ? 'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-primary'
                      : 'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-white/50 transition active:text-white/80'
                  }
                >
                  <Icon className={active ? 'h-[22px] w-[22px]' : 'h-5 w-5'} strokeWidth={active ? 2.4 : 2} />
                  <span className="truncate text-[10px] font-semibold tracking-wide">{label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}

      <footer className="border-t border-white/10 px-4 py-6 sm:px-5 sm:py-10 lg:px-10">
        <div className="mx-auto max-w-[1480px]">
          {/* Brand row */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2.5">
              <BrandLogo size={28} />
              <div>
                <p className="text-[15px] font-semibold tracking-tight text-foreground">
                  Cine Stream
                </p>
                <p className="text-[12px] text-white/40">
                  A quiet place for a great watch.
                </p>
              </div>
            </div>
            <p className="text-[12px] text-white/35">
              This product uses the TMDB API but is not endorsed or certified by
              TMDB.
            </p>
          </div>
 
          {/* Link columns */}
          <div className="mt-6 grid grid-cols-2 gap-6 sm:mt-8 sm:grid-cols-3 sm:max-w-lg sm:gap-8">
            <div>
              <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-white/50">
                Browse
              </p>
              <ul className="space-y-2 text-[13px] text-white/60">
                <li>
                  <Link href="/movies" className="transition hover:text-foreground">
                    Movies
                  </Link>
                </li>
                <li>
                  <Link href="/tv-shows" className="transition hover:text-foreground">
                    TV Shows
                  </Link>
                </li>
                <li>
                  <Link href="/anime" className="transition hover:text-foreground">
                    Anime
                  </Link>
                </li>
                <li>
                  <Link href="/genres" className="transition hover:text-foreground">
                    Genres
                  </Link>
                </li>
              </ul>
            </div>
 
            <div>
              <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-white/50">
                Your library
              </p>
              <ul className="space-y-2 text-[13px] text-white/60">
                <li>
                  <Link href="/my-list" className="transition hover:text-foreground">
                    My List
                  </Link>
                </li>
                <li>
                  <Link href="/history" className="transition hover:text-foreground">
                    Watch History
                  </Link>
                </li>
                <li>
                  <Link href="/search" className="transition hover:text-foreground">
                    Search
                  </Link>
                </li>
                <li>
                  <Link href="/profile" className="transition hover:text-foreground">
                    Profile
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-white/50">
                Support
              </p>
              <ul className="space-y-2 text-[13px] text-white/60">
                <li>
                  <a href="mailto:sameedb08@gmail.com" className="transition hover:text-foreground">
                    Contact us
                  </a>
                </li>
                <li>
                  <Link href="/about" className="transition hover:text-foreground">
                    Help Center
                  </Link>
                </li>
                <li>
                  <Link href="/about" className="transition hover:text-foreground">
                    Terms of Service
                  </Link>
                </li>
              </ul>
            </div>
          </div>
 
          {/* Bottom bar */}
          <div className="mt-10 flex flex-col gap-2 border-t border-white/8 pt-5 text-[12px] text-white/35 sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} Cine Stream. All rights reserved.</p>
            <p className="text-white/30">
              Built for discovery · Guest-first by default
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
/* =========================================================
   PAGE INTRO – Bigger text
   ========================================================= */

function PageIntro({
  kicker,
  title,
  copy,
}: {
  kicker: string;
  title: string;
  copy: string;
}) {
  return (
    <div className="max-w-2xl">
      <p
        className="hidden sm:block text-[13px] font-semibold tracking-[-0.01em] sm:text-[14px]"
        style={{
          color: 'hsl(353 78% 62%)',
          letterSpacing: '0.01em',
        }}
      >
        {kicker}
      </p>

      <h1 className="mt-2 text-[1.65rem] font-semibold leading-[1.15] tracking-[-0.025em] text-foreground sm:text-[2.15rem] md:text-[2.5rem] lg:text-[2.75rem]">
        {title}
      </h1>

      <p className="mt-3 text-[15px] font-normal leading-[1.55] text-muted-foreground sm:mt-4 sm:text-base md:text-[17px]">
        {copy}
      </p>
    </div>
  );
}

/* =========================================================
   HOME
   ========================================================= */
function Home() {
  const [trendingPage, setTrendingPage] = useState(1);
  const [popularPage, setPopularPage] = useState(1);
  const [topRatedPage, setTopRatedPage] = useState(1);
  const [nowPlayingPage, setNowPlayingPage] = useState(1);
  const [upcomingPage, setUpcomingPage] = useState(1);
  const [tvPage, setTvPage] = useState(1);

  const [trendingItems, setTrendingItems] = useState<Media[]>([]);
  const [popularItems, setPopularItems] = useState<Media[]>([]);
  const [topRatedItems, setTopRatedItems] = useState<Media[]>([]);
  const [nowPlayingItems, setNowPlayingItems] = useState<Media[]>([]);
  const [upcomingItems, setUpcomingItems] = useState<Media[]>([]);
  const [tvItems, setTvItems] = useState<Media[]>([]);
  const [heroIndex, setHeroIndex] = useState(0);
  const [showHeroTrailer, setShowHeroTrailer] = useState(false);
  const [historyItems, setHistoryItems] = useState<Media[]>(() => getWatchHistory());

  const trending = useGetTrending({ page: trendingPage });
  const popularMovies = useGetDiscoverMedia({ type: 'movie', category: 'popular', page: popularPage });
  const topRatedMovies = useGetDiscoverMedia({ type: 'movie', category: 'top_rated', page: topRatedPage });
  const nowPlaying = useGetDiscoverMedia({ type: 'movie', category: 'now_playing', page: nowPlayingPage });
  const upcoming = useGetDiscoverMedia({ type: 'movie', category: 'upcoming', page: upcomingPage });
  const topTv = useGetDiscoverMedia({ type: 'tv', category: 'top_rated', page: tvPage });

  const { saved, toggle } = useSavedMedia();

  useEffect(() => {
    const handler = () => setHistoryItems(getWatchHistory());
    window.addEventListener('cinema-history-updated', handler);
    return () => window.removeEventListener('cinema-history-updated', handler);
  }, []);

  // Merge helpers
  useEffect(() => {
    if (!trending.data?.items) return;
    setTrendingItems(c => trendingPage === 1 ? uniqueMedia(trending.data.items) : mergeUniqueMedia(c, trending.data.items));
  }, [trending.data, trendingPage]);

  useEffect(() => {
    if (!popularMovies.data?.items) return;
    setPopularItems(c => popularPage === 1 ? uniqueMedia(popularMovies.data.items) : mergeUniqueMedia(c, popularMovies.data.items));
  }, [popularMovies.data, popularPage]);

  useEffect(() => {
    if (!topRatedMovies.data?.items) return;
    setTopRatedItems(c => topRatedPage === 1 ? uniqueMedia(topRatedMovies.data.items) : mergeUniqueMedia(c, topRatedMovies.data.items));
  }, [topRatedMovies.data, topRatedPage]);

  useEffect(() => {
    if (!nowPlaying.data?.items) return;
    setNowPlayingItems(c => nowPlayingPage === 1 ? uniqueMedia(nowPlaying.data.items) : mergeUniqueMedia(c, nowPlaying.data.items));
  }, [nowPlaying.data, nowPlayingPage]);

  useEffect(() => {
    if (!upcoming.data?.items) return;
    setUpcomingItems(c => upcomingPage === 1 ? uniqueMedia(upcoming.data.items) : mergeUniqueMedia(c, upcoming.data.items));
  }, [upcoming.data, upcomingPage]);

  useEffect(() => {
    if (!topTv.data?.items) return;
    setTvItems(c => tvPage === 1 ? uniqueMedia(topTv.data.items) : mergeUniqueMedia(c, topTv.data.items));
  }, [topTv.data, tvPage]);

  const heroMovies = uniqueMedia([
    ...trendingItems,
    ...popularItems,
    ...topRatedItems,
    ...nowPlayingItems,
  ]);

  useEffect(() => {
    // Pause slideshow while trailer is open so the title stays put
    if (showHeroTrailer || heroMovies.length <= 1) return;
    const timer = window.setInterval(() => {
      setHeroIndex(current => {
        let next = Math.floor(Math.random() * heroMovies.length);
        while (heroMovies.length > 1 && next === current) {
          next = Math.floor(Math.random() * heroMovies.length);
        }
        return next;
      });
    }, 6000);
    return () => window.clearInterval(timer);
  }, [heroMovies.length, showHeroTrailer]);

  const hero = heroMovies[heroIndex] || heroMovies[0];

  const heroVideos = useGetVideos(
    hero?.media_type || 'movie',
    hero?.id || 0,
    { query: { enabled: !!hero?.id } },
  );
  const heroTrailer = pickBestTrailer(heroVideos.data || []);

  // Auto load more for each rail
  useEffect(() => {
    // Soft target of 12 items per rail to avoid TMDB rate-limit spam on mount
    if (trendingItems.length < 12 && !trending.isFetching && (trending.data?.total_pages || 1) > trendingPage) {
      setTrendingPage(p => Math.min(p + 1, trending.data?.total_pages || p));
    }
  }, [trendingItems.length, trending.isFetching, trending.data?.total_pages, trendingPage]);

  useEffect(() => {
    if (popularItems.length < 12 && !popularMovies.isFetching && (popularMovies.data?.total_pages || 1) > popularPage) {
      setPopularPage(p => Math.min(p + 1, popularMovies.data?.total_pages || p));
    }
  }, [popularItems.length, popularMovies.isFetching, popularMovies.data?.total_pages, popularPage]);

  useEffect(() => {
    if (topRatedItems.length < 12 && !topRatedMovies.isFetching && (topRatedMovies.data?.total_pages || 1) > topRatedPage) {
      setTopRatedPage(p => Math.min(p + 1, topRatedMovies.data?.total_pages || p));
    }
  }, [topRatedItems.length, topRatedMovies.isFetching, topRatedMovies.data?.total_pages, topRatedPage]);

  useEffect(() => {
    if (nowPlayingItems.length < 12 && !nowPlaying.isFetching && (nowPlaying.data?.total_pages || 1) > nowPlayingPage) {
      setNowPlayingPage(p => Math.min(p + 1, nowPlaying.data?.total_pages || p));
    }
  }, [nowPlayingItems.length, nowPlaying.isFetching, nowPlaying.data?.total_pages, nowPlayingPage]);

  useEffect(() => {
    if (upcomingItems.length < 12 && !upcoming.isFetching && (upcoming.data?.total_pages || 1) > upcomingPage) {
      setUpcomingPage(p => Math.min(p + 1, upcoming.data?.total_pages || p));
    }
  }, [upcomingItems.length, upcoming.isFetching, upcoming.data?.total_pages, upcomingPage]);

  useEffect(() => {
    if (tvItems.length < 12 && !topTv.isFetching && (topTv.data?.total_pages || 1) > tvPage) {
      setTvPage(p => Math.min(p + 1, topTv.data?.total_pages || p));
    }
  }, [tvItems.length, topTv.isFetching, topTv.data?.total_pages, tvPage]);

  return (
    <div className="space-y-10 sm:space-y-14">
      {showHeroTrailer && heroTrailer && hero && (
        <TrailerModal
          videoKey={heroTrailer.key}
          title={hero.title}
          onClose={() => setShowHeroTrailer(false)}
        />
      )}

      {/* HERO – brighter image + soft ambient background */}
      <section
        className="relative -mx-3 sm:-mx-5 min-h-[380px] sm:min-h-[480px] md:min-h-[560px] lg:min-h-[620px] overflow-hidden border-b border-white/10 lg:-mx-10"
        style={{
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif',
        }}
      >
        {/* Soft ambient background (always present) */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_80%,hsl(353_71%_40%/.25),transparent_50%),radial-gradient(ellipse_at_85%_15%,hsl(220_60%_35%/.2),transparent_45%),linear-gradient(160deg,hsl(222_28%_8%),hsl(222_24%_12%)_40%,hsl(222_22%_6%))]" />

        {hero?.backdrop_path ? (
          <img
            src={poster(hero.backdrop_path, 'original')}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-center opacity-100 transition-opacity duration-700"
          />
        ) : null}

        {/* Light readability overlays – image stays filled & vivid */}
        <div className="absolute inset-0 bg-gradient-to-r from-background/45 via-background/10 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-background/70 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-transparent" />

        <div className="relative flex min-h-[380px] sm:min-h-[480px] md:min-h-[560px] lg:min-h-[620px] max-w-2xl flex-col justify-end px-4 pb-10 sm:px-5 sm:pb-14 lg:px-10 lg:pb-20">
          <h1 className="max-w-xl text-[1.75rem] font-semibold leading-[1.1] tracking-[-0.02em] text-white drop-shadow-[0_2px_24px_rgba(0,0,0,0.35)] sm:text-[2.5rem] md:text-[3.1rem] lg:text-[3.75rem]">
            {hero?.title || 'Something worth staying up for.'}
          </h1>
          <p className="mt-3 sm:mt-5 max-w-lg text-[14px] sm:text-[16px] font-normal leading-[1.55] text-white/85 md:text-[17.5px] line-clamp-3 sm:line-clamp-none">
            {hero?.overview ||
              'A handpicked stream of films and series for the hours when everything else goes quiet.'}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={
                hero
                  ? `/${hero.media_type === 'movie' ? 'movie' : 'tv'}/${hero.id}`
                  : '/movies'
              }
              className="flex items-center gap-2 rounded-xl sm:rounded-2xl bg-primary px-4 py-2.5 sm:px-6 sm:py-3.5 text-[12px] sm:text-[13px] font-semibold tracking-wide text-primary-foreground shadow-lg shadow-primary/30 transition hover:brightness-110 min-h-11"
            >
              <Play className="h-4.5 w-4.5 fill-current" />
              Explore title
            </Link>
            {heroTrailer && (
              <button
                type="button"
                onClick={() => setShowHeroTrailer(true)}
                data-testid="button-hero-trailer"
                className="flex items-center gap-2 rounded-xl sm:rounded-2xl border border-white/25 bg-white/10 px-4 py-2.5 sm:px-6 sm:py-3.5 text-[12px] sm:text-[13px] font-semibold tracking-wide text-white backdrop-blur-md transition hover:bg-white/18 min-h-11"
              >
                <Clapperboard className="h-4.5 w-4.5" />
                Trailer
              </button>
            )}
            <Link
              href="/my-list"
              className="flex items-center gap-2 rounded-xl sm:rounded-2xl border border-white/25 bg-white/10 px-4 py-2.5 sm:px-6 sm:py-3.5 text-[12px] sm:text-[13px] font-semibold tracking-wide text-white backdrop-blur-md transition hover:bg-white/18 min-h-11"
            >
              <Bookmark className="h-4.5 w-4.5" />
              My List
            </Link>
          </div>
        </div>
      </section>
      {/* Supabase Continue Watching */}
      {/* Continue Watching */}

      {/* Continue Watching */}
      {historyItems.length > 0 && (
        <Rail
          title="Continue watching"
          eyebrow="Pick up where you left off"
          items={historyItems.slice(0, 12)}
          saved={saved}
          toggle={toggle}
          href="/history"
          showProgress
        />
      )}

      {/* More Categories */}
      <Rail
        title="Trending after dark"
        eyebrow="The room is filling up"
        items={trendingItems}
        saved={saved}
        toggle={toggle}
        href="/movies"
      />

      <Rail
        title="Popular right now"
        eyebrow="A reliable first choice"
        items={popularItems}
        saved={saved}
        toggle={toggle}
        href="/movies"
      />

      <Rail
        title="Top Rated"
        eyebrow="Critically acclaimed"
        items={topRatedItems}
        saved={saved}
        toggle={toggle}
        href="/movies"
      />

      <Rail
        title="In Theaters"
        eyebrow="Now playing near you"
        items={nowPlayingItems}
        saved={saved}
        toggle={toggle}
        href="/movies"
      />

      <Rail
        title="Coming Soon"
        eyebrow="Worth the wait"
        items={upcomingItems}
        saved={saved}
        toggle={toggle}
        href="/movies"
      />

      <Rail
        title="The long way home"
        eyebrow="Series with somewhere to go"
        items={tvItems}
        saved={saved}
        toggle={toggle}
        href="/tv-shows"
      />
    </div>
  );
}
/* =========================================================
   BROWSE
   ========================================================= */

const BRAND_LOGO_SRC =
  'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB2aWV3Qm94PSIwIDAgMjU2IDI1NiIgd2lkdGg9IjI1NiIgaGVpZ2h0PSIyNTYiPgogIDxpbWFnZSB3aWR0aD0iMjU2IiBoZWlnaHQ9IjI1NiIgaHJlZj0iZGF0YTppbWFnZS9wbmc7YmFzZTY0LGlWQk9SdzBLR2dvQUFBQU5TVWhFVWdBQUFRQUFBQUVBQ0FJQUFBRFRFRDh4QUFBQUlHTklVazBBQUhvbUFBQ0FoQUFBK2dBQUFJRG9BQUIxTUFBQTZtQUFBRHFZQUFBWGNKeTZVVHdBQUFBR1lrdEhSQUQvQVA4QS82QzlwNU1BQUFBSGRFbE5SUWZxQ0E0T0lUYmlId1BHQUFCdWYwbEVRVlI0MnUyOVo0QWwyVkVtK3NVNW1YbHQrZXF1OXQ1TzkzaHZOQm9qTDRTRUUwNndMT3p5c0UvdkllempMVnBnV1JiaFdRR0xFVHlNQUlHMGdBeGlKSVQ4ak1acGJNOTBUM3RYM2wrYm1lZWNlRDlPbnJ4NXE3cDZlbnpQZE1aY3RjcmN1aVp2Ukp5SUw3NklBSExKSlpkY2Nza2xsMXh5eVNXWFhITEpKWmRjY3NrbGwxeHl5U1dYWEhMSkpaZGNjc2tsbDF4eXlTV1hYSExKSlpkY2Nza2xsMXh5eVNXWFhITEpKWmRjY3NrbGwxeHl5U1dYWEhMSkpaZGNjc2tsbDF4eXlTV1hYSExKSlpkY2Nza2xsMXh5eVNXWFhITEpKWmRjY3NrbGwxeHl5U1dYWEhMSkpaZGNjc25sTlNtMDdBdXM4Qk55UDZHVjc1UEw4NzcrdWJ4TWw1c3Y0T292dWR1RkNIYy9JT2ZYT2plQWkrMHFzOU5zNmxaMGVyNzJrOVgrQzdTWjNFNXlBM2psTC9HTEdNTnd4cnF3Z2pueGVlMkhuOWVCa3h0QUxoZms3ODhmMHkvMzduUmhTcjlFb2JNYXZPUkJ6cS94UzFTZmN3UEk1WVdIK1BSc21TNmZLNTA5NS8zNTJUNmtKU2NBVnRCc1hMQkpYR29IUW00QUw4blZYSDRJckdRVmRNR2ZDaTFUMzZ6V1hyZ1g1K2RpRDYvNVl5RTNnSmZxYXRMS1owTFdLdWpDVGhKNk5vWG04MFpLV0VHaGVlV0lpTS83aDdrQjVMS2l2dEo1azExYStSQ2dsV01lT3Bmanh3WEhPU3Q5ZXg2eldla2M0SE9kUmJrQjVDNy9mRzZlbmJOZkV2M1RCVHpPU25mamxWRWRyS0NqZkM3dFgrbGtPSTlGY1c0QXVWeTQ5cC9UMzlNRmhFelpBNEc2ZFhxRnB5TVFHQUF6QVNBWVBwOE44QVZZeFRrVjNWeEFZcDBid0NXSDl0QUtxcm1TTVp3blpGcitXMmNEUkFRaUV2WTFHRFpnQmd4Z1hFQnY3eXpjSHdxQWlBaGdJZ1lNczJIbWpLSXYvK0k4L3A2ZjdWaklEZURTY3Z6UEtiNC8vMm13VE5lZEtoTUpJc0hNekRHZ25Mb2JvQWdFUUtGWURJb0Y2WG1CSnozUFkwQXJwWlVLWXhXMTIrMHdpb0RJV2F3UGVJQUhDQ0lEYUdiZGJRTkw3T0g4QndWV3Jrem5CbkNwR0FDZDl4Q2didTEvMWwvWmJ5VkJraUJtelJ3Q0NnQlFFV0pvYUhEOWh2VTcxbzVzWDd0MjdlREFTTGs0NUhsOW5peEpXVkE2TVBCOGp3bEc2WWhWVzZCbGVENktwOXZoK1B6aTZabVpvMVBUSjhhblI4ZkhweGNXRzRBRUFpQUFTQWpGckpuTkNzYXcvTi9jQUhJYldKSFNzMUlrY3g1L2I3K1FnQlNDakltQkVEREFjTEd3ZmR2V3E3WnZ1MnJUK3YyRGcxdUVIR0RoTHk3eTFDem01bWx1VnRlYXV0azBVV1NVTm13RUVSR0JoRFVqS2hSRnFTd3JaZGxiNGFFZVdyVTZybFJtR2MrMG1vK2RIWDNvNUtuSFRwNDZNVEhWQkR5Z0NKQWd4ZERMWWlSMmNmOUtKOENyTnhiS0RlQ0YrbjVlT2J3NXAvWXYvNkVBUEVHQ0VURzNnUURZdW5ia3BzdjJ2dTZ5dlRjTUQyMkpkR0ZzSEVlUDY3UGowZHhjM0d3YXBZd1FFQktlaEJRUUFpUkFCRUdDS0hsVnpHeU1NWVlOdzJob1RjeUNoQXc4djFJdERBL1QyaEZhdDZyVzEvTjRyTDV5NnV5L0h6ejQwSkdqaTlxVWdBS1JBUlNmSTd2STZyMTVObndwTjREWFd0YUxDMGg4NlZteTJLNXZyZW9id3cyQWdLMXJWci9seHV2ZnVuLy9kWDR3T0RxT1EwZWk0eWRiVXpOeEZNSHo0VXZoU1JJU2dvakFEQUtJd001aFU1THZKcStVTFFSRXFhR1NmUnRzRExSaHJRVk1VQ29XVnczTDdkdlY1ZzBIUFBrdng0NSs0dUZISGpzenFvRWVBRUpFeGhpbjd0bkl4MXdBaVBTcW9GVGtCdkI4TGhhdHdPZWhidFIvdWU5UHY1VkVQbEZzVEIzb0Q0TFhYM2ZOZDl4MDNWMURxNGRPbk5aZmY2eHg1SGhVYjdBZ0JMN3dQUkNCUVd3c21HT2ZoTWlxTm1YMVQxakVCOHljdmhZUUVndmhSREd0QUFTampXNUhKbzU4MzYrdVhSdGN0cWV4ZmZPWGFndC9kdi85bno5d3FHNU1CUkJFa2N1Vmx5Zkt5M01ENmphVjNBQmVzOUFublJmdFdXSU1uVUNmeUFkQzVpYXdaYUR2VzIrNjRYc3V2MkpmRk9IQlIrcFBIbW90MXRqM0tBaklrMlJzTko0OHNJQkY5eE00TlB0U09BbDhJQzNpQ1FhSUU0ZHZ6Y2YrQndZeElKTW9DU0EyVEJCRVlCMUdLbGJGWXFGdisxYXhiK2NqdlQxLzl1UlRILzNhQTNOUjNFdGtnTmhseWJ3c0xscHVBSytXV0NnM2dPZC92ZWk4MnI4OEhCSkFRQlF4MTRHOUk2di80MXZmK0o3dDI5WSs5blQ3dmdmcll4T2FpQW9GbGdJQWpDR25Ua3drUUNBSXExR01KT0szM3AzSS9oOERSQ1NkNGpFVHArVXhUdjdTL1FHRGt6T0NDWnlHU0FJR0FzYVlLQ2Ftdmcxcmk3ZmU4TlJneis5KzdjRi9lT0NobGphOVJCRnppc09pKzB3NHB3M2tCdkJham9LV3UzK3hndDRUNEJFcG9NNjhmZFh3ajd6akxkKzNaZXZnWTAvVnZuaGZmV2FXQXA4Q0Q4eHNqQTNXQ2E2a0M0QklFR1VlTmdubFNWRFhDY0FnSWV3cDRkU1JyTnUzZjh5QUFaT3pCeHNaTVVDQzdEbGp5MlFFa0NCRGtxT0lvcWhuL2RyeTYyOTdvTGZ5eS9kODlwNW5EcGNCanloaXppYkg1eWtnNUFid3lyOHhrY0Zxc0N4Z2ZSNFB1MUxLdTl3azdGTjdSQktZWng0dUZYL3M3Vy81b1NzdlgvMzFKMlkvLzlYbXdxSW9sc2dUWkF6WUFEQU0yRGdIMUZGYllrSE80U2UyMFhrT213a3dKMkU5MlhnSFpNRDJkT0RVSkpqWnBjZ0VBaEs5SjJjTFNZQmtEQkhzNHdrU0tncE5PeHJhdmNONzNZMGZucHI0eFgvN3d1bGF2YzlsQmFZYkllVm5xNXJsQnZEU3ZwTlU3UVFCREFQb0M3ajYxa09iODk2VFZuNDZXc0VNN0MwZ2FqTXI0RHR1dStVWDdyaDl4NkVqTTUvN1VtTjJUcGJMa0lLMVFaS3VKcUY2Sm9qb2NIK0VVM3ViM3lZQlA1R05mektHWU85RUJETHAvWmpoSGhwcHdHUGpudzVZNDRCLzl4cllIU3RNQkVHNkhYcENyTDd4bXJITGR2emN2Vi83bTBlZnJCQ0lFV1lNd0R4YkZUazNnSmN3R3JHUW9pUVlSdXl1dUFENmZYOVZJUmoydkNySnNpQ1BvUXlIeHRTTm5sZHFNbzVudElvemp5bFhzSVNWMEU4NlY4Qmp2L1ZBUkZoZzNyOSs3Zi80MW5lOVRkUENKKytaTzNGU2xzb2tCWXdoRitNZ0JXY1NSZW9jQStucFJjNzNVeG9pQVp3b2ZSSU5rZE4vQy91WXhEeUltTk0za0ViOGxFQ2x6TW5kay9RaU1Zc2tQa3JpS0NFRVNLaFd1MmZWWU04YmJ2K3ptZG1mdmVmZkduRlVJbXE3ek5pY2wxYkV1UUc4NkMrNkE2VVRNYlAxUm9HZ0hiMDlWL1gwN2ErVWQzaithdWF5WWNSeHFCUXpNOE1BSkFRRXhTUmlZQzZLVDdYYno0U3RSOXV0cDZJb2RFcThQRUE2VDMxM2llcGJ4eDh5eDhBUDNuN2JmN3Z4K3VwWEh6aHozMFBzZTlMM1lFd212TGR4T2hnUUpBaE1tU3BzR3VZd0V1aWZiQlRUQ2VNSllPRVljZ1NYSHlScE1YVUgrM1RPMGtaM0ViZmovN3Z2UzB3Z0lZelNwT0tSVzI5OGZNUGE3LzNVdno0NU16TW9STXNZdlN3Zk9LY3g1QWJ3NHNRNTVMeTFKTVFNQlZTRXVHYlY4QjNEQTllVlN1dTBFWXYxeFhwanB0MmVpZU1hb3c2MGlKZ1FrNGdKZ3VBSklUenBlYkxrQnoxKzBPOTUvUkJ4ckI2czFmNTVZZjV3SEMwM2c1V0F6ZzVyelgzckU4MHo3K3p2LzkxM3ZlT3Q3WER5VTU5dDFPcGVwYXlaV1J0eUlZZnorVW13M2tXQjVpU0R0YjlKZmIrTGRxakxFYmdmVUhxS0pNRlBKNHppMUpqZ0Foc2twVFIydUpIMS9sMEVhazdOcVFNM2tSQnhzelc4ZlZQanh1dS83NnYzZmZMdzRTR2kwS0ZEdkFJNmRORW1BL1FxMHZ2VXkwckFjeGQ5WTZYMHJnM3IzanJRdnlHTTVrZW56czdYNW94dUZYMVZLWnRTU1FXQjhTUUxHUU9heUJDRjJzVE1JQ2hqR3UxMkhDdGlJeGllNzVVS3dSYnBiVmI2ZUszeDRlbnBwK09RWEhyd0xJUk45OW9rSUlnV21MOXg3NjcvZGZ2clZqM3d5TmxISHVWQ21ZUmdvNW01Z3ptNmVoWW9EV2dTL05CR08wZ0RlUGNsSlFCUUp0eDNvRkR5WC9Lb2FXTEE1TTRLN3R3ek9XNUF4R3dQSE9Ja0krYU84WFNpczhRbW5BRUFBRWt2RHFPKy90N2lXKzk2N3hNSC91akJod2FJUWxjc015c1V5M0lEZVA0dlVXUUNIcDhRTTBKZ1IyL1A5KzNZOG81Q2dTZW1ENDlQemluZHFGVGkzcDVpdFJLVVNrWWtkTi9Zc0dLT21HT0dKc1RNaW9nRkthTFFHQVhTUUtSVW85RnFodTBJWEMwRSs0UEM1WkNINStmK1lHSjh4aGlaNGIxUWQrcU1ic2V2bWR2QSsrKzY4K2MyYkpqNTVEMkxzN05lc2NTczJTU0JmTXBZV0Y1a1N5SWI2amh5RjRtNG9pNFR5TEtqYlN6UFNleVRxZEtscHRQeDhFN255UjBQekNBaDdDT0NNL0VRWlhTVXdBWXBmR1FMejRhVHgyZUFwR1NsaTU0Y2VOZmJmL0hrOFYvOHdwZjZpZUlNTkhUT1F5QTNnT2NaOEZpbXBBOFFVQU4yOUZaLzZMSWRiNUdGeHZFekI2ZG02K1VDK3Z1S2ZiMWU0Q3ZEaXRrQXlrRjFpaWdHRkVNUkZITk0wQXdGdG5WTkRXS0NKckoyRXNkeDNHckg0S0JZdU1vTE50VmFmemwyOXI2d2xkckFjaktQL2FKQTFHU3VCc0dmdnZsTjN4VHI0Ly8yQmNVZzM0UFJZRGFaTERkVEtIVjZ6cDFRTy9IdUxzWkpsQytEZkxwWXZ3UCtkRDJZZXdycS9vZ3BUUmxBeklBdHJkbDB3NTBPdkRSVXNWazZPMStld2ttVXZGUWhCTE9FR1h6TFhiODJPdjZ6WDczWDJrQzJSR0JXd0lVdUhwRVhwK29McDE3MjVnRkZvallnaEhqdjVYdi94NjV0TzQ2TkhqNTI2bWpCNDQzckJ0YXNycFFydnBDK0lBZ1JBeUZ6QkNpd1loZ2lJNFFXVUlBR0dTSU54QllrSWRJRVpUZzJ4akFMS2Z4QzRKVkxERFNhellOaCsxalJmMWYvd0RxbHZ4NjJSVGNsTG5zb0ZZZ1dtTGNOREh6aW03NzV0dU1ubi9ueVYrQUhrR1MwWnBBaFloZS8yM2lqS3pLMkFVajZ5QzQ0NlJSd000V3RiSEJPblhPRVNCQXpNdlNmcERUbWlzVXBlR3IvS0xFb1Z3ZElFbXM0ZGwyS01WRlhreG02Q3hSTWdCQ2toV2dlUHZHbS9idGtmOStuejV6dElUS3ZLaThyTDM3dER3QVBxQU8zcng3K2c2djMzZDFzSDMzODBJa2c4SFp1WHIxMnBOOHZ0TU5vb3RrOHRWZ2JyZFhiWWR1d0lkL1RRa1NHV1pJV3doQXBJc1V3Qkkza1prQUdZSUptR0NJU2dnbUtXV2tESVl6MGpGTGE2SU9CZjFsdjN4NFNEemNhZEs3SXgyci85V3ZXZlBJdGIxbjMwTmVQUC9HRUxGV1YwV3dTK2hrN0JsdWkvWjI0bmh3NVo0bUdjT0tua3paR1l1NDQvcXhlRVdYQm16VEhSWnJXV3VJRGRRRCt6bDltMHVMMGFPcmtKd3pCSFN5VzBxU2xheXBSY3F3SUNORTRldkp0VjE4ZTlmVis5c3paSGlKOTBjUC9GNmx4Wm1NZWtUaFhSQXhmaUovY3YrYy9sQ3VubmpwOG1MbTZaWDExb0w5WHlKbG04NTZ6WTErZW5wa0tROHZ4NmdYS3dLcFM4WXFORzRZSCtsdGFheElLaUFITnJCZ0tyQmt4czJabUlnWFdoalhBQk1QUXpMSFd4ckFCaytmRlNwa29xaE5kRlFUUjdOeGZqNDluRFVBNjdYL2p1clVmdWZtVytONzdKOGJHdkdMSm1LUzgxUlZQZENwTkxDalZ2YVh0QkpRbXdhbEdaOEo3Y3NpT1NMREpKUDlPQzJCcGVZeGRoVXRRdGpiTkxvZW1MTkFEaDVzeW04NERaUEFnZTN5WURBV1dZQml1K2l5SUFWL1EwRnZ1L01FREIvL2tpU2NHWFgzZ25CelMvQVI0ZHNjdkFROG9FYlVZdTN1ckg3cnh1amZPMTU4OGRHeHUxWEJsMDdwQ3NWaG1mSFowN0g4ZWV1YisrWVdhMWxiRlk2Qk9OQWVjVmVyVXpPenFjckZhN1drYlkvRWY2L2dWd3dDR1lHeGlZTDJyRURZRTBNWW8xelp1bUlVUUVUUENjQXhZWGExdTFIaW0xWlR1ZFJhSkZwaS9ZZVBHajExeDVmd1h2and6T3ljS2dVb3c4U1RENUJSNnpDb2NFVmtmVDVuQ2I4SlY2M2F4SkpML1Q0NEFseHhUNStIWTJvejd2WEJCakQxWnFQdituZkl5TFR1UDB1b0JNM1YzUDFDYS9LYTRGZElFbVFGSUlzT3NUcDU1MXkwM1ByQ3dlR0Job2VyT0FUemJoTHpjQUxxMFg3cXdwMGhVWS82RzlXditaTzl1NzZtamo4M1hnbDFiQ2tQOWdxbXQ5TzhmUGZyUnMyUEtHRW5VQU9wQUd3amRyUTNNQXNjWEZuWU45TXRDb0FCbFlWQWc2WHdsaWhrR2tFS0EwV2kzWjJ2MStWb3RhcmM4b3d1K2IzeFBhYTIxc2Y1UEdITldxdzNGWWlHS3h1UFkrdjVGNW5lczMvRDNlL2RPM1BmZ1FyMGhmRjhiay9EMUhieVk2clJKUW9vazRFa3JXVXdkbU4zNmRYWjRacUxWamdoaHdKckJERUVzd2I0UWdSREp2eVE4SWdHR1lXTUxmZzY2c2FRZWg0dUNSQXI4STFzeW82N010MHRiT1JNcVpjclFhWGxhSkZ3OUlWUWNlNU5UYjcvNXhrK2RIWnRvdDRvWkcwQzNNVkFlQXAxSCszMGdBQnJBais3YTluLzM5Ujk4OHZCVWIwOWwzV3FTVWtoaTRGZWVPdlQxV20yUWFKRzV2b3lEYmgvSEoyb3h2MzVrMVMwN3RpOUdzUUZaeGxsc09HWm13Sk5pdHRFNE1qMHp0YmpZQ3NPSVlRQWY2QUdHZ21Cb29GLzI5U29RRzJaQ3JKU0tJaVBFZXMwUGpZOXJZK2JBYjE2MzltTjc5MDNjLzFDOTFSS2VVSm9OT3FwRUhmemV1ZFVPSHBQaHpMbUFSQUNpdzFubzhDS0lPUkJVOXJ5S0gzalNnNVJLaXBBUUFwRVF5dkw3aVFKUUVhZ0lFUWdTV3Vzd2JMZmJ6VENNbElHUVVxYjBxS1E1Z0RqVmZOSEZ1ckRQemV4NGMrVDRkTHdVeWFGT0tjSUdkVUpLSGNYRG16WThzVy9YM2YvOGlWZ3B1SUVVcHJ1TGtuTURRRGVZbVBYOUhoQUR2M0xsWmQ4bTVJTlBIek1iMWhVRysrSW9qaGpsd1B2RFk4ZStNRE5YSnBwaERqT3E3d0ZsSUFDa2UxY3gwRmNzdk8yeXZUR0paSlFJUVRFTU14RWRuSmg4WW5RME5JYmNuMlJQNmlLd0pnaUdONnlINTJ1bE5Kc29pbzB4Z1JDaTJYcDRidmJPb2VGLzJuUFo1S09QTHphYjBwYzZZVEk3ZUQwSjBDM25YbVNDSUVhbkJnWkhZYkFKSnBQRko4RUtob21xbmpkUUtCU0x4VWpLc3hCSFZIUThqazRyTlI3SDAxbzFqQTROVzJaeVFGUWdLZ3F4eXZmWEJNSEdvTEN6Vk5sV0tXOGtVUTdiVWEzZXFOWERLR0lwU0hvdVA4bkFPOHkyVGNDRlcwdlIyaFFMNWV3aDBhbTR1YmdMSktYVVlUUnk3ZVVmNmEyKzUxLyt0Y2NWeU13S3pmV1h0QUVzMFg3cHB0WVE0VGV2dnZ5Tm9Ycmd4S2pjdkw3UVU0NlZiaHRUa3Q2bnh5Zis0c3laS21HU0VRRUNNRUFBckFiS0FBTUtZQnZyQXpGUUVPTHQreTVERU1TR0xRUkVSSWJObDQ0ZFB6Mi9JTndqbUhPOU9JK3hxVlFjV2I4aDBrcHJ6WXc0am53U0tvNHJiUDczL2l2VjF4K2JxdFU4VHlwbWgwc3l1K2hmSU0xUVhkb0s3dkFhS1BuT1V0bUlFMGFUTVNhUVlxQllMQlZLczc3M0JKdjcyODFIVzgwVFVUUnZERHMzSWJvQkExcld0ZXdCRmFMMXBkSlZmZjIzRFE1Y1hxejB0WnYxeVpuYVlvM0J3dk9Jay9qZEliUmdDSEwybVowMWx5R09aaEpaUW5kdTM4bFRoQkE2amtidWZ0M1BqRTk4NE1HSEJvbWFyamhnTHI1VW1GN1p5Q2VyL1haR2pRSStlTzBWZDlUYjk0MU4rWnMyZUlHdm1CVkJDSnFONGw4NDhKVFN1ZzRzdWdkWkJheDFoNGE5S1hTd3pvcWd0MTErZVJRRWtWSVdqeWZtZnp0OFpLeFdsK2VhSExnVVptVGUxTjgvTk5DdmxRWTRqdUoySFBYNy9rZjI3Q3MvZGZEczFLVHdQR1lMa21RaUJFNVZQTUZ0UkNiM0pNZnY3ekI1UU13c1dQZEpmN0JjYlJXQ2g2SHZhZFFmYURiR3ROYUFEL2oybUxKOUxReTlBblJHZ0Vmd0hLblRLbHdCMkZBczNqWXk4dGIxNjdZUnRVNlBMbzZOUTNqaysyeTBqVzQ0a3dlN2FsbEhyK0h1UTBqNGV1eWcwYVRMd0oxcWdoM001SHQ5ZDkvNXRudnYvZHpaTTcxRVlUZHA5T0l4QVBrS1dsNFc4UEdCSXFDQjM3NWl6K3ViMGNNVE00V3RHMFhnSzZOam9oaGNFUElmem93K1ZxLzd3SUlsZmdJN2dOVVpObzdKM0FCb29PcjdPOWFzYVFrWVpnVUVudmVWWThkUEx5eEtJczNQNGhLc2MydEUwV0M1VEFTanRXRU9qZjdqUFh2V0hqOTFkSHpVODN4dDJHTDFUaTBvYlVlM0VZS3R1ckxUZmFJT1lta0RIaUxXUnZkNS9zWnFiNzIzOSs5Ti9HdnpNMysxT0g4b0NoV3puZjJXMXVCTVVzRTRoMlM1TjlyaGo1TGdFUW5DZ2xKUExDemNlM2IwRlBUYS9YdTM3TmpDODR2UlFvMThqMTIrbmVhbmxNd1lUVkx4RG1qYWFUNUl6Z3ZIVGtYbkZ3UURnaEJHc3o4emMvZDExMzV5ZEhRaERPVktKKzJsYVFCcFJVbTZTWDFsUWd5OGY4K09kMFQ4ME1TMHYzVWplVjdNUmhFcEFndHFSUEZIVHA5V3hqU0FDS2dBTzRBcTRLYzloNWtReU41YXdIQ3BzbjVvc0dGTXpBZzg3K0RrMUpQakV4TFFLeHNrdVRBajZmTmdyaFlLdmhSYTYra3crdStiTjkyNTBIanErQW5mODR3eDdIajU3QWlkbE9sQjR3UW9ZVWRoSUVFSkpVY0FCRkpzeWtKdTdlbHJWcXAvRnJkK1pXN3kzeHIxdXRFbElIQ3FiSmJBbHl1ZjRLa05tSXdsV0FSTUVFcEVCbnhpb1hidmthT1RRdTY4K2RxUm9ZSDJtVEZ0alBBOFlzUFpHcG5UYytIeWROdVk0d29UM0NrNlpNcHExR0hva1JFa1ZieTIyb05xNmJQajR4NTFOU2ZScFd3QVdlMlhMbHB0TW41cys2YnY5NG9QbmgzblRldmgrWkhWZmlBRVBDa1B6YzEvZVhiV0IrYUFIbUJyUmxQaDlGVm4zQ1FUbXNDVnExWUYxV3BiYXdocWhORlhqeDAzR1RSanlVdVNnS0FrMHJBUGJ0VW9rTExpK2FQdDFuY05ENzlYK284Y2ZFWjZIcnNXTGs3QStDdzREOU9kSTNZb254bU5JZkNtY2pYb0cvd0wxWDcvN09SWFdpMFlMbVdjUFhkellMa2JQaExkZU9MeVRsenVidTZ4cFE4aFNJTU9UYzg4K016Ujh2Wk4rNis5SEJNejBXSk4rTDREck5MU0JZUmpXck1GVUNGc3F6MTFlbThFVXJRVlJERENna1pFYTZxVmhhSEIvK2ZvNFkrZU9MbXJVRG1tWW5sUjFzSmVBUU1RM2NGUG1TaGtmdHZJcXY5Mzllb25qcDZPTnF6aFFoQ3pVU1EwRUJOSFFFSEtRMVBUQnhzTjIvV3l3N244OU4vSTFucUIwUEo4QUEzMFNPK0dUWnZtQ0d6WWwvTHA4ZkZ4Ry9vdjAzN0xyeGJXU1NkZW1nU1JCQlJRbEZMNDN1V2w4aC8wRHh4NjVxaGkwNlZudEhSUFkwYnJtYnBiRmdWQmdJd3gvYjYvdVcvd2kwUS9PemZ4NlVhZG1Ndk9aNThUSTE0T0d5d3ZuRXNIWjFIM1g2WEJvU1piRVVkUlVLek40MGRQak5WcisxOTNjNjh4cmJFSkVRVEo0QWpMVHhKTDZ0RkpvVHBqejhTWjJVVFdDZ3k0djF6cUhlai9xSXArOHN6Smg1dk5KakFvdmFMMHg3V1N6OVo2K3RvM2dLVzFYb0NBbmVYU2IyM2VmT3I0NlB6cVFhcVVGYk9OZkJRUU03Y1pQdEhwMmJtenJaWWlHbkFxYTdFT0NZUk9iNVN6QkJEVmdOdlhqSlFHK2haVURFR2F6YU9uejBaYUwxZjlwQW9oU0FvaEJZSFoyZ0NEclE1NDB1c3ZGaiswYVdQcitLbnBla05Ld1E3dFNUUEJOR2hJNmwrZGtMZ0RxSGdFQVdqbTdkVWVVKzM5aGZyYzd5L01oY1pVTTZvdlZpYWNaa2VJZWhrNGlEUG5ucU01SmFkSDFpcE1KamN3QUJINVFweWRYVGh3L09UT202N2JPTmpYT25GYWVGNG1tKzl3TWx4aVl6cEpBanEwVXltSUNJcE5JT1hxdnI1RFJmOTlrK01mbXBsaFkwb0VDY3hvZFUycFoxeXBCaHR4S2VjQVdWOWxFOThDVUNMOHpzNmRORFo3dWxJVWZiMmFqUmFraUxURGMwS0dFR0o4b1hhNjJlenZKaHN5RUx2b1AzVGF6MEFOV0YwczNySmw4MG10QUJMU3E3ZmJCeWNtbHk5cTc0eWtkUlVsTzRvOExWa1dnYmJuL2ZMNnRkZk96RDArT1JsSXFSbHVhazhYajhDMjRib1hscmg4UjhRbmo0aUJncUE5QTBQM1N2SGpzNU9QaG1FZlFJQmU1c3V6cjAxa2pnSUxFeHVnQ1N3QU04QWtNQWxNdTlzTU1BUE11dHNjc0FnMFhEVXFwWlFiZTIyWmZTR2FZZmo0b2NQckx0dTliY082NXJIVHd2ZlB3VDdOa2lLSVFJSXpaVDc3MWxkWGVyaXY5NFBOK3MrTWpoNkpvbDVuMWRaSzIwYnZLL1Vjak5wMGlSdUF5SVQrUlNBQzNyZDkwdzF0ZlNCczBmQ2dNaVlHS1JmUHFNU3BNd3NCcFo5Wm1MZkhRcW9URVVCQUREU2NlN001UTBUMDdwMDd6eExhU21sbVNYS21Yait6c0NDNjg3REUvUk5nYllDSU8wUFdBTUJqTEFMdldqWDg4NlhTUThkUFNpRXNBc2puV2hYQktZem80Qk43SjBIa0NkSnNlcVMzZFdqVkgwYk5YNXlaVXNaVWdIZ1pzM3FKSlpBTDh3UVFBYlBBR0RBS1RBR0xRTXZGZStmY2FHUmRmZ1MwZ0Jvd0I4d0RMWURkQVdLQWlGa1NDZVlEaDQrdTJyNTF4N2JOamFNbnlQUHNkUkFwSThrTlZuVEVDcVQ1c1lLcCtzSEF3TkRuaU44M1B2cXB4Y1V5VUFSVUpuSDNDWFZqMW5sK3hTdWNWWkc0TkdIUUplNi9BTVRBNndiN2Y3SjM4TEhSeVhoa2tJV0l3U3JCOGlrR0syWUZaa0lNYk9xcG5oMmZyTHZtOTNTUVNlenNwT1dLWHhId3ZidDJxMnA1T213VFNHa1doTmxtYzZKV28yNERzQTMxSGdsTEtST1dWYysyQXgwU1VPQ3lsSCs5YmR2OHlkTUxZZGdGZDNBbklqN25PeVZYL3dvRWFmQndFS3p1Ry9pWit1emZMQzVheDY4eTZkQVNCbmlxOXo3QXdCeHdHamdEekFQdEZ3QW1HcUFGekFPelFOdDlDalkvbGtSUEh6dStidWYyclNNajllTW5iRDZRQUxXZHFSVUpvNXNJUk1Jd1MwRWpmWDFUUFpWZm1KLytqY21KUmEzN01pTTVzaFc2RW1FaWpxNHBWa2UxcXJPaFM5TUFoQU05TGR1bktzVi8zN2w5NGZURWVGOVpsRXN4WUJOZkJTVDlXWUFtMGtCYm02SGUzblhHbkY1WW1CSWk3YkdLSGQ0ZkFvWm9BVkJFMzdWakovVlVUclZibmhDeGdXYjJwYXkzdy9GdUEwanBENEpJa0RCSmVZY01XNTRNZktBRy9KZU5tKzVvUlU5TlRYcFM2blRZYkNjbEpENlg5cWRKb1NEU2JOWVhTb1ZxLzQ4dFRIMjEzZXAzV0szc05nRFpiUWtGZ0lGeDRBZ3dDYlJmSks5SnpoSWF3Q1JRQnp3Z1NGNDNIVHA2Yk04MVY0NlVLNjJ6b3lJSW5LWGJyVXhKd2l0YzQ4UmdxVndjR3Z4dzFQNjUwVE9QdFZxOWdIVGhYQmJseTRad2t5cHNnT3BzTHJrUUtCdlJXdHhUQVQrOGJmTjE5ZkNSZG9zRyt6UkRFVFFvcHFTVFN5VWhEVWNNUXhodnRhN2R1Tm1ibVgyZzNUWkVBZGxPS3pKRUJvaHNxMlM1OHA2OWUrWTk3Mmk5NWhFcFIwajJQTThZYzNwdVBnTnlPeHNnTWk0UU1zWlNZcGpCRW1neVgxK3QvdmFxa2NlUG43QjJ5Q0RqTWw3dUdBTjFXRExwNUFVaUFKSklHYjJ4WERIVm5oK2FuM2dxam5yY3VwZmxYai9OVmkydU5RNGNBcWJkL1Y4aWFRSGp3Q0pRQkNxRWtISDA1TW5yYnJ1MVhHL0U4d3ZrU1dZUWlZVG9RVVJFbWszSjkxZjNEendTeUorWkhQdmJ1Vmt3bDkzb0FORU5WUW1YdWpBd0NSeGpYdVNMcXhyMjhobEFxdjIydEhsNVg4LzdWcTgrY0hxMHRXcElDSm4wN3dJeHN3SXJRREZyZ2pac1U5dVcwbWVqOEJ1dnVYcGJwTDQwTnp0dnk3VEFMT0FCbTh2bGI5aTQ4YWJObTQvcWFMelY4b1dJVE5MeUFrQXhWOHFsVTVOVDJTSkE2djU1MmRRY0cyS0Z3Qjl2MjlZM01UbldyTE9RdWtQbFNScTBzdWhrV2lNaTE5bnJFU25XbTRwbDA5UDNmOHlObjQ1Vm1SQzVpNTRxL1hJYTdDendOREJ4TGtqMEpaSW1jQmJRUUQ5UkxWWmpzek8zM25LYk9uRVNSZ2xCYk9GT1FSb2d3cHJlM2xaZjMyOHZ6djNxK05oNEhQYzVqSFhKT1NZY1RCY0E4OEJSWVA2U2JZcW5ESGpuQXhXQ1lmekcvajJiSitjT3dBVDkvWGJtc08zVDlZVWttd2tRUllJYXhpaUdFUVFTa2RheVVMaDkwL3E0MFh4OGNtcWgzV3BySTRTM3VsenhBdjlZMkI0TjI3NFFESXFaRFVNWlE0SkFDR00xMHQvMzlXUEh6eTRzcGxHUVRIZ0txU1VrekhlYm9yV0JieGtZL0pQQjRRZU9Ib0VRWVVydXQ5UXg3czVXQ1FMcEhFRkJJQWtRekpwQ29WSWQvUDY1OFZOeFZDWW9Yb29FaUV5ZHF3Qm80QmxnOUJYU0F3WUdnWnVGR0RMbUcyKysrVnNHaDJmLy9mTW9Gb3hod3h3YjAxTW9WWHFxbjRqYUg1eWFHSTNqM3U3Q1JkYnJzNHZ4UXVBa01KVjVpa3VSQ3BHTkNFc0V3N2hqMWNDN2c5TDkwM004T0FCUUxGZ1JlU0FkUmVPTEN5Zm01by9OTDB6VWFsRVVsanhQRkFKN1BzU2dSaFEvT2pVMUZldEtzVFRRMXpkWXJjYWVkektPRHJlYUMzSHNRVmdzU0pEUWJId3BOYk5oTm94WXE5VjlmU2VtcDgrNXU4V1JkbXdGRjBQQVdrRWYzTEJsL096WWdvcU5HOVdRY3VlNEd5QVVuWUZWNU9qMFBCVDQ2d2VIZjJoMjhtQWNsb0c0MjBIS2JqTW9BalBBWThEY0swY1RrRUFMT00wOEFGbzRjM3JuRmZ0V1JTcWNXekNTQWsrc0hodzRXd2plUHozNXYyYW1JMk1xR2Njdk16ZmhkbEVLNEN6d0RGREhSUzN5NWZFdWFmeFRCSXJBejIvZFZCK2ZtU2dWS1FoQzFwS2tOUHpvOU16bnB5YWZhalJPUnRISk9ENGRSYWVicmVtRnhhb1VRYW5VTUNZR2E4Q1hvcUhVbVdiclZLTnhwdG1hanNLMjFoNEpFa0l6REZnWmMzaHk2dWprQkJQMWxNdktHRUdpR2F2QmFuVnRmLy9KNlJrc21lUk1pZE5TUUFIWVJjVEFkNDZzZVNQTEoyY21QZWtaRi9NejBxRWdDY3RuNlZBU3Q1ZlhFN2hzYVBYUEw4NSt0ZFhzYzNEbkV0OHZNdGZrT1BDVXU5c3I1U2JaWWFObmlSb0FGaGR2ditucTZOakpnZjRCckZyOUY0dnp2M3ptOU9FbzdIZkFBMlhlZ3BmNWlBdEFEWGdLbUxnbzJXOHZ0d0ZrVDBZTGZkNDlOUEJXVVh5cVVhZiszcGlaUWZOaDlKbXhzY2NialJaekM1Z0I1b0FXVUNlTU1SK3MxY3RFMVZJNU1tekE5alNRUXFiamtXMnV6SUFoOWp4NWFtN3U1TnhjYkRpTTFYQnZqd1U5cEJDempjYWEvcjRkSXlOVGk3VjJIQ05EbTlNRVFkZ0hiQU9OZzJ0Qy9PYkl4cW14c3kyakRRbU56aDR1ems3bTRmUTBTQlpZRU5ueFdQckt2c0UvaThPL1dGd1ljSEFuTGRNWTRmVG1DZURraFRsK1d2bjI0aEpWWm9oT0x0YXUzN2wxMTViTjkwM04vT3pwRTUrWW5aTkF3UUg4V1NKamF0S1d6WEVZT0FpRWVIWEl5MlFBYWVYTEEzNWk5Y2pzek1KWXVVQkI0QkZOUnRIZmpZM05LdVVUeG9BcG9KMnAzbHZvK2xTenRhVlM4UUkvWWpZZ3pRaTFWZ2F4TWRxMWVpVVVBT1pqMHpPaFZnQldWNnQ5NVpJeXhqQXJyWWxvZkg3Uk1POVlPN0ttdjY5YUNBSWhBazlTRU96Mmd6ZHFEdGc4UXpnRC9NZUI0VGRIK29uRldTbUZkc3NTSFJndTBtYll6SGlxSlBlMXNNL3VucjZuZytDWFppWjdNcVd1YkpCZ3Z5Z0FCSHdkbUhvMngwL2RaRlZhWWVVZVZ0aFcvenlPQWcrWUFVNk1UNTJjVy9qTjQ4ZnJjVnhabHV4S1o4Yld0UVhBS1BBSU1JTlhrN3prQnBBRnRqVndTMC8xbTRMaS9ZMWFYS2tHUW9SYWYzUjhmRjVyQXpvTHRPMW9aY2R1c0RyaEF4RWdDS3VybGRBWURZNE50NVZxeGJHeXZYeEVURERNeWpBUmhGYlR6ZlpJcGJKMWVGVm9ETFBSV2h2RHpFWUtXbWcxeCtmbXRUWTloVUFHdm9DNFd1bnQ3ZkNFVmdlQkd0QW54RzhQcmg2Zm1hb1pZK3lzRUpBaHNnM3Nvbk51VU9ZTkpneG53K2ozL2Q1cS8vdG1KMnl6NVJJWGtHS2RsdTM4a0F2NitkbGM4a29HZ0hQdHBYemhsbUQ3N0k2MDI0Y1dGcllEb0E1VmFVbk1ZeHM1R3NEandMR1hHTFI5S2NSN09Sa1FDbmhiYi8vMFlqMHVGaVJScE0wOTA5UHpTZ2xnek5Fb1BhZjl5TkNBSlREV2JPMVVXZ094TVliUml1TFRjM1Bsd0Y4ek9NZ01BZ2toSkJrRFdqODBORkNwYWhKdG94blF4bWh0SEgyTkpZbEF5bnFyT2RiQ05xYWI2NjJqT3Z3aU1BTVVnUVhnKzZvOWExVjBKRzRMa2pxQjlaTXVSK0prTms3U1Nkamh2eWVNZjhPOHB6cndYMnR6SjVUcUkyanVBanF6SjRBQkhnSVdWdGIrSlJ1V3hMa1UyblJqT0V1OE9EMHY3Q1dOOUNMQUI2YUkyc3k5akZsbnVySWI0RGZBRWVESXF5SGNmMlVNSUt2OW0zeC9qK0xIVlNSN2VrdUVSeHNOVzBHY3pEUzJGNVo5SHZaQldrcTFZa1dlVk5vd1VjbVRCRFNVVmd3SkFsRWppaHBoR0hpK0xnYVJFTEh0VW1jMmhwbFpzMkdRWVFQbWlNMjg0VnNaTjdmYUQraHdER2dBTFdBUVVNQzd5ejNINXVkaVFJQXpzOXdTM2RPd3JlNnVCZEJOVGhaRUVadTk1ZXBYamZwVXE5NEhLRjVhRU0yZUF3OCttL2FuZjV2MS9lZGN2N1ZrTzUxWndSS2VxeGxvTjZIdWE4QmRRSWtRY2VlVjJFOXFISGpxb3NkNVhra0RvQXl0SlFUdUxwWHJyZFpwejZzS0x3WS9YRnNFTUFlRURvSXNaR1k2b0p2Wnk4eWgwcDRnRFZhR0E4L2JzbnBWeTdDUW9oNjJUOHpNMXRwdEc2eVA5UFJzSEI0aWhqTEdEcm5TaHJXZC9zbGNCNnJBZHhsR3EvMHhIV3VnQ2t3Q2ZVQU51Q1lvN29uMGw5c3RueExPc3dHTUc4VnMzR3cyU2Vuc1RqQ2dHUUJYcEN5WEtuOHdOMWxDcHlsZU9BNW1xam9COEJndy9XemFuMFlhZ1VQVzA1WTNrd25IbDQva2x5L1NUT2FVeTlrQ3ZnSjZDN0JJYkcyZ0JOU0FKMTZoa3NXcjBnQUFWSUdiL01MUmVxTmRMZllTbldxMzUrSllBdlBPYjlsRUtrMzRzdHB2QUVuRVFLaU5uV3pWTW9hRktBaE0xZXZISnFleTNNUHhXaTN3dlA1cXhXaHR3RVliWmJReFRNQTBtMzJHM2hWR1IrUFd2eHMrREd3RmVvQitZQUdZQmI2cFVKMXJOdHBnWVhjTEFjWTJCcVI5NHRtNS9XN3VKNEVqdzFmMTlQMWp1M2xNeGIwWlo1a0ZmQVNod0RnS25MNEE3YmRWWVl1NkJJNDVDNkFNdElFb00ybUh1NXUvMGhaS3M3Sm1YM2hjWk0xc0Fmd0E0L1hBTEtDQUk4QmhSOFRLRGVDQzh1QUkyQk1VQnBSNWdyVG5lYUhXQnh0TjRiaU5WdW1MbVJNZldkOFBLR0JRU21rblRob0RBckVRSkpvcVBqbzF2ZnpvbjJuVXE2VWlFMVNzWXEzWkdDWnFBRy9VZkYyci9SVVZ6Z0YxUUFCOWdKMHhNUWNNa0hnZGVVZWllWjlJZGFibmR4YVBzblBHQmlReWtLaGhIdks5MEE4K01qdGVCbUx1R3ZYVlFRa1pNOEJUNS9YS0tXWFFCeXFBQk43UlAvVHQ2OVlQRjRNVHJmYmZuejM5dGNXRmtwMlZuVm5Lc21RWWJmYWwwZ3ZlV21jL29PTkFIN0FhdUErb1hjU1YzWXZ4QlBDQk5uQzFWMWlNdzNiQjk2Um9hSE0yRElWRGkrMklCejhUK09wTThHcVArNzRnMElKaWJiMDVreFRGZ2h5ZFgxRE1JcVA5OWxQWGhvMHh4azY2VlRva2VDUysxNkRTYW41R3hROEJtNERWd0FiZ0RERHIyRnB2OVV2bE9Kb3lxa2dpN2pyQk1sTkR1c2ViU1lCQW1zM09TdTlId3RhY01SVkN4RjBNbnhUdlY4Q2pGM0M1MG5LU0FuNTBaTzNQcmQvS1U5T1lYYmpLTDM3RGpuMy8xRnI0dzZPSFQwVlJIMUVJdEpsMXh1Vm5pZUo4QVFOSUxsQ0Q3ZDBleSt6TDRkZUU5aU5EVm4xSnRELzFFd1ZnUDhuVFJvZSt6NkNZVGFRMVo0N1JJSlA1TFQvWkJUQllMTFdad2F5WkZSdk5QTjlxTHphYjJkVVZIV2FCNTdIaFdHc0oxTUZESkg4eUJ0ZHJqNnJZa2g5SGdEWEFXV0FjZ0FQdnZza3ZqS3FtU2JwTTdKWU5hSUlCcGI2V0NZYlNqakFZNXBpNTMvUGJudi9weG1JWk1MeVU0bVp2SmVCcG9MWXlORW5kSndDQVhaNy9JNVVCZGVKb2JYSjhjWFpoWVd3MFBuTDRXLzNpUjI2NDlUOXQybEptOXBqN2lBcHVjSkRYblczTFpRMEdMN0IyZGhIT2RidW9EU0Q5WEJXd2pzUWF3NmVJUXhKdEdNa29NclBUdkxUSGx6UDFMNTFwZVZubCtYN2d0N1RTREcxVjA1aFdGTUdZN000aTRUYUc5aGVMa2RhczFJelJlMlh3Y3pFZmFpejhnOUVOUUFJM0EyM2dZV0FlS0FJRXRJR05RdTQzT0JtSEFtUW5TRFBZTUd0T1hvbnJPQ01EMG9DbWhFd2FzOWxTckh5bTNSb3pPbzA2bHRSNmZXQWFPSHBlN2VIdUV3REFUZVZxWDZQVnFEY05rU0pqZkJHcmFQSElrYjZqeDM1bS9hWS92ZW5XbXdjR2lia0s5QklWWGYwa3JVOHQ0U1F2NlR2akY2TmtsaHZBczJ1L0JDSmdoL0JqTmpPU0ZLT3VUVUEwS0lTWHFjWko1MkN5dHpRUTJsR3ROdGltczBZekc4TkttNElucFpRbW16c1N4WVo3Q29XaTU3SFdVMHBmQ2U5N1kvNU1jK0ZlOEFSUUJYWUMwOEF6UUN1emJSTEE2MlVCS3A1ekM0TXlzKzA3TzMrV3ZEdzdwSzBxWlZBby9XdTdYc2pZODdMS0Z4MjRzSEF4TzVpb0J3UmpGQkN5c1dkbXBIWE1hTTdQMXg5Ny9LcXAyVCs5K3ZwZnZQTHF0VUVCekgxRXBlNmpRQzdydVZuU2ZVYTVEYnc4SjRBQmRwQTN6VG9XZ29rYVdrblBXeTM5WWlZUldlTDR0YU5iUmNEZWNxVlVLYmZaR0dabGpKMHpicGlsRU9zSEJ5bnpMS0hoc3VjUGx5dk5LSnFIZVZPcCt2MUcvRjFqYmhHSWdHdUJmdURyd0ppenR5emgvaTVaR0RVS2JuNk9BUm5YK3BXMkFYTkNDbUt3SFFtSUNHWjlvZmk0VWNkVkhGQ1hGeGZ1ZlJXQlVmRDBoUmxBRmpvemhxR05odEVNeGF5WVk0YlNXaGx0aUd1am8vcVJSNzZOL0EvZmVNdDNiZG9jTUFmdUtQQ1hzWFN5VkUyODlJU2kzQUE2cm9VQkg5aElOR3BpTFlRR2EwQkwybFl1bDl4Wkw3cnpOdTBRNkRhd1J2bzdlbnZIVkN3WW1sa2JvN1RXaG9VUWpTZ2E3dXQ1M2ZadHE4b2xFSHhQYnVudjN6azBGT3A0WEVWdjhJcmZiL0IzdFprRFFBeHNJaG9tK2lJdzdlcVhLUjRTQXF1STloRWROeEdCWE9qRmRpK2p4WUpNR2hUWjM3b1p5b0l3VWloL3JsMVA0K09PaXlWSWdrL1F3S0huZnZXUzEyQllNelFiQm1zMmlvMWlWb3hJRzAySW82aCs4TkR3TTBmLzY4YXRmM2pMcmRmMDlRdm1YcUNIVU9nK0NzNFRFUzFuVlZ4U0lsOVNBN0RtMVF0Nk8za0hoV29GUlVza2F6QmYxOXM3UGo4M0RUUWRMWXd6OVMvYjdUVXN2VnNHaG82UjBjWXdvTm5FUm12YlUwZEVSTE9OWmlrSWRnd09EWllxdllVQ0NhcEgwYXhTMTNtRjd6WHlqK2NtN2djSTJBdE1FajNBSEdXR0o5dVdTM3NVM0M2RHQ1RjRUTFdsM1duWDdSTTcwNjJRMlpqTHhPQWgzK3N2OS82djJweHROUk9aSUY2NjNQYzBjUHlDNHgvaDVnUWI0UHFnZEFjRmkxSEwyS1NjeU5pZFlrUW0zYXdxWlJ5MTFjVEVWdUcvYmMvKzRXcjE4T3pNb2pHbHpQWnNMTnR1ajJVYWY5RnVjSGtWR3dBYzlyY0I0blloRDNoZ3YyQzNzeXhxM1Z1cFhsOHFuNmt0bmlZVTNBNFRlMnNCYldCN3NYalQwTkJ4bUpnTldmREhHR09ZaEJDQ0FCaG13MmF1MFp4dU5lZGJ6ZGwySzFJNlpON2crVDlWclA3NTNQZ2tNQTdjVHRRQ0hzcE0vQlN1NDdFRVZJQUY0THRsc0k3MU1hTThVTEpBaVR1RDM1WnFCaVhLR2pQdktsYWVKdkh4VnIyY21VWGxaWElBQVR3Q3RDL01XVkRHQUJSd2cxKzZBLzVpM05RSjE5V04zQ0pYbldEV2JnZGVlNkhtVFUxZHMyYmtEYnQzTldKOWJHR2VnVUwzUXVLVllwNUxPU2QrYVU4QWF3RDdJYThROG9BdnBPOWJJRVVLY2JqWjJMVit6VHY3QmlabkZwNW1IVHU4S0FhcVVyNXVZSEI3Zi85QkZjV0dLZkY4YkRjOEN5RVlscVRKV3V2Rk1HekZzU2VFTHdTUjhBVDkydER3cHlmSHA3UUtDS3VCUWVDaGJpRFBCams5UUFHWUJUVHdRNkl3citNWkdBSnB0NXFGeWUyVTYxYVVkSlFpQVZkVSt2Nm0zVHltb2lDRC82U3FYd1FtZ1dlZVM4azhwVTVvNE1hZ2RJZnc1dU9tSnJMWUs5SzViRFlOb2N4UUlDSVlyU1luK3hydE4rN2RjL25HOWNkbVppZWlzQWdTeTlJTW5Ddm92elJ6Z0pmV0FEeEFBOWVEVmd2eHRDZUVsSVpJRXlsQWdCNWJYQ2dPRDM3bjVnMWJtZUI1bTR2RlBkWHFWVDE5Ty9wNmExSWNqa0owNWk5WXhtZXlROWU0OWVVenpWWWpqbU90QlZGSnlqbWxmMlhqdXRtNXVUK3YxM3VKUmhodDRLeGpxQnRuWXdDR2dCSXdCVVRBR3REM2tmOE14d25OaHBLbTk4eDBOK0xzbk5za3RLTWVLZGIyOW4yb05xL1laQmQ2cC9oUEFYamFrZDR1M0FDRU00QWJndEtkNU0zR0xkMFpyVXpwWGoyYm1TU0duYXkwWmtoaG1pMXpkblJiVUhqNzNzdXFwZEtodVptbU1lWHNSdTNNdUI1YWxyQmRhcGJ3Y2xBaEtwWkhSZVRiR3EwQVFCcndJZTQ1ZnZJcnhlS1dVdW55MHFBUnRLRGlrODNXWkNzU2dqeEd6TXpNSk1ndU1HVTNqZE1PZDlCR3Q1V3lzWEJaZW90YTM5MWIyYUwwZjUrWm5TY1VtTThDSndFN2dDMXcvS0lCb0Jlb3VSQ0lnZlVrU213YWJBU1IzVUpuYkh1WEd4TkhYV3QybVVGTWlJd1o4c3Vud2VOYWxUT0VqbFNCZkVLYmswTGJoVlNPK0p5RG5kM3JjWWd3RzRZQUdiQWdra2cybTByQVZpZWtnaWNFZ1ByUkUvN1l4QS91Mm5uM1hYZC84TUNUbnp0N3RnQUVSQzA3YmNrMWR1bnVaMGYzVkdyT0RlQUZpcjJDUFlLYWJqeUpBaHNtSk9Va2xsSTJ3dWplUmxNVHBCUW1zN2t4WmpLY3JDdFBkaDhpMlZaclNaNitFQVVoV2xxWHBLaDZIbGovNTVIVmYvWE1zVHF3R2ZDQW84QXF3TGlBcEEzMEE1dUFRd0FCWlFCQUc5aEJNZ1MzZ1FLemRwNHhuWDRPUUNMWnRrS016SXBmWGxzcWZ6V09ROWNLdUNUSURrQ25rS1RkejRPUm56UWlkN1lPSktOSUJaTVJTRitGY1hNNkRiTUFNVEhZc0RiUzh4Q0Y2ckhIdHE1YS9WdTc5Mzl1NCtZUFB2SFkwNDFHRDFFSWJuUG5NRnhpQUtuNVhTSTI4SEtjQUVWUUExQkVGbiswcmV1V1JheGhHRlR5SkVnd0lUS3Mwdlc1T2liRDBzWWtSTHF6cUNkcDBEWEFta3FwRWNWOVFUQ3Q0bTlmTjZJTTM5TnVYMGNFNXNjQkExU0FtdVAwVm9IMXdCUVFFell5eGh5cGF5OW9qcldOeW96anR3bEttUDUyRkxwd215RW9LUXVRQkhvS2hRT04yaEllWG1mTEJ2UDRpeEZIcGtPQ2pkUEh0RS9JY0dkK3M5MURZMDlKRm1TMFloTFM4K3JUMDk3czdCdTJiYjNodHR2Ly9NVHh2ejc4akRMY1M5UmtEak9WTzg3MHVhZEU2MHZCQnJ5WDFQMG5weXB6QTBZNVRvRmwyQnRpeHpoSTloRHFCSEhuZHJ2ZENrT2xkYnFkMEpPeUdBU2lVTkNBTVltK3hjckVZTi96bXNZb3JkOCtzdnJ2ajV5d2V5TVBBQTBBUUFSRVFBTllEVlNBZWNBSE5qR21nWG1uU2V2QWN6QWlVM2kyM2xWMFpxQW5hc2V1UTFJelNpUU0wN0YydTVEUmxXd21ZR2NQUGljRldzcGdvd1FVVm1EZGlZNVlNQWt3RTJTeWtEZ0JpQ2h0M2pjc1NOZ2lBZ21oZ01YRFI0dGo0Ky9kdWVPTmE5YjgzbE1IdmpnMVZRSjhvaVl6T1FQalRGY05kME5EbkJ2QUN3bUJHTkFpQ1lFc2swY1RESk1CcTJTanFGMWVMV3BSTk5kc3hzWmtaOTR6QUsxbHE5VVRSOVZTbWFuVG9xV1pZMjAwODdyQVh4ZjQ5ODdOYlFHT01NOEFnVnVXMFFUNmdYN2dLTEFUOElCandJTHJTL1NCRWRBeE50UWgxWEZhK3pYTWdvanRTMHdheE1oV0pLcSszL1M4YVJWNzU2cm1lc0QwQmFDZldCbUhTUklBay9RL2FKdVNBQUF4R3dOSVI4MGtnbUIzY0lFRjJJQWtHMlppWW1HMElFRkN0aHFOK0pGSDlvNk0vUDcrcXo2K09QZS9Eanh4ckIxV2lTSndpN3ZJL2VkY01KTlhnbDlZU1ppSUNRcXc1NEJtdGhWTjQ3NG1vcGxXNjJ5OUhocGozSkJuMVYwZG0xZDZxdGwwSXptVGxlZ1N2S2pWNjRLQXdSekYvY0M0VSs2Q2E4YmZETXdBZlVBQUhIYmFiei9qSWFBQ3pJRTdwV2lIdG5UOE1TWE1DTTYwZXZYN3dad1VEWk8xbkM2b2RQYTVJQ3JMYWZvcDljS2dzMTlSRVdraysxNFZzMkt5bDFTUkxaK3pIWlN0R0lvNVpoTVpFek5IeHNSYUtSZ2paWE5pTW5ydzRXK0srY00zMy9vOVc3WVdtQU5HTDFIQnNTZThaVHRwY2dONG9XTFhNVVRNMmc0QXRSUkxaanUyamNFQ05OMXFUN1Jhd28yME55dDR4MURyV2hoS085Q1RiY3Nqak1GYkdLWWQ5Z0JuTWtVbDIxUlZBazRCZlVBLzhDUlFkOVZmKzRDclFRU3VkY0JXdS9IT2JzVUNFeG51SXNPbDA2SDdDb1V4SGJkVzhKRWFtSHN1OGM4NVYzMlpoSFprQndDeklXam1qaE5KRGxMV3NCZVdOVWl4dmRtTHpBb1VHU2pISW9tMFVnTEttTnJCUTMxUEh2eUZkWnMrZFBOdE4vVDJHZVlTVUNIeVY5NURuQnZBOHcrQjJtRE5pQTNyaE0xdlY0ZXpaaGhBa0tqRjhialRmbjNlaHdMUWpLSklLWHQwZ0xrTjNrQzROdEprYUJHb1ovYUtBbERBR2RkZGRkejEzK2pNaHpwRUlnU2FXYzFqMkJrUzdIYSt1NkE4K1lGaGFIRFI5eWRVek9kU2ZRQUtWSHRlMXdvWjJpazZHL2c0S1FWMGNtS3lBNnVUZitFY0NveTlhYnRkZ1kwR0ZCdkZKbWFPbVNPdFk2T05KNXYxZXUzcmoxdzdOZk1uMTE3N2Mzc3ZHL1I4WXU0aENwWTFFdVFud0F1VlJlWUNzMEdxK3RETWhzSEVURkRHakxkYXlQUmJQT3Q1MG81ajYvOHRKM092RVBQTjFqQWhLQVRwcUtZWUtBQ25nQ0t3SGpqa2VtcFRKYk1mN1NCUks2RzRrUUU1ZFdlZEVPRFlFZVBzMUMwWXR6bkw5LzFabTQ3VE9mTFhFQncrZCszbmJoaFVKeDMzYkpMUjJSVERUbWxuQTNZYmREaXpGOHpZVTFHelJkamdUZ2FPR1hFU2R0clFTQ3V3a1ZRL2U1WWZmZkw3U3oxL2Y4ZnJ2M0hEQm1LdVVoSTZpbk1OR3NvTjRQbklQTGhvWFQ2eWtVK2k3ck5oR0Jvam5zdGdtZGdZV3hWZ0lHQ3NJYW9idlRhTTlxd2FCQ0FJRVdDNTFrMWdNM0RFZ1VMTHBRcUszZVkyYlNIYVpPMkZDNzRkSTlvbHBrd01EeWdFZmszcmpKUHVZQ1lDYUQ3ZkVWSGRmYjFrclByYUZoeDNlQ3FRQmh2V0dpWkZTRTBDSzVNQzJSaEpBWnBJZ1JWc3FzQ0tqZDI5RUJ0V3hpaXRERGdPbzlxQmd4c1BIZjI5L2Z0Lzg1YWJxMEtLekNuNm1qOEVYbzRRYUI3d25FUHF1RGRtTUN0dEZxS1luazM3bHc2RXNyTittRFZRWVRQSTFDSVpURXpkdFdZb0JBQXl3QkJBd0hwZ0ZKZzkxNmRvWDF1Wk9lNjB1anNiU0pTUHNuNDl1d0pEMk1qTmFMSUhCWGM1Yi8rRlRVeEliVW13MFc1d2ZNU0pzMWVkTFFxazBja0JsRXNQbFBQNkdod25pWEtTSk5pRU9Fck1nR1BEb1RhUjF2QW9uSnRyMy9mZ080dmw5MTkvblhITlpmU0NaNnZrQmdBQUU0RGRQR2dTQTJDVGZFMlIwb3JOOHExcDU1eUcyZlhJYk1EY1p0N045QTZEM3hWOFltTDZuWkNyZXF2TXZCRUlnV0ZBQXhQblJiSXJ6RTFMckVpU1lCdGRjQllYTnhuVlo5amhjSUFVVFdPUTZRN0xEbU5yUC9ld1lZbXFVVUpWU01JZUc3MTBnaDhTeWg0RkJBT3k1NnBtTnNTMmExa241SWprdldpQ2pZdVN6U05zZExLT2piVXhKbGFXZE5KODZJbDNEZ3k4dDdjdjZONFlrcDhBTDhnQXhzRys0Wkk5MEptMVliYTcxSmxqcFZaeStlbnlpT1Y4UFpuczQrV0l6VzJHU29iLzFhaDdnYzFqc3ord2IzYy9zSmJJYm84Y2ZiWlRwUVNFU09neG1TNFpNcGt1ZUhZalV0alJwQ1VnZkU4ekx3bmNVeGcwZW1HK3Z3UERzNG5CTWR0QVAybldNV3lNVlYvbW1Fa3gyOGhISXczOWs0UENCbEdtby9lMm53M2FwUVRHR0laUmJMUXliQXdaemVCclZ2VmZDZFF2RFJONE9YS0FPdEF3NkxGTU9HYlhXc1VFMW15V3UyZVJzUUUrbC92MzBwOFlYcy84U1JobWJQYUtpMU16LzdtbmZOZldEWFhtUGtHbkhCR0lWcGdkQzBDQzRrN0dhV01lWXNxcW9GMEFESnNXVzU2UUJJUW5EYnJTWDNRUDFud2hZVU5pU3d5VG9Ka0plR0NSSEUxSVhiNE5mbUt3c3BrdVlLM0ZjSEtVSlhHZDRSUXNzb2lxTlNRWCtKRUMyR2g0d291aXM2MXdOVkJ5YVF5L3BzdGg0dVY1Z25IV1E0d1lzTUc3ellORlJzdVhCRCtVNlM5WlhvLzBpRFNibUxuS1hBVVR4SFVrOTJyVENJTCt4NS8rd2UzYlpMSFlNcXlBOGdvZGdLa04yRWdnbTNkbU05cDBSR1lDakZKblBCQUowdFNaanBnZFlhU2U3d21BYmhUSWdObkNaVWtxek9ucTM1aVNzUlRKL0VackRNUXFRNTF3MVViV2JKanMzM0xhOEVrSnp6QkRPelhzZWY3ODZOUVRrOU5WWUlBNWZxMXIvOHRoQVBieUhZY1pOc1lRbU5rdVdqUmdqeWdnRXVlS1RHamwyTUFIQkVnWmJodGV5OUF3dDB2NnoxSkdySDg4Ymo4NVc3L21xY1B2dS9hcUpqRG9OaEtJYzAwU1R5cHJydDZjS2ZvbWpKcnUyVVNjOG5NSVpBRFl4YUhMWUZDVFFmR2Y5K1ZLWjVMYTVnZExHekdaUXE4R2FVNXMxYmphc0pzbllLdU4wSnkwTWljUEJXYmJXTk9CdGxJbFlCQjdFRDdvRTZkUGpTblZCclV1QWUxLytRemdDRUJLbDIwVWF4S1NtU2NvRUlKVzZFeWw3c0E2dlZ0WkNFMDJFK1VSNWg3UURqYTNNUjRnODdFdy9BM2llSDdoMjZMbWUrKzZ4UUFsSWorengwRmt5R3JzS21WdzNHT21CSFRQRGo0aDF3dlB4RWhDQzF2dDRxTG5wVWtBZDAveU1pOU0rOTIveEE3c04wbTduRHNIa2tBb2dUc2QwZENtTHFTVG1JMk43WnRMZS9tZFlidVpGeVJCa2lHQUFjOVh2djhiaTdOL1hWOEVjQmc4dGNMeG14dkFjeFlDNnNBczg3RGQvRzUvU0dRWVJTbXhMRHFucmltY1hmb2hnWUtRSWJOaGxFRFhnVTRDVHpHWEdmK21kUlg0WkJqK2pTZHc5Tmo3ZlBIRGQ5N2NaSzRRRlNscDBTTFhjSmg5VXIrRDlyQnJtS1NPK3ljSHlUTnBUcFVNaGxEMnZaUVp3Vms4L2tYeUdvWk5hb3JXbzdNYnkyWGhoSmdRdS9LNVRueS9OV0JtOTE0MHV3b1pkNVo4Mi84SmdOaFVQVGxVTEQ4SS9wSG0zTjlFTFFPMGdhY3ViTEppYmdEUFFZNHdyOVZHcDZBa282WjBqK2NWaUlKbFVDQmxlcXl5UFVyOW5oZTd2ZFFEd0Y3UTQ2d2ZZRk5nUEFtMjdZaDl5c0FyaEE4Kzl2K0c0ZnZ2dXJVRVZEZzVDcVNid1ppS0FoZmMvRG50QnQ5cU53bkNEVVNocm1xWC9UbFJ0VmhJL2ZRU2RSSFBIUVk5Qjl6T0tTYWJsbnRkSU1RMmU3RTNCM2RhWmxRQzVpYlJFUzg5blZnQUhsaUFKWGhOVUZTRjRtL0dqWjlvekIvWGFqWEF3R1BBMkdzYSszKzVEY0JleDRQZ1BtWDY3Y3h4Wm1hZVUzRlJlbXVEb0NqRWtuQ2ZseUhpQnFnS1VSU2l4U3hCQmp4c1dJT09NWDhSWmdMMHc2TFVCblpKZWJjZk5KU3VTMDg5ZXVDOVlmMTN2dmt0ZmVXeXg5d25xT0xPZ1JSNmFycmRUY25Bd3pTdHREL01OT0FtZmVocGNoekZ2VUd3cEdza2RkZ3ZzSlhFdlhGaVp0V3QrZ21HWm9seHBwc2J4NVNncGE3MWdwSUo3MGoybUlFSXdtUDIyQXdLc1Q2b2ZCYjRnZHJzUDdWYlBVQXZNQTg4Q0p6RUpTUXYwd2xnVWZremJIWnFFeE9ZV2JGaHhuZ2NYZHRUTFVvcU90RFpaTEpBeW1oL2tXaVY1ODhhWTd0a0JORnVZQkk4QnB4a2ZJcjBOeE45WjZGNGUrRDNhQk5GOFhjczF2K3lVc2I0OURlY09mVlgzM0RIalpzM0NNTmxvb0NTd29JQVFHaDB0azVraTE5c3U1QU5kekpqNDNCUyszVzcxUjd4ZlhRVE9UbXp1dUlGK2dza0sycVNrRDBHSlpydHNoUkxqOU91dFVneE5MRTlGaXdNbXJiT1VYSkxXRzRCMGVaQ1JSWEt2eEkxL2x0cllkYVlRVUFBQjRBSGdFVmNXdkl5R1lEOVVPK0RXYU5OQUNhQ05pZ0tNYXFVSVhGenRWZWpNMWhLWjE2WmphMHJKTmI3aFdtbmtJclpaOTRIaklGam9BSjhuUFVCam42ZTVIK1FmbVRNQTRZZUN1TmZtWnI3VUNzeUU5TlhQUGI0Mzl4MTYzKzQ1Zm9tZ3hsRklwc1FnN0dBeE1VaU01amF1T0JCZ3hVbC9maHVPQTgweUFDMVZudWtWUExjbTFzeTJVNjhTQmVOa3lnb0dRbk1CRHRXdzVhMzdKYXlUbFRXV2VTZFhURkdrdE5CRmJ4R3lFMkZ5citTL29uNjdKZFV1QXJvQjg0Q1h3Uk9YaG94enl1V0F3aWdCanlqelc3RklaRWthSENaNkY4WEY2dGU4TTJEUXdPK24ySU9LZW1GZ1UyZXY2RlFHRE1xWmlNWVlNVE1RNHhCa3FPQW5hODR5dnpyckt0YTkybXRCVDZpWWp1VjdhZEdwejVRYnd2VzNwYysvOHRDZmVpdVc5Y1BEeXd5bHdrRkFvQXB3TGlSSVpTRklGTnR0b2t2a2ExZTI3R2tETlJiN2RYbFVzbXBYUmIvaVYra2FUUE03RWpkN0NpMGxveWRVS1B0RUpja1pTZUhtem5TVXJySXpDUHl3Qlh3YnI4NEh4UitLcXovUnFOV1oxNVAwTUFEd01OQUk1OE4rbEtMalcyK0JyTkI2YXJSdmljOWtHR0dNWDg3TzcyZ3pROE5EbjlMYis4dXp4OFdvbzlvclpCN3ZPQ0tvQ2lsUEtWajJ4MWlvUXdEN0FBMW1DZkFkc2hoRmZpUzBSK0Q2Uk9pSWNRcHQ3L1JEa1FCRytWSmRmVElPNDgrODltcjl2N0VEVmNHbm1jWUpjSUNRUkFWdXRNUFhrN0t6NHlETm1BQ0xUYWJ3NEhmNTlJQTZyWUIvOFU0TU9FQ003Z2FoVTEyYlVlb0EvZ2RjNGs3REN0WG1ZQUg4aGpFMkNEOFRVSDVuNkYvcGpIL3VJcUdnQUp3a1BGWllQUlNHb0t5WE9UTCtXUTJ2R2tEMTRDT1NxcDZma3RyQm55aWcySDdoSXFIcGJmSmsydUUxMHVpS0x5R29OT3NGb3lSRHNPMmZoR0VOekVhNEVPWmtHTUFlSWJORnVudEFWMWZyVDVDNWxpczFucnkxNnJGTWxnWWM1QmtJSGk0dG5EMzJxSGI5dTA5Mm1nL3ZWQXp3QnRKem9OakIzZG02aEtVQ2ZHSndBSmt4NklFSklTSzkyeGMvK1dGeGJPdGxzeE9EblhYZE9vRlhDVTdVZTgyNFYzUE9Bcmw5aEowWGtZeXI4Z09KSFVSSFZtYUJpRUFmQ0lmRkRBUEVlMHFsRThJK1lHNDhkazRMQVBEd0F6d05lQ1pWK0ZhM3hkZHZKZnp5YXgrSEFUdjBueVpNZ2VFTGtwWmkyTXBSSjhuNTQyK3A5MXlsRWN3UVFJK2tiVE5nVzRwcVFZR0dPdkE5MmJJS2hLb0FGWG0zMm0zU3NYeTYrTDRMM3Y3dnRYdzViN1k0SW1HTWpIanUyZnE2eng4WU12SUZWTVROOGFqLzdoeDlaK05yUHFkSThmYTg0czlRRXVRV1VaSlRVaDdnTjJGWnh6UFRBdTBHQ29NZHd3UFBEUXpXd0NwVHZpZEVKQzhGNjVlbkk2cUp1N0NoWm1aaEYzZFIrbmdDaVlRVWJKZXlXZmpnN1o1aFo2ZytHSFYvdHV3YVlBVTVYelNEY2JpUzk0QTVDdnlyRWZCdHpMTmdXdFNsS1dNZElJYzJ2ME9kdkttVHlUY21sNUdtdDhoQm5Zdzd3RWV6QXhTTHdLOWJxL1d2VnB0a1hKM3JPNE9pcmNYL0lKQVJkSTlrZm1yV25NK05oK2JYbXd3N1NFdWo0L2RLUEh1SzNjTnIxNTFjTDUrTWd3RHdFczJ3bE9XNEpEcEN5RnlHK3drZUgycHBBZjZ2M0IyekNmU0djVFdYdGFGNTlzVlFLNmo0QmJ5YndBZmc0cEJNZEpMUUpuNE5aa0VRWUFFU2FBQVVTTHlnRlVrOXhYS1I2WDhiMkg5aTNFNEFGU0JVZUErNE1TcmRxbjFhOFFBTEt4NUFud0hpd2xqWWluTHZ0OVdDaTZvUlRyZkpxV3NzQnVPQzJqZ1pvQkFCNTBQc3kyLzZYekNOdkJaRmEyWDNnN21rdEtHT1JEMFM3WFdzVmpaRVptZnFyZnJvTGNQOXpaaGVwdTFkV1gvc25WcnVGdzUwMmhGY2V3RFVyaGltM3ZCSXBNelNaQkg4SUVTWTkzR0RaODhjWkl5T0ZMNmtwcEE4NFdGUURlUWR4TndGQ29DYVF0b2RpWTFaanUyU0RKOFFnR2lBTzRoN1BHS3BhRDBWenI4czdCUlp6TU1LT0FKTjZjNlg0djB5aVRCU3dLaFJlQ3pScjNPb0JqR0xUYjloWUpoMXE3Vks2dC9TZk1MdzA2REs0RzNnRTVtbG9IYVE5L0MrVzFBQXRPTVI1UXVFa3JTOHd4cUJyT2VYQUFNSjNENGplVUFCRm53RERQT2pxNDVkdWcvZS9HdnZPNnFiN2pocXQ2K25wYmhtQzNiVFlpMEd1MEt3TVlTRUVpTXp5K01BQnQ3ZXJKYml0T011ZklpWk1EcEVjUkVhU2s2V2Q5S0lHSFhVVElDVUluaHc2d2plYlZYUFNERSs4TEZmNDdiTnVJL0M5empCa0lpRDNzdWhoREkrckVHTU1IbURhQTVyU2NKZlg1Z2pJbU42Y3o3NDg1Q2FsdkRqNEE5b04yZ2g4RnB0NEFkODg5dXdwa0NBdEJQQmNWRE1IK3FvNXRMeFFGUHZLbGFMZlgyUE5GdVR5aXpyUkI4b0wva0NmTFpqRWJxUjJmYVpVOXU5NmczRGkrdmxxN2R2TTd2NnozZENoZmJiUjljQUlTalBUdjNTOFFJaENBMnUxYXRPaXU5eDJabkF4Y0ZjWVp5Ti9OOHI0ek5IMjZsNERyUVVTaUFMUGFhcktWSloxQVRTVkNCVUFUM0FwZDdoWUlzL3FGcC8yWGNKT1kxUUF1NEgzZ1VpUE9JLzJJekFEaVMzSEh3RFVTK01hZTFLZmgreVpQYXNNNk03bllPRHdBMDQ2MFFNZmh3Wm41bEdTaGtVTXRGNEdvaHY5ZjNmem1PUGhwR2owYlI5cEszUzhkM2xvTFhqd3pkRjZsM1ZRdHZLbmxOb2tDYnYxNk1mbTJtOXRsYWVFQ1oxYVhDK25hOWZIYnNTdkN0MnphTWJGaXpFT3ZaUm91WUE0QklNS1hLVFFFUWdBZWtHRjYzOWpPbnowZ2kzYWs5SlZlMjlyenk0TlFBYmlMdkp0QnhLTXZMU0NlYzI4SHJBYWdBTGpBS3dBN2g3L1pLWHdYL2xtbzhZOVF3VUFLT0ExOEVwdktZNTZJMUFMaE5MYzh3YjJMc0JxYU1XUUNWcFN5NmtlaUcweFV0U2NucHUwazhBek9kUWR4N0hMMDVwZmY4Z09mSFJMOFRSNFBBdU9HUE5hUElFMWNWNU1ZNGZuZTFkR1BKODMwaGlWbWJuNTV0enNhNmwvQlVPLzdIcWNXdk5xS2JlMG9sTnNXd3VjY1hONjhmMmJ4bFkxZ0l4aHZOdWxJKzRCTXhFWUVEUWduUTdmWVZXN2Q4ZG55aWJnZTFaenBqUERlWThZVVl3RzNBQ2NSUmt1NWEySTU4VUNIWkNjbjlSRGVJb3ZLQzN6SHRqK3JRQjRhQkJlQSs0RUFPOVZ6OEJwQzY5dE5BbS9sS1VEK2JHV01hRENGSWtwQUVCNHRDQVJ1QnQ0QStEdzZkK3krNVFlYzJBZ21CWVNGK3pBdiszS2l2YVYxdytQeFgydkZEU3EwditEdWhQWUZRVUVuckw3WE5MODAwQmdBaUNvaGF3SlFRUDloWDZpdjRzWlNtSFpiQzFvYkc0blhGd3A0TjY3M2Uzdms0YnJkRFdKeFJrRStpcnRUT2diNUp6M3RxZmlHd282U2RLVnJpemZ3TENvRzhXNW1Qd2NRZ0JnbVFCQldBTWhDQVBXQW4rVHRFOFRPa2YwczFUckFaY1NzNTdyMndyUnk1WEJRR2tIN3FpOEF4Y0Evek5uREFKakljZzNWUzBpY0JLS0pyaVM0SDduRUJqdy8wdVF6WVF1WUx3SnVGdklia3IrcElNY1B4S1NxRVU1SCt4MXA3aXVpcXZzcUFKM1E3OHFRWDlWU1BodkcwMGo0d0IvejRZUFdkZ1dpUktBS1RMUDVoc1RtazFlRFU5UEQwL0RWQ1hMOTE0OGk2TlRWajV0dnRXQnNiaUpjRjdkeTk0M1BIVGhKWlVsMXlXUWtJZ01YbjNoNlFva0N2STNrVCtEZ2J1NTFiZ2d1RUVoQUE2MEZYeTlLRThIN2R0RDVyWW9zQ1c4ZC96TGtHZm1FZkIzWHZyY2w2SzhvTjRDV3lBUWFtZ0NrZ0FQcUFQbWJmVHBFQUN5SXR4TlhnSWVhSDNHZGNBQVl5NCsxam9BWDhxUENPRUg5VXEySkM4MHk0elhaVTZOZmI4V2NXMjVwb3R5OVhTWHI3cXY0M2JWaGRGK0xCUmt1UStQM1Z2Y09TWW0wS0pQNTBydlhlc2RsL2JvUkhQSDlkRUl6RXFyeFEyeHBGMXhjcm00ZUdvMEpoS282aGxLblhiN3g2LzBNVDAyT3ROaHdWMUdwTUFZaFhuc2wxZmdQUXdHM2tYd09jaEJGRWdteHhGMVhHVlNMWTZKYytBdlY3Y1hPUmVSV2dnS2VBcjc5SWxCN3EzdHBOM1lQaVhtTTJJQy9DMXhRRE5hQU5OSUFJOElFeUlCa2xZQnRRZ0ZnRUx3QStVQVdLcmcvZEFIVmdxeEQvUVhoL3lQb1lHd25FM1k1UUFCWENnaktmcXJXLzJJclg5QlkzRitWSXMvNU9qKzRZNkwydHYrZE8wckVuZlRhMXlQek1kTTFvRXhwK3VCMS92TkYrbVBuS0lPaXBOZlhNM09xRjVtN3k5bFo3K3dkNjU2T29GMXhhdmZwZno0NzFFWEZtMTUyVitlZjFxV2hnRThsM1FwNUZMSkU0L2hFaGJ4TEZZMFMvcUp0ZjFmRWcwQWVNQVE4QTR5OUdyTDlrZzd6b2JMcFBsZ0pTTjNCT3VRRzhkTFdDZEtkdkJJUkFEUmdDK2tuc0J3QStBcFNCWHRkcFlLbWpEZUI3aFJ5QytDMFRJOTB0ME8zTWJFQlNCYWFVK2VSczgydU5zQXBzSWJQVkYvc2x4ZHF3UVVEMGw3WFdIOVhhZzRCSEtCRkM0RWx0dmtQS0RRYWhKeFZ6b1JrTjErc2JJN1d1VWcwYjdmMlZ2bnNXRnNiaXVBUVVITVBFcHNMdDV6NGt3bUtwSjJHK1M1WjNneHBzaGtIWHlHQ1ZWL3FnQ2YrbmFVZmdRU0J5dklib3hYUDg2RjZwbmM1TWJ3SUJVTFo3ZXBacFArVUc4QklkQmNieEkxckFPdEErMEVhd0JEMEU5QU5WRjk3RVFBZ1VpUDR2ZVBkQS94dWIwcktDUDJVcVFScndDQUo0T2xUL3NOQitWUE9xU25HVDcvbktxRWo1eXB4UTlMRG1TYU9KNFFOMTRKdDdxejhzdllZeDBuRFQ4Szl6M0NJZWllTkNzeFUwSTI5eTV1NVNkYWhRbUllWjBWcTdUbnpMbTVoNzd1L2Ryblg2QXZRMW9uQVpVMUhJcnhKK3piUWVOR3JRemYxOWVJV3BqODlENzBVR3c2WE1ubVBwMXBpL2RkdFdIempaYXNkMjFvWkRwVjd0VytibFJmNzZqRnNYb0lIZHdMZUMvcFp3SGRGQmNCa291Y29YQTR2QU5TVGVRUFJiYkJiQTJXbTcyVUFXR1J1d0U2UXJ3TWxRZlh5NmZuOGpYRWUwbWJuTnRMOFl2S2RTMmxtdFRFdnZjQmdwUVIvb3IyNXBxeFpUbGVuVG12L3Z1UDA1b3o5TlBFdTBqVEJzNGtMWWZwM21Od2ZGclVGcG1uREthQTBVZ0g2Zy90eTN4ZGpUWTVMTlIwejBSZEtmNXZoenJDTG1QcUFKUEFHY2RIUGUrY1V3Z0NVMmtBWS9aU0lGM0xWKy9VZnZ2UDJkRzlidkdsbGRpNkl6OVVhRDJZTEM1S0srSmZhUUc4Q0xIQkV4WVMvUnRhQS9JbjRyYUFBMEFiWjdrRUtBZ1Jidy9TUm1pVDdNdXRRZC8yUS80SFRTaE00MHZnU0FEendWNmMrMW9tOHZGM3M4S2FRc3EvZ3E1bThybGZlWFN0ZjBWTDR4MWlwVUJ2QWhmbG1GWjR3T2dCUEFaMkEreG5vTGlYMGtwazNNY1h1RFVqZUo0QnF2V0NhYU1TWUdGNEhwWlNQQUx0QUdBSndDR2tBQU5JRXp3T0hubmxnL2E5Z2p1b01mNmRZVis4Q2FZdUdQWG4rYi8rVUh3NFBIWGxjc3ZXZi8zcnQzNy9ROS8rVGk0cHhTREJRQWVTNHpvTndBWGx5QWFDdFJBQndDdmdtMEhqZ0V0dUcxclRlTmdINlF2TDhGSDRBSm5IZGM4bmx3ZC9kNityVjJFeFJ2TGdiZlhRNUdsZjZGK2ZwUll6YVhDbjBxM2gzR044WW1pbFFFVVRINHNsTHZWKzJDQSt3clFKUG9tNlcvM25DVFJKdW96WkFtSHRieE5hQmJ5ZXNsbW1VK0RTaW4wUHhjYk1BNDJzZzBNQVBVWHlRdTU1SWhlVXRXMWR2NHAwZ1VBcjkxNTIyM3pzek5uRGdqZkw4MVBSV2ZQTFZsc2Y3T2pSdS80NW9yTnE4WkdXODB6alNhc2JXV1RGeTBIRTdORGVDRlNpL29NaUtQc0Jma0VXa1NCNUVnL2ZQQTIwanVBLzArZEp6cDVFSzM3KytjSjh1NnZleFMrNS90S2U4VzRuY2I0UWZyN1NmYThiODBXa2MxRHhxeldoa1BvczFNUmpjWlR4Tk9nK3NBQVMzZ2JzOS9uOEVjUXhQbUdEOUxacHF3Rmd6V0JWWmJtYTRVL2liSTR6QnpMc0Y5SHZyNjRqb1VySUIxWm9PZkJ2TVBYNzczeDZwOU13ODlRWUZQUmd0Sm1xbFdhOVJPbnVvZG4zNzl3T0I3cnRwLzg5Wk5JZk9KaFVXN01hMllpWXRvQmZDVWNnTjRIaCtZQnQ1QjRrcndJMFFQQXQ4TFBBUk1PejMrWVJJSHdKOWdVK2oya2RTZC92S3liUzcyM3hhd0ovQiszdmNubGZybFpydk1YQ0RNRy81U3BQNUpxU2ZCa3JITmNDK2JRZVozVVBBbTZmZDQ4aGg0RnZnSno5K2oxQ0p4bWZFSjhKL0EzQS8rSkRBSkRBTXRvTTFtRCtFdHdsc1BHaWZNdWdrQS9BcGR6SE82ZitGS0VGYjdtOHh2M2JEdWQvZGROdmZWUitLRXBtNjNNSUdFSU9tMXdtanUxR2x6NU1SK2JiNXoxNDUzWEgzVlFGL1BxZm1GeVRCVVNMclNzRXo3THpZYmVEV2RBRTNnRG1BWCtPUEFaOEJ2QnRZVHZnWUEyRVAwZHRBZmc4ZkFjdVZwdTh2SE9OdXZQYUFCL0dpeGVKc2YvSVZTL3p1TXlnNjdyQUNDOFpRMm45RHFQalloY1EraG44MTJZKzVrdWtONDEzcmVyZHJFREVYVUJIOEFaZzRvQWd2QTQ4Qm5nTnRKVkltbUNSR2JQZURiSUVjSVo0RGF5eHNibkVmcGw1d0FKYUtZZWM5QTMvOTM4MDEwLzJQMVpwTUZzZEhwVkdQRHhqQkRFSG1lSWRTbVptdUhqNitkbTN2cjJqWGZmZFZWZTlldG1ZL0NVN1ZheVBDQXdCVVFzazkzOGFRS3J4b0RzUDV5STdDSjhHRmdFdkNKM3NBVUVuMFovRzRTQlJKL3lyclE3ZURGT1pkcmRBOWR0SldFRVUvK1VySGdFNzIvMVo0enljNk8xRWdLUUFFWVkvNk1NZi9NK2dTNEQraG5NMlRNVG1VMDY1QW9BTDRBZkFqR1BsMEF4TUErRW5lRDJzd1NBSGlCZVJKbWhPaHRKUHVKam9Damwwc0phR1ZMRUYzYUQyYU1GSXQvOThhN2g1ODhORE02UVlISHhyZ3h2VWlXMGR0Wmk4ek1MS1NBbEkxYWZmN1k2ZURVMk0xQjRYdXV1ZUxPSy9ZcjhJbTUrVVd0N2JKYTBZMmNYaVFId3F2R0FOSWcvcDBrdmdCTUFkOUhZZ0RZUmlRRXZSbjRDdk9ENEhKbTZUbWRaOEZNOXlXWUI3NDVLSHczZWY4Y1J4OEt3MHIzUjVMdXE3T2dlQnQ0bFBsZllPNEhONGdHZ0VFaXpkU0NLWU04RXFQQW5FT1ovcE9RYTVtYjRBRDRJT0Z6aEg1UUZYYTVKZDFNMUFhZnp0QklYenJmajNNeGZFUUcrTGVkcFF6MEJmNWZ2L0d1blVkUGp4MDlRUVZmYVR0WE5KbFR6ZWttNVhUdW91MWhJb0x2eDByTmo0NkhoNDVzYTdUZnZYMzd0MXg3OWVyQndkSEZoZEYyMndCRnU5emsyVDZSM0FET2pZUUNtQUcrRmJRYWRFamdCMEV0SWlhNmxVSEFYOEcwTWc0K0MrMnRkSzNUTHdLaS94SVUxalA5UWhRZVlSTXM4MG5aa1VIaytCZUhnYzh5ZndWWUJLOGlyQ0pVZ0N0SnZGNTR1NEN6aEJFaHZoM1VaT09ESHdiOVBYZ0dlQWlZQmZxQUdsZ0JlMEFiUWVOQS9TV3pBYkhNRjV3VDlpa1JBU2o3M2wrKzZlN3J6azZkZk9vUUZRT2pFL1YzdzZXWnFkT3E2bUEwNWs3M05vVHZhU0VXNWhibUR4OGJtcHg0OC9Ed2UvWmZkdTJXVFMybGppd3NOcGdMYmlCeDlzSytVckhRcXlrSEVJQW02Z1BlQlF3SXVSZDBpUERyYk80QUNlYXZnTTQ0MVR3bnlMMThDWmQ5LzAzZ2J0Ly9QNFgzRU5GdngrMFVRaFhkbjlDUzhNbTRMZHlXZy9tdnhJY0lBV2lBVFlGNUsraDJ3bFZFaHUwQ0R2b3dlTUpDNXNCcHdBQzdRWFBnS2FBQTdBTThZT3pGUGdwb1pmZS9KUElwRThYTVE0WEMzNzcxVGRlZW1UangrQUZaRExTMlJNUmtSMVRTa3BicGpyUDI0QmJJZGc0RUEwQkk0Y3Qyc3psejRoUk9uYjNXODc1OTc2NDNidHRXcVZaT0x5N094TXA3bVVlU3ZBWU13TXBKNEUwUXV4bFYwT2ZBLzhSY0o3d1QyQWZ4ZFdBR0tEbEtKblZud0V0T2dQUW5DdmhwdjNBNWl3L28rSDZ0eTY1RUlKWWR6YnhzaEwrZFNXSGpvZ09NejRFUEFESFo4Y3NBeUJicHBvR1B1NnphdnA2M2dTUzRCZFJCTmczWUJHd0F4bDZrdm5WYUFldGN3dTRVRHZOcE1XL3ZyZjd0M1hmc09uNzIySk1IcVJCb1k0eEpKc1hZVmZYSkhPek04bkFteW03UnRBZERzbGFRd0d5WWlQd2dacTVOVERXUG5kelVhSDNqMWszdnVmbDZxZldURTFOdHAzK2NoMEFYL25MclFKbkVuYUJKNHQ5bXRvU3dFdEdiUUZlVFBFUTREYTVtbkxmbzl1TFo3bDY3MEhlZmtEOGx2RU5zZmxHRm9udlpvMWkydUk2N3d5RjJ2Y2l3QVM1d0d2Z0s4QWl3QlNnU0pNZ0FCTDZHaENTYUVHZ3hkb091QmhZQUEzd1dPQVNNdU1mY0NTeStHTzBzdEFMY3VVVDFBNkJFdE1oODU5bzFmM1BicllOUEhUNTI2SWhYOEkweGh0bUEwQm16VGwwQW1wczdyYnRYeERKeFlpR2M3RzR5ekFKTW5pUXBGeGJxelZPai9WczNmZkxnd2Y1YWE2MVhQR0ZVbUZuUlFMa0JYRWdtY0FqOFJ0QkdRWjhRNGd3YkNkeEtkQmtKQVhvOTVHbml3eGtib0hNNWJ5dVc1UGpETXJnVDRrOVovNXZSWlVjWFRidTZlSVV6Wk1uZ3hOUWVQS0FJekFBYmlBQStDUlFJQTBBQVhFSFlCeXdRN1NjUU9BYk9nQjRIMnNCUmdnS0tRQVJzQkF3dzg3eTBnUzdzSmx6UUw0aWF6RCs2Zis4SHI3dTY4ZFVIUjgrTWVvWEFHRzNuWTl0aEhBeEtQWDBtQ094c0lYQ3JiNU5nM3FRenFSMXFaR2RaTUVuQWJMcnoxZzhlTy9hWkk4ZEQ0a0hRZFlYcUxNeU1NU0kvQVM0OEU0aUFDY0wzUWV6emdvK3pMakgvVitINVFFUTBRSFEzUkVQd1U4eCtacC9rRWtkTzduSFdDL0ZUd21zRC84UEVpOHpVamFJdWdhNTVaZTNQMmtBVDJBTzZuWENXOFZmQWc4QVVVQUVLQUVDYktCbGVGQVAzQXpVZ0lNU01KckRSMFZyWEFUNHcrUndoem5QeUdySmZwSVZlbjFBaWFqTDMrOTd2M0g3VGp3OE9IZm4zZStmbUZ5and0TkUycjAySC9xYmIwNUFOZnBKUndaUk03a2hjZm1vbkJKQzFJdnRMSVR3VFJadjM3ZnBxUWY3K2ZRLzJFSWd4eThibytJNWlwZUQ1SjFUMGlnUkNyejREc0k3NUtGRHh2Ty9VNlBWOWovQjJKa200Qi9TSE1HOGxlanVMMVVJK0JHNDR4cWhaaHZ6WWFPcTdQUCtkRUIrRitZaFdsV1h0aTV5NVFLWWJqZVZ6R1FEY3JJbzNFZzB3N2dQT0FCbzRCRHdHVExtbGZXMUNETVRBQ2FEdUh1Y3lOMHJJZHNNTTJ3RkhMOWp4WjllaUNjZndZVVlUZVBQYXRYOTJ5MDFYek13OWNkL1hJNlVoaFRZbVhWQnBRRTZuRTl5enN6ZzVrL0xDMmdiU2pYM3BwZUNVYlNXRU1Gb1ByUnBzYk4zMHZpL2YyMWFhWEVOZkJKNkt3OTFDREh2QllSMi8vTlh4VjU4QnBDNzhQamFYKzhIYmxiNkdLR0x1SWZIN01KOHgrbUh3ZFVLOG5tZ1BlYzhBSjhGRnA4SFpzb3NHK29oK1h2aFZpUCttNDFGbTcxeFhuek5Ldnp5YVdxTDl0cWEyQ2JnRGRBYjgrUXhlWklBVHdBRmdBZWh4TXlPMkFTVmdGQ2dBbDdsYzRnRkFBbFZnQ0loV2JpaWpGUUo5ckJEd2VFQ0J5QU5xd01aaTRWZXZ2dnBuTjI2c1BYYmc2SkhqTXZBWnJEbUQ2M2N1QlNYRFNWMFU1RTQvU29CUnlyb0RrMlRCbEM2Y1pTSkJRTkgzMWx5MjUrY1BIRGl5V0N0UkVuK210Tk1GclI3VGNTMFBnWjVUSUJRRFh3Ty9UWWdlclF0Q0hDYjZReE5YZ09QQVoyQjJBM3RKM0MzOEl1SHJiRUtIa0xJaitpNEFkd2p2UDVKM0gvVHY2N2l3YkNIZjhxd1g1OUw3ckQwUUVBRzNnVWJBRHdQUFpOSTdkbVp3QmpnQ05JQUIxOVhaQXd3Q3BhUUxER1AyckNDVWdSRmdCbWd0eXdkbzVTTFhralEzOWZvQ3FBTWxLWDVvMzk0L3VQTEtQZE96VHo3eStFSzk0Zm1lTnFZemxMSjdNNlJkbXBaR1FWMXZtZGx1b25lemU5TmhsaUpCU0VFZ2trVENxRDJYN2Z1RHlZbVBqNDcyRTZsMFlRY2xnMUNQQWNkZklYS1U5eW8xQUFOSTRKUldQeVR4WWQ4ZlZHcFd5bGxOQWJnZkdHZk1Td2xtQWZXakpLK1E0bithK0NrMlpjQjNIM0NCOEEzQ1Y0ei96VHAybzdXV3hQcVV3VG9wOHhNK0YwSUtJQVFHZ2QzZ2NlQkp3SE4va25ZZ3dObmhJV0FVMkFZTUEzM0pDbFNFd0NuM0ZHT01OVUFFWEFaOFpkbEJST2NxMVMwSE90TWgxWXZNL1VMOHdMYk4vOGZXclJzYjdTUDNQVFEzUCtkNUFhU0lkUnJlTzZRekdUcmRlWFBDQmpsdTlVQjZmMEppQThLdDh5QUN3WUJaa0NCQWtEQXEyck45MjcrRTdUODdjYUlYVU13eXN5aXhUSmppWkd3ajV5ZkFjdzJFZk9BMG00TlN2alVJZG1penVWRDZ2RkZ6ekxkSjczMGtZMklKR2lQYUIvbG00UTBRRHJDWkFhcDI5S3owZm9DOHA2Qi96OFRMK1hQWnI1ZWt1VmhXR1VoNVIyM2dPbUFMNkhIZ0tTQllJVjZ5amljQ0xHbWlGN0RjdXhZd0NiQUFNN2E3aFpabFlCRm9kQmUydTRmamRybDhDMjRXUVJKb0FSR3d5ZmUvWjhQR0QreTk3TjNseXZ6VGg1ODRkQ2lNWWlrOVptYTNpVFh6amhndXRiV3VuWmFpL280VXRPd1lUSlNZQ0NBQjhxUXdTbTFkdmVaNGI4OVBQLzJVYit2RTdrWENyUkc1SHdoZk9XN3NxOWdBNERxR0QydjlxT2U5eFF0dWl0VXQ1Y3JuWWY2ajhHNGpNa0tjRWZMYmRMaElmQmVMTnpDdUozOFJPQWpUQlA0dkthOWwvRDdyTDdQcDZXNGhXQkpkTE1kaGNhNVB5d0FGNEM2aUp2aHJRRDN6b1M3Zm84cXVuNllOVEFIczVqNE1BUk9NQ25BWjBBYk91THJlOUxuS3Q1UWhNSHV1cjgwMng0VkF2eEMzOWZYLzVPWXQvMlhqcGp0SXpoMC84ZFNSbzdWbVUzaSszVUV2S0huWkJwU2VBQ2FqeENBUXVieldiU0l3QUpzVTVVd09oVFJBU2xhV0VYbEN3dWoxZlFQeCtqVS84c3pUZGFVOEY3dDZtYmxKajdoZXVWZHFZdnRyWWI2TG5hWi9ZMUQ0aTFKcFo2U09lTEtrdFdUVEw3eGZWUEVId3BZQVhpZkZUd3A1alJHYXhKZVlUNUQ1YmxDTHpidDFQTlk5V292UHBlN1VIWVR3dWF5bEFld0h2UU40RXZ3dkRzeEJwdTlzZWNrejI2eXpGbGdIYUdBUkVNQjZZQng0SE5nTlZJREgzYm14SlBqaHpLSnNBTDNBK2lDNHZGSzVvNi8vZGVYS09tQmhzWFpzZW5xaDNmS0poSlRHRFo4bmdzeXMxeENKaGxNeWZOMXR5dUd1OGxRS0V5ZS9zY3RwN0ovWUZFSXdTV0tQQkpoWGxVcXJ0bXo5Z1pOSER0VHF2WmxwZVlHcmxod0NubmxGdFIrdm1RRkhBUkFCK3d1RnZ4N3F2M0t4TVI1cnovZnI0RGMwbStOR2w0QTZFQUwvMC9QZlRwNEdTWUJnamhyOWJoMlRnMHIxc2hRUTNVSC9rckFubXljUW9JQnZCZFlDbjNieGp6bVg2aTgzQU9FcWJsdUJTbWE2NkNGZ0FkZ085QUtQckpEQWxZQkJLVGQ3L3E2Z3VLOVV2cnhZM0JvRVZhMXE3ZmJvNHVKTXF4a1pReVI4a2Fpc1NaWXNNVUJNSkRqWnI1RXFBd0dTQUxiQkQyY3N3YVc5WkZrUExOeXZyQmxZZUpRWWdTREIzQlA0T3pkcytwSEpzUzh1ekErNHdXVENnVDg5d0NUdzRFVXdzZDE3YlJoQUJBVEFnVEI4Njh6Yzd3d1BmVnVqdVJpYXBpQXBSZFBvRWxBRlNOQXF6NWZhaEdBQytjQW15RjhWOVAreGVvS05CTXJkM3ZvOHBXanVMb29KSUFTMkFodUJrOEJSbC82ZTg2eEFkejBoblZaazExM09BY09BQUJhQm1odDkxd2Y2UFJrVWlTSVNKR1NSUklGRVdZb2VUL1pLMFV1aVNnS3NhMHBOVDA4L0dZZXRPRllBa2ZDRUlFbk1SaVVJRHhGWWNJZkJsdUQweWZaeTJBVms3TmFQMmFWalNiS2JUZ1J5djlHQUFBdFltbEN5dVVDUTBNd2xJZmFzM2ZCVE01UDNMTXl2SmtRTTZYQUxXeXlmZFNiOWlnL3VsWGl0aUcxc2IycjkwVVlqN3EzY1VTb05SZkczOUZUalV1SGhkamdQdk40dnZrLzRFY3dnK0RENFBzT1hDYnFGeEJ1RUdDUjVDandPaGtzOXNhd0FqR1dsZ093aG9JRmJRUVBBUThBcGh6WGhYTDJYUzBBYnVDQitJNkNCVWFBT0JFQVZhRHViTkVUcndXdUExY0F3Y1lXNXhKcDBITVhoZk5nNjNhb2ZhZFFPTjJzblc0MlpPSTRaUWhBTFlVQWFNR3hBYkVEYXByY0VFSXhiTWduSDl1bVV0TnhDMk14eFowTi9NaDBrbExBazhRVUI4QWhnTGdoeDFkcU52MVNmKy9Ec3pDQVFkeGVrQTBBQmp6ejNZV0c1QVZ4UVRzeUF4L2hDby9XZ0wyOGQ2TnVtOUZ1bGQza2hlQUQ4M3FCMGhUR1JvRUhoL2JTSmYxM0ZCMkFHaWJZQlYwSGVMZnlkb0Zud0tYRHNlTXU4QW8xMGlmWXJZQmk0Q1pnRXZvWWwybk8rUTRCY09sZ0IxZ01UUUJNSWdRYXdDdWdCaXNBc1VBWk9nMGVOT1dIME1hMk82L2kwVVJOYXoycFZOenF5cTQ2SmlDUzdRVWs2NGQ5d0N1U0RRRTY1ZGNjKzJSQXRKYnAxRE1ObHZhNGViSnoyT3hpenM1TmJFb0c1Nm5uWHI5M3dTL1g1UDUyZEdYTHoyZE5JendjSWVQS2xiSDY0cEEwZ05ZTUFPTndPUDlKdTkvWDNYT25SM3JEOVBiNi9XMUJNcGdKNkhQZ2ZVVHRnSEdUK1o5WmZBdzhLc1JXNGpPZ3RrUHRCaW5BR1hITjR4VXFPUHkzSlJjQzF3SHJnY2VEWU12ZVA3bEp4VnZ1RkM1WUdBUUltblVsWWduUWZNTzhpWmx2TUNvaDhvZ0pSRVZRa1NDTFkzWlVnUlowa1hxZGtCQ0tkRktUY1lBRktTN2xKVUdSc01Zc1NsVGNnR3dDbEs4SHRVNWhNU3NQdUlSbGdKaUpJSWphbUt1WFZhemU4dno3L3gzTXpRMjR0amV5R2FKOEc1aTZtclFXdlFRTkl3NkdXMWg5ZnFEMFpCRmV0SHRnUWhwcVZEcngrYlg0cGlyNnNWSi9Eb1E4eWIvVDlOd2s1dzh6ZzYwQnZodGhKYUJLZEFkY0JQelByazgvMVhFWGdWa0FCRDdxcUxaOXJNQ09XcGIvUy9UdmtLcjdwNTFIUFVJTWl0enhUSml1QlNTUjFLS3VwWkZLM1Rkd0JMak5yL2hJREptWW1rMFQ1WkFrOEdsMlpydFY0eTJjMkdlNkRkZy9UV2RoTWxHVEFSTEhXcXdyRnEwYlcvaitMczM4K1B6ZEV5VmppTGdZZWNNU3hYQytlblIydlRRT0FLK3Y2d0lGbTYrOXFMVzl3OElaS3NScEZNUnRUQ0U0QXA1U0s3THhvSVgrN1hCNHd4aEFDcG9QZ052UnVwcHNoYmlBeENKNEV4dDNzb0NXOElBS2F3RjZpZmNCeDRBbkF5emhMckFCOVp1RjhCZ2FBTWpDUjRWMExWMVdvdWtWakFSQUFCYUtBMlNmWTlYaFdyeE0waHRJL1Q0a0o2YUx2ZEhNSGtVUHJtVzJiQzVEY1B5a0JjK2NSS0NIMEkxblBaSlljYUVRQzhFaEVXbTJ1VkhjTnIzbnYzTVJIYTR2RGhJaVgxdXdrY09LQ3VYMjVBYnhvcFdJN0JMZXQ5TC9PTC93N1k5dnFvUjNsNHQ1Vzh6dDZlN1pXeWs5RjhhZzI3eWlWZjF4UVMxSUZtR1A2QmgxK2pFMk5hSVBBWHBoOXdENklJVkFUUE8vYXRiS1ZZdys0bTZnTWZBV1k2VWExVi9Kem9udmkvam9nZFBCL09nck9BM29CQUxOMklRMVFCSXBBQUVoUXNzaVlLRmtWVEYxalQxTnpTRXBaQ1hQVEx2akxhTCt0Zm1XaWVVWmFBT1pNL2N1YVRZZnRiSi9DMHFvalZwZjM5UFVPRFAvQTlPaS9ONXNETG43TFVwSTg0TlR6N1hESURlREZ5WXg5NEdRNy9Mdlp4V2VLeFowRDFZMUtYUjNIM3lhODRWTHgyNHVGZGF6Ym9BSFFueHY5enlwdUEvZUN2d2dlQlh4d0dkZ0d1ZzNZQVFxQlNaZkQyUUxjTHVBbTRCUncvN0o2UHAvcnVGL2kvcXZBSURDVnFVSWdNNk9oQldqcisrMWlQRXJTRW85SVd0OVA5Z0dUb01hZFR0UmR2bkNMdnpQa2ZnTXdpVXhpMDFYUXpVN09BNlhGc0k0QkNGczJBOS9XTTdoUUtuL1A5Tm1EWWRUbjVyU21zSThsSTUxK1h2T3hjd040a2MxQUFzVDg2R0w5dzR2Tm1kN2VQYjI5NjFuZEZzZkRRclNsOEdNOW8vbTlVZGhncmdJRm9BWThDR3doY1RWb0hpWUVWa1BzQlhiWmVhQnU4UDh0UUQ5d1AzQW1BLytmdi9TWTRqOEExZ0RhZWNlVXJDb2NxYUh1RnRzVVhBSFYzY2l5S1FVbkcreHQwRTlwTUU5a3RUenpqSmE0QnNQa1NsK2N6RWhOd2lGbUVvWXBDM0NoRy9vRUlBa0JRVEdYSWU3c0cvNEs2RC9OVFN4b1UzVlpieHJJMmZUM05MQndFU3ZHcFdJQWFkSEtJOFRhZkhWKzhlK2JyWENvZDBkUHp3QWIwdzZWTW5PZ0x6T2ZaYjJJcEhBelNQVFQ1UFd3NVZUU3ZTQUIzZ3FzQjNhQTFnSmJDQ05FbzhCWHNTUUk2YUpSTEU4QTdIVXZBYXVCS1RjOG5UTXhnM1gveWpGOEFwZUxlMjVvc3dRRUVia3hPeTdBeWZocHl0cS9hMmNCR1dMYnRHN0Foc2xRWmcwNGtwUWFianN0c3NBb2d3Z2VrUWEyQjhXYmVnYy9HRFhmWDV1VnJyMGhiYnNobHd1ZGV2RUdXZWNHOEdKR1JBR2hGcXQvbTEzODM2MncwVlBkV3dxR283Z25WdDhHYjUvMFp3aW5qR2tEM3l2OXR4dWVoNm1BVG9CK0FlWXhvRVlBVUFZR2dRcEJNV0pIOGVjVlJyQmtvLytzQWRpMnI4a01BaVBjK0MwUHFEdndKSER1UDdVRUg1UnVUaVYwZGdobjRWcks0Rkd1N3N2cHltVW1sK3c2aWpObHJvK0xnZ2dKMjRjRTJITlkwSzNGbmtxbDU3M051WDlvTmZvZEZJYU1Dd2djdFR1ODZNazJsNXdCSVBPQitjQmNISDl1ZnZHalVWenJyV3l2VklZaXRUM1dieEgrTFVJT1Nma2V3RE82UmFJQStoQndDR3lBQThCRHdHbGdEWFhPK28wZ1MyR29BVkYzSi9IeTFVUGtOSHNZbU0wZ3AybjBYd0lpb04xUjk0N2pkMmtBWlFtaGlmNXp1azA0Y2RoTW5VSHdxY2FuM3B3QjB5RjdkaEhza0RBZWtoY3VBWS9CTU9zOC8vWlMvd1BnSDE2Y1BxaFV2OXRPSWpQYWI1dk9Uai8zOVppNUFieGlVT2w4clA2OTF2ajdkamhhS2EwTHZKRlk3NGpWbmN6YW1DWUp5VGdJL0JhU3ZhaDI5NTRtM0FZU1RCRmdRQlh3T21BRDBPYzJROFladklpNzBVOTcwUWVBQWpDMURCM3kzV3hkT01lZnNwM1RORUE2NUI3a2NCNFgyZHUrTEp1aUduYVJqTlA0TkttRlkwT2t4QWNHTTVGaEVFRUF0Z25HdnRxUVRRQzZyZGl6dHRUemdhajIyNjBhdVJrVzJkVTc5blZPQWhPdm51M2NsN1FCcEZDcFBRMXFXdC9YYW4xVVJXZDhiOGp6ZXBqSm9BVVljQk4wQ0JnRElzZHpmZ2ZSdGN4TlVCWDBNUEFra2VYdEZJRlZ3SHFnQ3RTQmxydktTd3pBQTlZQWRSZm5jUGVBVGczVVhLQ2ZqZnY5emcvSjZweklCRDlrOFVwbW9xUkZQWUU0aVpKT0wwcWJYU2liSVFqTGRiTmdaL0t3OWtsSndCam1uVjd4dGxMLzF3Uy9yekgzTlJXbllZOXdiNDNkZ29VekYzZktteHZBK1U0RGF3WnR3dy9IOFVkMS9MQVVWZUZ0QlZYWTlBQjNrYnlhcUVBNFNRRHdIa29xUjAzZzQrQ3prcDRHamJ0aEIyVmdyZU4xaHM1VHlrd0RRRC9RNDJZaFprOEFtLzdXQUpVSmZteTg1Q1ZLYVJuRmx0RnR1YzFMVFJwRWJNSCs3dlNBQUdaSzJ0V1QzNEtJTFQwdVNRd0lnc2dIbURtRVdTZTlOeFI3ZzZEMEszSHRqOXAxdzF3RzRzeDVSVzQyWGcwNCtkeFhvYjNpUXJucUx4ZlBNWHc4NEJvaHZ3M2lWdVlpc3dhSDRFZEFZMFFiMlRUQkplQ3pSUC9JWENKRURBMVVnYmNBeGxWRFk2QU56QUpuSEticEF4cllBR2pnckVOTGtFbC9BMkRjYVZVS2dCYUJrcnVWZ1FJb0lQaHNjMU8yS1lFTGpkZ0dNTVJKb1NEUlZBWVIwbFZlbWJGNXlUUXJBa2w3WndiQnJCTGV0VjZwNm5uL29OcC9FN2VhakI1SHN6T3VpS0VkWER2MlhLWVk1U2ZBcStBMDBJQUVpc0E0OHoxc1BnTmVGRFFNc3EwRlphRGxtQkVmQStiZC9RMndIMWdQaEVBTUhBUFpsZmQyN2tQUmxRNHF3REF3NWVhZ0lMdWF4VzBJejhZL0x1NVBmaUlBTDRVOFhXdkwwa01BblJxWTFlKzBXeEVaeUpVenRUcXJDakV3SXNSZGhlcGV2K2ZmamZyRnFQWkZGVnNqMU4xOTk3YjV1QVljZjdXRlBia0JYR2g2RUR1MHZnN2N6M3dQK0RBd0FMRWVLSUh0Z3NwaHdBQ0xRQnNvQUhjQWJZQ0JVZUFKWUF6UWxNemRyd0pWbC83Q3Jmamw3dlEzQU9aY1NDMHpOckQ4Nnd6Sm5wRGRjMHBMVDNaMmdZNWpDakVsT1RRblpBbENERGFnVFNUdjlpdjdnL0xYd0w4YUxuNUt0Y0hja3lGb3BJMzVsdkY2R2ppZE1lTlhvK1FoMEFXSkQ5aXAwWllqdlIrNEMzUU4yQURqUUIwVUFvOFNJdVpkd0F3UUF2ZGFhaERCQUZYR2xkMWtoem93MnUydDA1YTBpUXp1R1dSdUJVY0hLcnFmK0NCSjhKaHRTdUFSSkFqTU11bjNaY3QyY0xnVEp3eG13QWY1eEFLa21FTndsY1F1NFYwdVBGLzQ5MmoxVDZaMXhwaXlDODg0VXgrQXEzWlBBYWN2bXFhV0Z4anU1dkxzRWdNTFFNRVIxQTRBajRJM0FUY0J1MEZWc0EvY3dGZ0E1Z0FQT092WURSNVJaSGkxODltMkxGb0VobHloMU9zbWpjMW5NTk1sTFdscG9VcDFpSFMydTUzU21tMW0wd1NuWHlTTk1BQTRPV28wV0RFSDRIVkM3cVhDUnE4NENmMzNxdlY1MVJwbkxnTURya2s2SFpHZEJta0x3RWxnOGJYeXllWW53SE8rWGtGQ3lVeDJkSmVCeTBEWEF2M2dOakFEdElFbThEVGhKRWd4KzhDTmpoM3dkU0FHTGdQc0dPb3BZTlJGTllYTWpveWdHd0lLbk9QM3U0OEZkeCtTZ0VSeURnakxFYklxeTUxQkVpWVo2WXdTYUIySlBjTGZTWjZSOGhHdFBtWENKNHpTZGlOZ1pwaUZ5WnhPQk5TQjA4RDBxd2ZqenczZ3BSTGg5TStxaTIxazJRRHNCZGE1alFHU2NCWjRtTkVEYkFVVU1BMGNjQmQ5RHpEb0ZoU2NkbXVYR3NCTU4vTW5UUXlXYUgraHUwWm04Ui9aUFhXSEFBbE9HOFJLSkRhRDlwRzNTWGlBT0FqOVpZNGZNMnFHMlk3ZmtwbE9ocFJESWQwU25SUEF4Q3M2dnlRUGdTNHVtS2lkYWRTeXNmdHA0QVN3R3JnQzJFaUlHR1hnZWxzMkJqUnd5bDV4Z3VGa0VwRUJWcm1NbVlIRjdrbEJXVzVjR2d1SmJ0NEJRQWFzQVNULzJxa2xrRUFQcUkvRVdvZ05KTlpBVkVrMHdJZUpQMjJpSjFoTk1BdWdDdlE1dlRjWklsUGFxN2tBbkFYR1h5VzhodndFZUdXdW9KK0JaU3hNM2d1c0ExWURWUmNwdGR4b2FBQ2JRWHZBMDhCSllCZFFBTTRBRFdESytYalBhYUYxOXNJZE93V1hBYWZZcUoyM1hnWjZnU3JRQzdGYWlGVXNWeFAxRXpSb25uRVdmQXo2Q091VGJCWmNzZGt1QXRTWkVmRFpRRjhCYzhCcE82b3hjeWJrQnBETCtaQWk2Y0lQQlVSQUdkZ09ySFBmZXNCSjRCaHdBekFFSEFhZUFkWUErNEFGNExCanY2VTFyMzVnRUtpNkRLRUhxQUlsSXArcENGU0lDa3hWb0Vnb2dBckp1VVNMZ21hWng4QW5vYzh5enpGYlRuWFpuU1E2MDdOaU1wQXIzSFRyTWVETWF5ak56UTNnWlpVVXBFOXJwU1ZnSGJBZUVFQUxhQUlGZ0lCSGdRWmhMZU1xWUJSNHpIbmw5RlJKNGM2aTAvNEM0QkY1YkpzQjdFd0hoTXgxb0ExdXV3NHl5cERuMGx3bGZXVFIvYWw3cnU5K3hrMW1qek4zNXRmNjU1WG5BQyt5YU1jU1MyOXQ0REF3Qld3QmVqSmdmd1B3UUx2QlhtWUxSaFlBalpaMUdOcnRGUW0wei9EQmFVcmd1MG1KY21tUzBJSHdVeDZlZEQrUGdTbGdJdE9Va3hXK0JENnYzQUJlcWl6WmROTS81NEhIZ00zQVpyZEdvQXBVbUFWd0tqTW9pcm9uUDR0TVdKV2RpcjZrR0x3a2RVN3BPakl6dWpRRlZUV1Nlc1UwTUErRTNmRUFYMktmVkI0Q3ZlVFhOMDFoQVNoZ0VOamo2QlVBSm9BV1VNdXM0VmhpQUtKNzQ3Zm9icXVuWmN0Z3ZJelZwZG10Y3RXSlJXQVJhSjFyQVBBbCt3SGw4akxaQU54bXAwSGdCc0FBRGVBUW9JRDVaWW9yTW1vdGxrMFRXcjc3a1RJZ3BvMXRZZ2RBdFlGd0dZNTVLU3Q5YmdBdjl5V21ibU9JZ1IzQVZsZjVPbkl1bFAwOG0yQ29lejlBZG51TkpVcVlsVjlKcnZSNUR2QnlDeS83MXVLaEk2NlBSSy93Vit5eTZoZmkyL2dTUzJxZnE0ajhFcno4OW1BTEJaNEQzVis2SjhvMVBqZUFpL1JBOElBQjF6eWVoNkc1QVZ3cVVSQzdvUkoyZU1UeFBETEo1WkpLaFQxSDZia2RXSk5mbEZ3dU5RTVFRQyt3SDFpVlg1R0w1blBKNVdXNnloN1FEeFNBeWRkRU0yRnVBTGs4aDB6TGMvdmgydTY2NTZGL0xwZFcvSk5MTHJua2trc3V1ZVNTU3k2NTVKSkxMcm5ra2tzdXVlU1NTeTY1NUpKTExybmtra3N1dWVTU1N5NjU1SkpMTHJua2trc3V1ZVNTU3k2NTVKSkxMcm5ra2tzdXVlU1NTeTY1NUpKTExybmtrc3NMbFh5SVF5NjU1SkpMTHJua2trc3V1ZVNTU3k2NTVKSkxMcm5ra2tzdXVlU1NTeTY1NUpKTExybmtra3N1dWVTU1N5NjU1SkpMTHJua2trc3V1ZVNTU3k2NTVKSkxMcm5ra2tzdXVlU1NTeTY1NUpKTExybmtra3N1dWVTU1N5NjU1SkpMTHJua2trc3V1ZVNTU3k2NTVKSkxMcm04NlBML0EraXpxdWlaV1dweUFBQUFBRWxGVGtTdVFtQ0MiLz4KPC9zdmc+Cg==';

function BrandLogo({
  size = 40,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  return (
    <img
      src={BRAND_LOGO_SRC}
      alt="Cine Stream"
      width={size}
      height={size}
      className={`rounded-[22%] object-cover shadow-lg shadow-primary/20 ${className}`}
      style={{ width: size, height: size }}
      draggable={false}
    />
  );
}

function GlassDropdown({
  label,
  valueLabel,
  options,
  value,
  onChange,
  className = '',
  size = 'md',
}: {
  label: string;
  valueLabel: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  size?: 'md' | 'lg';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const heightClass = size === 'lg' ? 'h-14' : 'h-11';

  return (
    <div className={`relative w-full min-w-0 ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label={label}
        aria-expanded={open}
        className={`flex ${heightClass} w-full items-center justify-between gap-2 rounded-2xl border border-white/20 px-3.5 text-[13px] font-semibold tracking-tight text-white transition hover:border-white/35 sm:px-4`}
        style={{
          background: 'rgba(255,255,255,0.12)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          boxShadow: '0 1px 0 rgba(255,255,255,0.16) inset',
        }}
      >
        <span className="min-w-0 truncate">{valueLabel}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-white/80 transition ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 z-50 mt-2 max-h-64 w-full min-w-[160px] overflow-y-auto rounded-2xl border border-white/20 py-1.5 shadow-2xl"
          style={{
            background: 'rgba(22, 22, 30, 0.92)',
            backdropFilter: 'blur(28px) saturate(180%)',
            WebkitBackdropFilter: 'blur(28px) saturate(180%)',
            boxShadow:
              '0 1px 0 rgba(255,255,255,0.1) inset, 0 16px 40px rgba(0,0,0,0.45)',
          }}
        >
          {options.map(opt => (
            <button
              key={opt.value || 'all'}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={`flex w-full px-4 py-2.5 text-left text-[13px] font-semibold transition ${
                value === opt.value
                  ? 'bg-primary/25 text-white'
                  : 'text-white/85 hover:bg-white/10 hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Browse({ type }: { type: 'movie' | 'tv' }) {
  const movieCategories = {
    popular: 'Popular',
    top_rated: 'Top rated',
    now_playing: 'In theaters',
    upcoming: 'Coming soon',
  } as const;

  const tvCategories = {
    popular: 'Popular',
    top_rated: 'Top rated',
    on_the_air: 'On the air',
    airing_today: 'Airing today',
  } as const;

  const labels = type === 'movie' ? movieCategories : tvCategories;
  type Category = keyof typeof labels;

  const [category, setCategory] = useState<Category>('popular');
  const [country, setCountry] = useState('');
  const [genreId, setGenreId] = useState('');
  const [page, setPage] = useState(1);
  const [allItems, setAllItems] = useState<Media[]>([]);

  const seenRef = useRef<Set<string>>(new Set());
  const loadedPagesRef = useRef<Set<number>>(new Set());
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const genresQuery = useGetGenres();
  const genreList =
    type === 'movie'
      ? genresQuery.data?.movies || []
      : genresQuery.data?.tv || [];

  const result = useGetDiscoverMedia({
    type,
    category,
    page,
    country: country || undefined,
    genre: genreId ? Number(genreId) : undefined,
  });

  const { saved, toggle } = useSavedMedia();

  useEffect(() => {
    setPage(1);
    setAllItems([]);
    seenRef.current.clear();
    loadedPagesRef.current.clear();
  }, [category, type, country, genreId]);

  useEffect(() => {
    const incoming = result.data?.items;
    if (!incoming?.length) return;
    if (loadedPagesRef.current.has(page)) return;
    loadedPagesRef.current.add(page);

    const fresh: Media[] = [];
    for (const item of incoming) {
      const key = mediaKey(item);
      if (seenRef.current.has(key)) continue;
      seenRef.current.add(key);
      fresh.push(item);
    }

    if (fresh.length === 0) return;

    setAllItems(current =>
      page === 1 ? fresh : [...current, ...fresh],
    );
  }, [result.data, page]);

  const totalPages = result.data?.total_pages ?? 1;
  const hasMore = page < totalPages;
  const displayItems = allItems;

  useEffect(() => {
    if (
      !result.isFetching &&
      hasMore &&
      displayItems.length < 48 &&
      result.data
    ) {
      setPage(p => p + 1);
    }
  }, [displayItems.length, hasMore, result.isFetching, result.data]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !result.isFetching) {
          setPage(p => (p < totalPages ? p + 1 : p));
        }
      },
      { rootMargin: '1400px 0px', threshold: 0 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, totalPages, result.isFetching]);

  const loadMore = () => {
    if (!result.isFetching && hasMore) setPage(p => p + 1);
  };

  let content: ReactNode;

  if (displayItems.length === 0 && result.isLoading) {
    content = <LoadingRail />;
  } else if (result.isError) {
    content = (
      <QueryMessage error retry={() => result.refetch()} />
    );
  } else {
    content = (
      <>
        <div className="stagger-grid grid grid-cols-2 min-[400px]:grid-cols-3 gap-x-2.5 gap-y-5 sm:grid-cols-4 sm:gap-y-7 lg:grid-cols-6">
          {displayItems.map(item => (
            <MediaCard
              key={mediaKey(item)}
              item={item}
              saved={saved.includes(mediaKey(item))}
              toggle={toggle}
            />
          ))}
        </div>

        <div ref={sentinelRef} className="h-16 w-full" />

        {hasMore && (
          <div className="flex flex-col items-center gap-4 pb-12 pt-6">
            {result.isFetching ? (
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Loading more titles…
              </span>
            ) : (
              <button
                onClick={loadMore}
                className="rounded-xl border border-white/20 bg-card px-8 py-3.5 text-sm font-bold uppercase tracking-[0.12em] text-foreground transition hover:border-primary hover:text-primary"
              >
                Load more titles
              </button>
            )}
          </div>
        )}

        {!hasMore && displayItems.length > 0 && (
          <div className="flex justify-center py-10">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              End of catalog · {displayItems.length} unique titles
            </span>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="space-y-9 pt-6">
      <PageIntro
        kicker={type === 'movie' ? 'The feature shelf' : 'The series shelf'}
        title={type === 'movie' ? 'Movies' : 'TV shows'}
        copy={
          type === 'movie'
            ? 'Big swings, quiet gems, and the ones everyone will be talking about.'
            : 'Long-form stories for a night you do not want to end.'
        }
      />

      <div className="flex flex-wrap items-center gap-2.5">
        {Object.entries(labels).map(([key, label]) => (
          <button
            key={key}
            data-testid={`button-category-${key}`}
            onClick={() => setCategory(key as Category)}
            className={`rounded-2xl border px-5 py-2.5 text-[13px] font-semibold tracking-tight transition backdrop-blur-md ${
              category === key
                ? 'border-primary/60 bg-primary text-primary-foreground shadow-lg shadow-primary/25'
                : 'border-white/20 bg-white/10 text-white/80 hover:border-white/35 hover:bg-white/16 hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}

        <div className="ml-auto grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <GlassDropdown
            label="Filter by genre"
            value={genreId}
            valueLabel={
              genreList.find(g => String(g.id) === genreId)?.name ||
              'All genres'
            }
            onChange={setGenreId}
            options={[
              { value: '', label: 'All genres' },
              ...genreList.map(g => ({
                value: String(g.id),
                label: g.name,
              })),
            ]}
          />
          <GlassDropdown
            label="Filter by country"
            value={country}
            valueLabel={
              ORIGIN_COUNTRIES.find(c => c.code === country)?.label ||
              'All countries'
            }
            onChange={setCountry}
            options={[
              { value: '', label: 'All countries' },
              ...ORIGIN_COUNTRIES.map(c => ({
                value: c.code,
                label: c.label,
              })),
            ]}
          />
        </div>
      </div>

      {content}
    </div>
  );
}

/* =========================================================
   HISTORY PAGE
   ========================================================= */

const ANIMATION_GENRE_ID = 16;

function AnimePage() {
  const [mediaType, setMediaType] = useState<'tv' | 'movie'>('tv');
  const [country, setCountry] = useState('JP');
  const [genreId, setGenreId] = useState('');
  const [page, setPage] = useState(1);
  const [allItems, setAllItems] = useState<Media[]>([]);

  const seenRef = useRef<Set<string>>(new Set());
  const loadedPagesRef = useRef<Set<number>>(new Set());
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const genresQuery = useGetGenres();
  const genreList =
    mediaType === 'movie'
      ? (genresQuery.data?.movies || []).filter(g => g.id !== ANIMATION_GENRE_ID)
      : (genresQuery.data?.tv || []).filter(g => g.id !== ANIMATION_GENRE_ID);

  const result = useQuery({
    queryKey: ['anime', mediaType, page, country, genreId],
    queryFn: async () => {
      const path =
        mediaType === 'movie' ? '/discover/movie' : '/discover/tv';
      const withGenres = genreId
        ? `${ANIMATION_GENRE_ID},${genreId}`
        : String(ANIMATION_GENRE_ID);

      const params: Record<string, string | number> = {
        page,
        sort_by: 'popularity.desc',
        with_genres: withGenres,
      };
      if (country) params.with_origin_country = country;

      const data = await tmdbFetch(path, params);
      return {
        items: (data.results || []).map((r: any) =>
          normalize(r, mediaType),
        ),
        total_pages: data.total_pages || 1,
        page: data.page || 1,
      };
    },
  });

  const { saved, toggle } = useSavedMedia();

  useEffect(() => {
    setPage(1);
    setAllItems([]);
    seenRef.current.clear();
    loadedPagesRef.current.clear();
  }, [mediaType, country, genreId]);

  useEffect(() => {
    const incoming = result.data?.items;
    if (!incoming?.length) return;
    if (loadedPagesRef.current.has(page)) return;
    loadedPagesRef.current.add(page);

    const fresh: Media[] = [];
    for (const item of incoming) {
      const key = mediaKey(item);
      if (seenRef.current.has(key)) continue;
      seenRef.current.add(key);
      fresh.push(item);
    }
    if (fresh.length === 0) return;

    setAllItems(current => (page === 1 ? fresh : [...current, ...fresh]));
  }, [result.data, page]);

  const totalPages = result.data?.total_pages ?? 1;
  const hasMore = page < totalPages;

  useEffect(() => {
    if (
      !result.isFetching &&
      hasMore &&
      allItems.length < 48 &&
      result.data
    ) {
      setPage(p => p + 1);
    }
  }, [allItems.length, hasMore, result.isFetching, result.data]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !result.isFetching) {
          setPage(p => (p < totalPages ? p + 1 : p));
        }
      },
      { rootMargin: '1400px 0px', threshold: 0 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, totalPages, result.isFetching]);

  return (
    <div className="space-y-9 pt-6">
      <PageIntro
        kicker="Drawn worlds"
        title="Anime"
        copy="Animation from Japan and beyond — series and films worth staying up for."
      />

      <div className="flex flex-wrap items-center gap-2.5">
        {(
          [
            ['tv', 'Series'],
            ['movie', 'Films'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setMediaType(key)}
            className={`rounded-2xl border px-5 py-2.5 text-[13px] font-semibold tracking-tight transition backdrop-blur-md ${
              mediaType === key
                ? 'border-primary/60 bg-primary text-primary-foreground shadow-lg shadow-primary/25'
                : 'border-white/20 bg-white/10 text-white/80 hover:border-white/35 hover:bg-white/16 hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}

        <div className="ml-auto grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <GlassDropdown
            label="Filter anime by genre"
            value={genreId}
            valueLabel={
              genreList.find(g => String(g.id) === genreId)?.name ||
              'All genres'
            }
            onChange={setGenreId}
            options={[
              { value: '', label: 'All genres' },
              ...genreList.map(g => ({
                value: String(g.id),
                label: g.name,
              })),
            ]}
          />
          <GlassDropdown
            label="Filter anime by country"
            value={country}
            valueLabel={
              ORIGIN_COUNTRIES.find(c => c.code === country)?.label ||
              'All countries'
            }
            onChange={setCountry}
            options={[
              { value: '', label: 'All countries' },
              ...ORIGIN_COUNTRIES.map(c => ({
                value: c.code,
                label: c.label,
              })),
            ]}
          />
        </div>
      </div>

      {allItems.length === 0 && result.isLoading ? (
        <LoadingRail />
      ) : result.isError ? (
        <QueryMessage error retry={() => result.refetch()} />
      ) : (
        <>
          <div className="stagger-grid grid grid-cols-2 min-[400px]:grid-cols-3 gap-x-2.5 gap-y-5 sm:grid-cols-4 sm:gap-y-7 lg:grid-cols-6">
            {allItems.map(item => (
              <MediaCard
                key={mediaKey(item)}
                item={item}
                saved={saved.includes(mediaKey(item))}
                toggle={toggle}
              />
            ))}
          </div>

          <div ref={sentinelRef} className="h-16 w-full" />

          {hasMore && result.isFetching && (
            <div className="flex justify-center py-6">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                Loading more anime…
              </span>
            </div>
          )}

          {!hasMore && allItems.length > 0 && (
            <div className="flex justify-center py-10">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                End of catalog · {allItems.length} titles
              </span>
            </div>
          )}

          {allItems.length === 0 && !result.isLoading && <QueryMessage />}
        </>
      )}
    </div>
  );
}

function HistoryPage() {
  const [items, setItems] = useState<Media[]>(() => getWatchHistory());
  const { saved, toggle } = useSavedMedia();

  useEffect(() => {
    const handler = () => setItems(getWatchHistory());
    window.addEventListener('cinema-history-updated', handler);
    return () => window.removeEventListener('cinema-history-updated', handler);
  }, []);

  const handleRemove = (item: Pick<Media, 'id' | 'media_type'>) => {
    removeFromWatchHistory(item);
  };

  return (
    <div className="space-y-10 pt-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageIntro
          kicker="Your recent screenings"
          title="Watch History"
          copy="Everything you’ve started on this device. Pick up any title right where you left it."
        />
        {items.length > 0 && (
          <button
            onClick={() => {
              if (confirm('Clear your entire watch history?')) {
                clearWatchHistory();
              }
            }}
            className="text-sm font-bold uppercase tracking-[0.1em] text-muted-foreground transition hover:text-red-400"
          >
            Clear history
          </button>
        )}
      </div>

      {items.length ? (
        <div className="stagger-grid grid grid-cols-2 min-[400px]:grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
          {items.map(item => (
            <MediaCard
              key={mediaKey(item)}
              item={item}
              saved={saved.includes(mediaKey(item))}
              toggle={toggle}
              onRemove={handleRemove}
              showProgress
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-white/15 bg-card/40 p-10 sm:p-16">
          <History className="h-7 w-7 text-primary" />
          <h2 className="mt-5 text-3xl font-bold tracking-tight">
            Your story has not started yet.
          </h2>
          <p className="mt-3 max-w-md text-[16px] leading-7 text-muted-foreground">
            Start watching from any title page and your local history will
            appear here.
          </p>
          <Link
            href="/movies"
            className="mt-7 inline-flex items-center gap-2.5 rounded-xl bg-primary px-5 py-3.5 text-sm font-bold uppercase tracking-[0.12em] text-primary-foreground"
          >
            Browse movies
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </div>
  );
}

/* =========================================================
   OTHER PAGES (kept clean)
   ========================================================= */

function Genres() {
  const genres = useGetGenres();
  const [selected, setSelected] = useState<{
    id: number;
    name: string;
    type: 'movie' | 'tv';
  } | null>(null);
  const [yearFilter, setYearFilter] = useState('');
  const [countryFilter, setCountryFilter] = useState('');

  // Infinite scroll states
  const [page, setPage] = useState(1);
  const [allItems, setAllItems] = useState<Media[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const loadedPagesRef = useRef<Set<number>>(new Set());
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const { saved, toggle } = useSavedMedia();

  const hasExtraFilters = !!(yearFilter || countryFilter);
  const useDiscover = !!selected || hasExtraFilters;

  // Trending (default view — no genre / year / country)
  const trending = useGetTrending(
    { page },
    { query: { enabled: !useDiscover } },
  );

  // Genre + year + country discover
  const genreResult = useGetDiscoverMedia(
    {
      type: selected?.type || 'movie',
      category: 'popular',
      page,
      genre: selected?.id,
      country: countryFilter || undefined,
      year: yearFilter || undefined,
    },
    { query: { enabled: useDiscover } },
  );

  const activeQuery = useDiscover ? genreResult : trending;
  const totalPages = activeQuery.data?.total_pages ?? 1;
  const hasMore = page < totalPages;

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 1949 }, (_, i) => currentYear - i);

  // Reset when filters change
  useEffect(() => {
    setPage(1);
    setAllItems([]);
    seenRef.current.clear();
    loadedPagesRef.current.clear();
  }, [selected, yearFilter, countryFilter]);

  // Merge unique items
  useEffect(() => {
    const incoming = activeQuery.data?.items;
    if (!incoming?.length) return;
    if (loadedPagesRef.current.has(page)) return;

    loadedPagesRef.current.add(page);

    const fresh: Media[] = [];
    for (const item of incoming) {
      if (yearFilter && year(item.release_date) !== yearFilter) continue;
      const key = mediaKey(item);
      if (seenRef.current.has(key)) continue;
      seenRef.current.add(key);
      fresh.push(item);
    }

    if (fresh.length === 0) return;

    setAllItems(current =>
      page === 1 ? fresh : [...current, ...fresh],
    );
  }, [activeQuery.data, page, yearFilter]);

  // Aggressive auto load
  useEffect(() => {
    if (
      !activeQuery.isFetching &&
      hasMore &&
      allItems.length < 48 &&
      activeQuery.data
    ) {
      setPage(p => p + 1);
    }
  }, [allItems.length, hasMore, activeQuery.isFetching, activeQuery.data]);

  // Infinite scroll observer
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !activeQuery.isFetching) {
          setPage(p => (p < totalPages ? p + 1 : p));
        }
      },
      { rootMargin: '1200px 0px', threshold: 0 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, totalPages, activeQuery.isFetching]);

  // Unique genres once (by id). Prefer movie list when ids overlap.
  const allGenres = [
    ...(genres.data?.movies || []).map(g => ({
      ...g,
      type: 'movie' as const,
    })),
    ...(genres.data?.tv || []).map(g => ({
      ...g,
      type: 'tv' as const,
    })),
  ].filter(
    (item, index, arr) => arr.findIndex(x => x.id === item.id) === index,
  );

  return (
    <div className="space-y-8 pt-6">
      <PageIntro
        kicker="A world of stories"
        title="Browse by mood"
        copy="Start with a feeling. We will take care of the rest."
      />

      {/* Genre buttons – each genre appears only once */}
      {genres.isLoading ? (
        <div className="flex w-full flex-wrap gap-1.5">
          {Array.from({ length: 20 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-16 rounded-full" />
          ))}
        </div>
      ) : genres.isError ? (
        <QueryMessage error retry={() => genres.refetch()} />
      ) : (
        <div className="flex w-full flex-wrap gap-1.5">
          <button
            onClick={() => setSelected(null)}
            className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold tracking-tight transition-all ${
              !selected
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-white/15 bg-white/8 text-white/75 hover:border-primary/50 hover:text-foreground'
            }`}
          >
            Trending
          </button>

          {allGenres.map(genre => (
            <button
              key={genre.id}
              onClick={() =>
                setSelected(current =>
                  current?.id === genre.id
                    ? null
                    : {
                        id: genre.id,
                        name: genre.name,
                        type: genre.type,
                      },
                )
              }
              className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold tracking-tight transition-all ${
                selected?.id === genre.id
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-white/15 bg-white/8 text-white/75 hover:border-primary/50 hover:text-foreground'
              }`}
            >
              {genre.name}
            </button>
          ))}
        </div>
      )}

      {/* Year + Country filters */}
      <div className="grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap sm:items-center">
        <div className="min-w-0 sm:w-36">
          <GlassDropdown
            label="Filter by year"
            value={yearFilter}
            valueLabel={yearFilter || 'Any year'}
            onChange={setYearFilter}
            options={[
              { value: '', label: 'Any year' },
              ...years.map(y => ({ value: String(y), label: String(y) })),
            ]}
          />
        </div>
        <div className="min-w-0 sm:w-44">
          <GlassDropdown
            label="Filter by country"
            value={countryFilter}
            valueLabel={
              ORIGIN_COUNTRIES.find(c => c.code === countryFilter)?.label ||
              'Any country'
            }
            onChange={setCountryFilter}
            options={[
              { value: '', label: 'Any country' },
              ...ORIGIN_COUNTRIES.map(c => ({
                value: c.code,
                label: c.label,
              })),
            ]}
          />
        </div>
        {(yearFilter || countryFilter) && (
          <button
            type="button"
            onClick={() => {
              setYearFilter('');
              setCountryFilter('');
            }}
            className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground transition hover:text-foreground"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Content */}
      <section className="space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold tracking-tight">
            {selected
              ? selected.name
              : hasExtraFilters
                ? 'Filtered'
                : 'Trending Now'}
            {selected && (
              <span className="ml-2 font-mono text-xs text-muted-foreground">
                / {selected.type === 'movie' ? 'films' : 'series'}
              </span>
            )}
            {(yearFilter || countryFilter) && (
              <span className="ml-2 font-mono text-xs text-muted-foreground">
                {[
                  yearFilter,
                  ORIGIN_COUNTRIES.find(c => c.code === countryFilter)?.label,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            )}
          </h2>

          {selected && (
            <button
              onClick={() => setSelected(null)}
              className="text-muted-foreground transition hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {allItems.length === 0 && activeQuery.isLoading ? (
          <LoadingRail />
        ) : activeQuery.isError ? (
          <QueryMessage error retry={() => activeQuery.refetch()} />
        ) : (
          <>
            <div className="stagger-grid grid grid-cols-2 min-[400px]:grid-cols-3 gap-x-2.5 gap-y-5 sm:grid-cols-4 sm:gap-y-6 lg:grid-cols-6">
              {allItems.map(item => (
                <MediaCard
                  key={mediaKey(item)}
                  item={item}
                  saved={saved.includes(mediaKey(item))}
                  toggle={toggle}
                />
              ))}
            </div>

            <div ref={sentinelRef} className="h-14 w-full" />

            {hasMore && activeQuery.isFetching && (
              <div className="flex justify-center py-6">
                <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                  Loading more…
                </span>
              </div>
            )}

            {!hasMore && allItems.length > 0 && (
              <div className="flex justify-center py-8">
                <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                  End of catalog · {allItems.length} titles
                </span>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function SearchPage() {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'movie' | 'tv' | 'person'>('all');
  const [yearFilter, setYearFilter] = useState('');
  const [genreFilter, setGenreFilter] = useState<{ id: number; name: string } | null>(null);
  const [countryFilter, setCountryFilter] = useState('');

  // Infinite scroll states
  const [page, setPage] = useState(1);
  const [allItems, setAllItems] = useState<Media[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const loadedPagesRef = useRef<Set<number>>(new Set());
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const { saved, toggle } = useSavedMedia();
  const genresQuery = useGetGenres();

  const hasDiscoverFilters = !!(yearFilter || genreFilter || countryFilter);

  // Debounce
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(input.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [input]);

  // Reset on filter change
  useEffect(() => {
    setPage(1);
    setAllItems([]);
    seenRef.current.clear();
    loadedPagesRef.current.clear();
  }, [query, filter, yearFilter, genreFilter, countryFilter]);

  // All genres list (dedupe by id, prefer movie entry when ids collide)
  const allGenres = [
    ...(genresQuery.data?.movies || []),
    ...(genresQuery.data?.tv || []),
  ].filter(
    (item, index, arr) => arr.findIndex(x => x.id === item.id) === index,
  );

  // Trending (default)
  const trending = useGetTrending(
    { page },
    { query: { enabled: !query && !hasDiscoverFilters } },
  );

  // Discover with year + genre + country
  const discoverResult = useQuery({
    queryKey: [
      'discover-filter',
      yearFilter,
      genreFilter?.id,
      countryFilter,
      filter,
      page,
    ],
    enabled:
      hasDiscoverFilters &&
      (filter === 'all' || filter === 'movie' || filter === 'tv'),
    queryFn: async () => {
      const type = filter === 'tv' ? 'tv' : 'movie';
      const path = type === 'movie' ? '/discover/movie' : '/discover/tv';

      const params: Record<string, string | number> = {
        page,
        sort_by: 'popularity.desc',
      };

      if (yearFilter) {
        if (type === 'movie') params.primary_release_year = yearFilter;
        else params.first_air_date_year = yearFilter;
      }

      if (genreFilter) {
        params.with_genres = genreFilter.id;
      }

      if (countryFilter) {
        params.with_origin_country = countryFilter;
      }

      const data = await tmdbFetch(path, params);
      return {
        items: (data.results || []).map((r: any) =>
          normalize(r, type as 'movie' | 'tv'),
        ),
        total_pages: data.total_pages || 1,
      };
    },
  });

  // Normal search
  const searchResult = useSearchCatalog(
    { query, filter },
    { query: { enabled: query.length > 0 && !hasDiscoverFilters } },
  );

  // Decide active source
  const activeQuery = hasDiscoverFilters
    ? discoverResult
    : query
      ? searchResult
      : trending;

  const totalPages = activeQuery.data?.total_pages ?? 1;
  const hasMore = page < totalPages && !(query && !hasDiscoverFilters);

  // Merge unique
  useEffect(() => {
    const incoming = activeQuery.data?.items;
    if (!incoming?.length) return;
    if (loadedPagesRef.current.has(page)) return;

    loadedPagesRef.current.add(page);

    const fresh: Media[] = [];
    for (const item of incoming) {
      if (yearFilter && year(item.release_date) !== yearFilter) continue;

      const key = mediaKey(item);
      if (seenRef.current.has(key)) continue;
      seenRef.current.add(key);
      fresh.push(item);
    }

    if (fresh.length === 0) return;

    setAllItems(current =>
      page === 1 ? fresh : [...current, ...fresh],
    );
  }, [activeQuery.data, page, yearFilter]);

  // Auto load
  useEffect(() => {
    if (
      !activeQuery.isFetching &&
      hasMore &&
      allItems.length < 60 &&
      activeQuery.data
    ) {
      setPage(p => p + 1);
    }
  }, [allItems.length, hasMore, activeQuery.isFetching, activeQuery.data]);

  // Observer
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !activeQuery.isFetching) {
          setPage(p => (p < totalPages ? p + 1 : p));
        }
      },
      { rootMargin: '1200px 0px', threshold: 0 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, totalPages, activeQuery.isFetching]);

  const filters = [
    ['all', 'Everything'],
    ['movie', 'Movies'],
    ['tv', 'Series'],
    ['person', 'People'],
  ] as const;

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 1949 }, (_, i) => currentYear - i);

  const displayItems = allItems;
  const people =
    (!hasDiscoverFilters && query && searchResult.data?.people) || [];

  return (
    <div className="space-y-8 pt-6">
      <PageIntro
        kicker="Find your next thing"
        title="Search the catalog"
        copy="Titles, characters, directors, and the feeling you cannot quite name."
      />

      {/* Search Input + Year + Genre + Country */}
      <div className="flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-2.5">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-primary" />
          <input
            autoFocus
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Try “quiet sci-fi” or a name"
            className="h-14 w-full rounded-xl border border-white/15 bg-card pl-12 pr-4 text-[16px] font-medium text-foreground placeholder:text-muted-foreground transition focus:border-primary focus:outline-none"
          />
        </div>

        {/* Year / Genre / Country – shared liquid glass design (no overlap) */}
        <div className="grid grid-cols-3 gap-2.5 sm:contents">
          <div className="min-w-0 sm:w-[7.5rem] sm:shrink-0 lg:w-36">
            <GlassDropdown
              label="Filter by year"
              value={yearFilter}
              valueLabel={yearFilter || 'Any year'}
              onChange={setYearFilter}
              size="lg"
              options={[
                { value: '', label: 'Any year' },
                ...years.map(y => ({ value: String(y), label: String(y) })),
              ]}
            />
          </div>

          <div className="min-w-0 sm:w-[9.5rem] sm:shrink-0 lg:w-44">
            <GlassDropdown
              label="Filter by genre"
              value={genreFilter ? String(genreFilter.id) : ''}
              valueLabel={genreFilter?.name || 'Any genre'}
              onChange={value => {
                if (!value) {
                  setGenreFilter(null);
                  return;
                }
                const found = allGenres.find(g => String(g.id) === value);
                setGenreFilter(
                  found ? { id: found.id, name: found.name } : null,
                );
              }}
              size="lg"
              options={[
                { value: '', label: 'Any genre' },
                ...allGenres.map(g => ({
                  value: String(g.id),
                  label: g.name,
                })),
              ]}
            />
          </div>

          <div className="min-w-0 sm:w-[9.5rem] sm:shrink-0 lg:w-44">
            <GlassDropdown
              label="Filter by country"
              value={countryFilter}
              valueLabel={
                ORIGIN_COUNTRIES.find(c => c.code === countryFilter)?.label ||
                'Any country'
              }
              onChange={setCountryFilter}
              size="lg"
              options={[
                { value: '', label: 'Any country' },
                ...ORIGIN_COUNTRIES.map(c => ({
                  value: c.code,
                  label: c.label,
                })),
              ]}
            />
          </div>
        </div>
      </div>

      {/* Type filters + active chips */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-5">
        {filters.map(([value, label]) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`px-4 py-2 text-sm font-bold uppercase tracking-[0.1em] transition ${
              filter === value
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}

        {yearFilter && (
          <button
            onClick={() => setYearFilter('')}
            className="flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.1em] text-primary"
          >
            {yearFilter}
            <X className="h-3.5 w-3.5" />
          </button>
        )}

        {genreFilter && (
          <button
            onClick={() => setGenreFilter(null)}
            className="flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.1em] text-primary"
          >
            {genreFilter.name}
            <X className="h-3.5 w-3.5" />
          </button>
        )}

        {countryFilter && (
          <button
            onClick={() => setCountryFilter('')}
            className="flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.1em] text-primary"
          >
            {ORIGIN_COUNTRIES.find(c => c.code === countryFilter)?.label ||
              countryFilter}
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Results */}
      {!query && !hasDiscoverFilters ? (
        <section className="space-y-5">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight">Trending Now</h2>
            <span className="font-mono text-[12px] text-muted-foreground">
              {displayItems.length} titles
            </span>
          </div>

          {displayItems.length === 0 && activeQuery.isLoading ? (
            <LoadingRail />
          ) : (
            <>
              <div className="stagger-grid grid grid-cols-2 min-[400px]:grid-cols-3 gap-x-2.5 gap-y-5 sm:grid-cols-4 sm:gap-y-6 lg:grid-cols-6">
                {displayItems.map(item => (
                  <MediaCard
                    key={mediaKey(item)}
                    item={item}
                    saved={saved.includes(mediaKey(item))}
                    toggle={toggle}
                  />
                ))}
              </div>
              <div ref={sentinelRef} className="h-14 w-full" />
              {hasMore && activeQuery.isFetching && (
                <div className="flex justify-center py-6">
                  <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                    Loading more…
                  </span>
                </div>
              )}
            </>
          )}
        </section>
      ) : activeQuery.isLoading && displayItems.length === 0 ? (
        <LoadingRail />
      ) : activeQuery.isError ? (
        <QueryMessage error retry={() => activeQuery.refetch()} />
      ) : (
        <div className="space-y-10">
          <section>
            <div className="mb-5 flex items-center gap-3">
              <h2 className="text-2xl font-bold tracking-tight">
                {hasDiscoverFilters
                  ? [
                      genreFilter?.name,
                      yearFilter,
                      ORIGIN_COUNTRIES.find(c => c.code === countryFilter)
                        ?.label,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'Filtered'
                  : 'Titles'}
              </h2>
              <span className="font-mono text-[12px] text-muted-foreground">
                {displayItems.length} found
              </span>
            </div>

            {displayItems.length ? (
              <>
                <div className="stagger-grid grid grid-cols-2 min-[400px]:grid-cols-3 gap-x-2.5 gap-y-5 sm:grid-cols-4 sm:gap-y-6 lg:grid-cols-6">
                  {displayItems.map(item => (
                    <MediaCard
                      key={mediaKey(item)}
                      item={item}
                      saved={saved.includes(mediaKey(item))}
                      toggle={toggle}
                    />
                  ))}
                </div>
                <div ref={sentinelRef} className="h-14 w-full" />
                {hasMore && activeQuery.isFetching && (
                  <div className="flex justify-center py-6">
                    <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                      Loading more…
                    </span>
                  </div>
                )}
                {!hasMore && displayItems.length > 0 && (
                  <div className="flex justify-center py-8">
                    <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                      End of results · {displayItems.length} titles
                    </span>
                  </div>
                )}
              </>
            ) : (
              <QueryMessage />
            )}
          </section>

          {!hasDiscoverFilters && people.length > 0 && (
            <section>
              <h2 className="mb-5 text-2xl font-bold tracking-tight">People</h2>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {people.map((person: any) => (
                  <div
                    key={person.id}
                    className="flex items-center gap-3 rounded-xl border border-white/10 bg-card p-3.5"
                  >
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                      {person.profile_path ? (
                        <img
                          src={poster(person.profile_path, 'w185')}
                          alt={person.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-lg font-bold text-primary">
                          {person.name[0]}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-[15px] font-semibold">{person.name}</p>
                      <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        {person.known_for_department}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function Detail({ type }: { type: 'movie' | 'tv' }) {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [showTrailer, setShowTrailer] = useState(false);

  const query =
    type === 'movie'
      ? useGetMovieDetails(id)
      : useGetTvDetails(id);

  const videosQuery = useGetVideos(type, id, {
    query: { enabled: !!id },
  });

  const detail = query.data as MediaDetails | undefined;
  const { saved, toggle } = useSavedMedia();
  const { user } = useAuth();

  const trailer = pickBestTrailer(videosQuery.data || []);

  if (query.isLoading) {
    return (
      <div className="space-y-5 pt-6">
        <Skeleton className="h-[52vh] rounded-2xl" />
        <Skeleton className="h-10 w-1/2" />
      </div>
    );
  }

  if (query.isError || !detail) {
    return (
      <div className="pt-24">
        <QueryMessage error retry={() => query.refetch()} />
      </div>
    );
  }

  const item = detail;
  const href =
    type === 'movie'
      ? `/watch/movie/${id}`
      : `/watch/tv/${id}/1/1`;

  return (
    <>
      {showTrailer && trailer && (
        <TrailerModal
          videoKey={trailer.key}
          title={detail.title}
          onClose={() => setShowTrailer(false)}
        />
      )}

      <div className="relative -mx-3 sm:-mx-5 overflow-hidden lg:-mx-10">
      <div className="relative min-h-[400px] sm:min-h-[520px] md:min-h-[600px] lg:min-h-[640px] border-b border-white/10">
        <div className="absolute inset-0">
          {detail.backdrop_path ? (
            <img
              src={poster(detail.backdrop_path, 'original')}
              alt=""
              className="h-full w-full object-cover opacity-45"
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-background/25" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background/10" />
        </div>

        <div className="relative flex min-h-[400px] sm:min-h-[520px] md:min-h-[600px] lg:min-h-[640px] items-end px-4 pb-10 sm:px-5 sm:pb-14 lg:px-10 lg:pb-20">
          <div className="grid w-full max-w-5xl gap-8 sm:grid-cols-[200px_1fr] sm:items-end">
            <Poster
              item={item}
              className="hidden aspect-[2/3] max-w-[200px] rounded-2xl shadow-2xl sm:block"
              eager
            />
            <div className="max-w-2xl">
              <Link
                href={type === 'movie' ? '/movies' : '/tv-shows'}
                className="mb-7 inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to shelf
              </Link>
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
                {type === 'movie' ? 'Feature film' : 'Original series'} /{' '}
                {year(detail.release_date)}
              </p>
              <h1 className="mt-2 sm:mt-3 text-[1.75rem] font-bold leading-[1.1] tracking-tight sm:text-4xl md:text-5xl lg:text-6xl">
                {detail.title}
              </h1>
              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[12px] uppercase tracking-wider text-muted-foreground">
                <span className="flex items-center gap-1.5 text-red-500">
                  <Star className="h-3.5 w-3.5 fill-red-500 text-red-500" />
                  {detail.vote_average.toFixed(1)} / 10
                </span>
                <span>{duration(detail.runtime)}</span>
                <span>
                  {detail.genres?.map(g => g.name).join(' · ')}
                </span>
              </div>
              <p className="mt-4 sm:mt-6 max-w-xl text-[14.5px] sm:text-[16px] leading-relaxed text-muted-foreground line-clamp-5 sm:line-clamp-none">
                {detail.overview || 'A story waiting to be discovered.'}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <PlayOrAuthLink
                  href={href}
                  className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 sm:px-6 sm:py-3.5 text-xs sm:text-sm font-bold uppercase tracking-[0.12em] text-primary-foreground shadow-lg shadow-primary/25 min-h-11"
                >
                  <Play className="h-4.5 w-4.5 fill-current" />
                  Watch now
                </PlayOrAuthLink>

                {trailer && (
                  <button
                    onClick={() => setShowTrailer(true)}
                    data-testid="button-trailer"
                    className="flex items-center gap-2 rounded-xl border border-white/20 bg-black/30 px-4 py-2.5 sm:px-6 sm:py-3.5 text-xs sm:text-sm font-bold uppercase tracking-[0.12em] text-foreground backdrop-blur transition hover:border-primary hover:text-primary min-h-11"
                  >
                    <Clapperboard className="h-4.5 w-4.5" />
                    Trailer
                  </button>
                )}

                {user && (
                  <button
                    onClick={() => toggle(item)}
                    className="flex items-center gap-2 rounded-xl border border-white/20 px-4 py-2.5 sm:px-6 sm:py-3.5 text-xs sm:text-sm font-bold uppercase tracking-[0.12em] min-h-11"
                  >
                    <Bookmark
                      className={`h-4.5 w-4.5 ${
                        saved.includes(mediaKey(item))
                          ? 'fill-primary text-primary'
                          : ''
                      }`}
                    />
                    {saved.includes(mediaKey(item)) ? 'Saved' : 'My List'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-10 sm:space-y-14 px-0 sm:px-5 py-10 sm:py-14 lg:px-10">
        <section className="grid gap-8 md:grid-cols-[1fr_2fr]">
          <div>
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              The note
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">
              Stay for the details.
            </h2>
          </div>
          <div>
            <p className="text-[16px] leading-7 text-muted-foreground">
              A high-signal pick with{' '}
              {detail.vote_count?.toLocaleString() || 'a growing audience'}{' '}
              votes.
            </p>
            {detail.production_companies?.length ? (
              <p className="mt-5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                {detail.production_companies.join(' / ')}
              </p>
            ) : null}
          </div>
        </section>

        {type === 'tv' && (
          <SeasonList seasons={detail.seasons || []} id={id} />
        )}

        {detail.cast?.length ? (
          <section>
            <div className="mb-6 flex items-end justify-between border-b border-white/10 pb-3">
              <div>
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                  On screen
                </p>
                <h2 className="mt-1 text-3xl font-bold tracking-tight">The cast</h2>
              </div>
            </div>
            <div className="stagger-grid grid grid-cols-2 min-[400px]:grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
              {detail.cast.slice(0, 6).map(actor => (
                <div key={actor.id} className="rounded-xl border border-white/10 bg-card p-2.5">
                  <div className="aspect-square overflow-hidden rounded-lg bg-muted">
                    {actor.profile_path ? (
                      <img
                        src={poster(actor.profile_path, 'w185')}
                        alt={`${actor.name} as ${actor.character}`}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-2xl font-bold text-primary">
                        {actor.name[0]}
                      </div>
                    )}
                  </div>
                  <p className="mt-2.5 text-[15px] font-semibold">{actor.name}</p>
                  <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                    {actor.character}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
    </>
  );
}

function SeasonList({ seasons, id }: { seasons: Season[]; id: number }) {
  const [open, setOpen] = useState(
    seasons.find(x => x.season_number > 0)?.season_number || 1,
  );
  const currentSeason = seasons.find(s => s.season_number === open);
  // Show all episodes (previously hard-capped at 8 — that was a bug)
  const count = Math.max(0, currentSeason?.episode_count || 0);

  return (
    <section>
      <div className="mb-6 flex items-end justify-between border-b border-white/10 pb-3">
        <div>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            Keep going
          </p>
          <h2 className="mt-1 text-3xl font-bold tracking-tight">Episodes</h2>
        </div>
        <div className="relative">
          <select
            value={open}
            onChange={e => setOpen(Number(e.target.value))}
            className="appearance-none rounded-lg border border-white/15 bg-card py-2.5 pl-4 pr-9 text-sm font-bold text-foreground"
          >
            {seasons
              .filter(s => s.season_number > 0)
              .map(s => (
                <option key={s.season_number} value={s.season_number}>
                  {s.name}
                </option>
              ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4" />
        </div>
      </div>
      <div className="divide-y divide-white/10 border-y border-white/10 max-h-[480px] overflow-y-auto">
        {count === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">No episodes listed for this season yet.</p>
        ) : (
          Array.from({ length: count }).map((_, i) => (
          <Link
            href={`/watch/tv/${id}/${open}/${i + 1}`}
            key={`${open}-${i + 1}`}
            className="group flex items-center gap-4 py-4 transition hover:bg-white/[.03]"
          >
            <span className="w-8 font-mono text-sm text-muted-foreground">
              E{i + 1}
            </span>
            <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 text-primary transition group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground">
              <Play className="h-3.5 w-3.5 fill-current" />
            </span>
            <span className="text-[15px] font-semibold">Episode {i + 1}</span>
            <span className="ml-auto font-mono text-[11px] text-muted-foreground">
              Watch episode
            </span>
          </Link>
          ))
        )}
      </div>
    </section>
  );
}

function Watch({ type }: { type: 'movie' | 'tv' }) {
  const params = useParams<{
    id: string;
    season?: string;
    episode?: string;
  }>();
  const id = Number(params.id);

  // Land at the top of the player — no need to scroll up from the footer
  useEffect(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [type, id, params.season, params.episode]);

  const detailQuery =
    type === 'movie' ? useGetMovieDetails(id) : useGetTvDetails(id);

  const title =
    type === 'movie'
      ? 'Your feature is ready.'
      : `Season ${params.season}, episode ${params.episode}`;

  const saveProgress = (progress: {
    event: string;
    currentTime: number;
    duration: number;
    percent: number;
  }) => {
    const item = detailQuery.data;
    if (item) {
      saveWatchProgress(item, {
        ...progress,
        id,
        type,
        season: params.season,
        episode: params.episode,
        updatedAt: new Date().toISOString(),
      });
    }

    if (
      item &&
      ['play', 'timeupdate', 'ended', 'pause'].includes(progress.event)
    ) {
      addToWatchHistory(item);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 pt-6">
      <Link
        href={
          type === 'movie'
            ? `/movie/${params.id}`
            : `/tv/${params.id}`
        }
        className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Exit player
      </Link>

      <VideoPlayer
        type={type}
        id={id}
        season={Number(params.season)}
        episode={Number(params.episode)}
        onProgress={saveProgress}
      />

      <div className="flex flex-col justify-between gap-3 border-b border-white/10 pb-5 sm:flex-row sm:items-center">
        <div>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            Now showing
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">{title}</h1>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock3 className="h-4.5 w-4.5" />
          Progress & history saved on this device
        </div>
      </div>
    </div>
  );
}

function LocalCollection() {
  const { user, loading } = useAuth();
  const { saved, toggle } = useSavedMedia();
  const [items, setItems] = useState<Media[]>(() => getSavedItems());

  useEffect(() => {
    setItems(getSavedItems());
  }, [saved, user?.id]);

  useEffect(() => {
    const handler = () => setItems(getSavedItems());
    window.addEventListener('cinema-history-updated', handler);
    return () => window.removeEventListener('cinema-history-updated', handler);
  }, []);

  return (
    <div className="space-y-10 pt-6">
      <PageIntro
        kicker="Kept close"
        title="My List"
        copy={
          user
            ? 'A private shelf for the titles you are not ready to lose.'
            : 'Sign in to save titles to your personal list.'
        }
      />

      {loading ? (
        <LoadingRail />
      ) : !user ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-card/40 p-10 sm:p-16">
          <Bookmark className="h-7 w-7 text-primary" />
          <h2 className="mt-5 text-3xl font-bold tracking-tight">
            Sign in to use My List
          </h2>
          <p className="mt-3 max-w-md text-[16px] leading-7 text-muted-foreground">
            Bookmark is available only after you sign in. Your list stays with
            your account on this device.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="/sign-in"
              className="inline-flex items-center gap-2.5 rounded-xl bg-primary px-5 py-3.5 text-sm font-bold uppercase tracking-[0.12em] text-primary-foreground"
            >
              Sign in
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/sign-up"
              className="inline-flex items-center gap-2.5 rounded-xl border border-white/20 px-5 py-3.5 text-sm font-bold uppercase tracking-[0.12em]"
            >
              Sign up free
            </Link>
          </div>
        </div>
      ) : items.length ? (
        <div className="stagger-grid grid grid-cols-2 min-[400px]:grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
          {items.map(item => (
            <MediaCard
              key={mediaKey(item)}
              item={item}
              saved={saved.includes(mediaKey(item))}
              toggle={toggle}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-white/15 bg-card/40 p-10 sm:p-16">
          <Bookmark className="h-7 w-7 text-primary" />
          <h2 className="mt-5 text-3xl font-bold tracking-tight">
            Save a few for later.
          </h2>
          <p className="mt-3 max-w-md text-[16px] leading-7 text-muted-foreground">
            Tap the bookmark on anything that catches your eye.
          </p>
          <Link
            href="/"
            className="mt-7 inline-flex items-center gap-2.5 rounded-xl bg-primary px-5 py-3.5 text-sm font-bold uppercase tracking-[0.12em] text-primary-foreground"
          >
            Find something
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </div>
  );
}

function Profile() {
  const health = useHealthCheck();
  const historyCount = getWatchHistory().length;
  const { user, loading, signOut } = useAuth();
  const [, setLocation] = useLocation();

  const handleSignOut = async () => {
    // Keep this account's history in storage; just unbind so UI goes empty
    unbindUserSession();
    await signOut();
    setLocation('/');
  };

  return (
    <div className="space-y-10 pt-6">
      <PageIntro
        kicker="Your screening room"
        title="Profile"
        copy={
          user
            ? 'Your Cine Stream account is connected. Preferences stay on this device until cloud sync is enabled.'
            : 'Sign in to sync across devices, or keep using a private local profile on this browser.'
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1.3fr_.7fr]">
        <div className="rounded-2xl border border-white/10 bg-card p-8 sm:p-10">
          <div className="flex items-start justify-between">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-primary/40 bg-primary/10 text-primary">
              <CircleUserRound className="h-7 w-7" />
            </div>
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {user ? 'Signed in' : 'Guest profile'}
            </span>
          </div>
          <h2 className="mt-8 text-4xl font-bold tracking-tight">
            {user
              ? (user.user_metadata?.full_name as string) ||
                user.email ||
                'Your account'
              : 'Make the room yours.'}
          </h2>
          <p className="mt-3 max-w-lg text-[16px] leading-7 text-muted-foreground">
            {user
              ? user.email
              : 'Tune the way Cine Stream feels on this device.'}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {!loading && !user && (
              <>
                <Link
                  href="/sign-in"
                  className="inline-flex items-center gap-2.5 rounded-xl bg-primary px-6 py-3.5 text-sm font-bold uppercase tracking-[0.12em] text-primary-foreground"
                >
                  Sign in
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/sign-up"
                  className="inline-flex items-center gap-2.5 rounded-xl border border-white/20 px-6 py-3.5 text-sm font-bold uppercase tracking-[0.12em]"
                >
                  Sign up
                </Link>
              </>
            )}
            {user && (
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex items-center gap-2.5 rounded-xl border border-white/20 px-6 py-3.5 text-sm font-bold uppercase tracking-[0.12em] transition hover:border-red-500/50 hover:text-red-400"
              >
                Sign out
              </button>
            )}
            <Link
              href="/settings"
              className="inline-flex items-center gap-2.5 rounded-xl border border-white/20 px-6 py-3.5 text-sm font-bold uppercase tracking-[0.12em]"
            >
              Preferences
            </Link>
            <Link
              href="/history"
              className="inline-flex items-center gap-2.5 rounded-xl border border-white/20 px-6 py-3.5 text-sm font-bold uppercase tracking-[0.12em]"
            >
              <History className="h-4.5 w-4.5" />
              History ({historyCount})
            </Link>
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-2xl border border-white/10 bg-card p-6">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              Device storage
            </p>
            <div className="mt-5 flex items-center justify-between">
              <span className="text-[15px] text-muted-foreground">
                Catalog connection
              </span>
              <span className="flex items-center gap-2 text-sm">
                {health.isLoading
                  ? 'Checking'
                  : health.isError
                  ? 'Offline'
                  : (
                    <>
                      <Check className="h-4 w-4 text-[hsl(var(--accent))]" />
                      Online
                    </>
                  )}
              </span>
            </div>
            <div className="mt-3 h-1.5 rounded-full bg-muted">
              <div className="h-full w-2/3 rounded-full bg-primary" />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Your saved titles & history never leave this browser.
            </p>
          </div>
          <Link
            href="/settings"
            className="flex items-center justify-between rounded-2xl border border-white/10 bg-card p-6 transition hover:border-white/30"
          >
            <span className="flex items-center gap-3 text-[15px] font-semibold">
              <Settings2 className="h-5 w-5 text-primary" />
              Preferences
            </span>
            <ArrowRight className="h-4.5 w-4.5 text-muted-foreground" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function Preferences() {
  const [autoplay, setAutoplay] = useState(
    () => localStorage.getItem('cinema-autoplay') !== 'off',
  );
  const [quality, setQuality] = useState(
    () => localStorage.getItem('cinema-quality') || 'Auto',
  );

  const setAutoplayValue = (value: boolean) => {
    setAutoplay(value);
    localStorage.setItem('cinema-autoplay', value ? 'on' : 'off');
  };

  const prefs = [
    {
      label: 'Autoplay previews',
      copy: 'Start a quiet preview when you focus a title.',
      value: autoplay,
      setter: setAutoplayValue,
    },
  ];

  return (
    <div className="space-y-10 pt-6">
      <PageIntro
        kicker="Make it comfortable"
        title="Preferences"
        copy="Small choices for a better late-night session. These settings stay with this browser."
      />

      <div className="max-w-2xl divide-y divide-white/10 border-y border-white/10">
        {prefs.map(({ label, copy, value, setter }) => (
          <div
            key={label}
            className="flex items-center justify-between gap-6 py-6"
          >
            <div>
              <p className="text-[15px] font-semibold">{label}</p>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">
                {copy}
              </p>
            </div>
            <button
              onClick={() => setter(!value)}
              className={`relative h-7 w-12 shrink-0 rounded-full border transition ${
                value
                  ? 'border-primary bg-primary'
                  : 'border-white/20 bg-muted'
              }`}
            >
              <span
                className={`absolute top-1 h-5 w-5 rounded-full bg-foreground transition ${
                  value ? 'left-6' : 'left-1'
                }`}
              />
            </button>
          </div>
        ))}

        <div className="flex items-center justify-between gap-6 py-6">
          <div>
            <p className="text-[15px] font-semibold">Playback quality</p>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">
              Let the room adapt to your connection.
            </p>
          </div>
          <select
            value={quality}
            onChange={e => {
              setQuality(e.target.value);
              localStorage.setItem('cinema-quality', e.target.value);
            }}
            className="rounded-lg border border-white/15 bg-card px-4 py-2.5 text-sm font-semibold text-foreground"
          >
            <option>Auto</option>
            <option>High</option>
            <option>Data saver</option>
          </select>
        </div>
      </div>
    </div>
  );
}

function Admin({ section = 'overview' }: { section?: string }) {
  const titles: Record<string, [string, string]> = {
    overview: [
      'Studio access',
      'The control room is waiting for its operator.',
    ],
    dashboard: [
      'Dashboard',
      'A quiet overview of your catalog operations.',
    ],
    users: [
      'Users',
      'Member data will appear here once the studio service is configured.',
    ],
    content: [
      'Content',
      'Catalog controls are ready for a future editorial workflow.',
    ],
    settings: [
      'Settings',
      'Studio preferences and integrations will live here.',
    ],
  };

  const [title, copy] = titles[section] || titles.overview;

  return (
    <div className="space-y-10 pt-6">
      <div className="flex flex-col justify-between gap-5 border-b border-white/10 pb-8 sm:flex-row sm:items-end">
        <PageIntro
          kicker="Cine Stream studio"
          title={title}
          copy={copy}
        />
        <span className="inline-flex h-fit items-center gap-2 rounded-lg border border-[hsl(var(--accent)/.35)] bg-[hsl(var(--accent)/.08)] px-3.5 py-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--accent))]">
          <Settings2 className="h-3.5 w-3.5" />
          Setup required
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {['Member data', 'Editorial controls', 'Audience analytics'].map(
          (label, i) => (
            <div key={label} className="rounded-2xl border border-white/10 bg-card p-6">
              <span className="font-mono text-[11px] font-semibold text-primary">
                0{i + 1}
              </span>
              <h2 className="mt-5 text-2xl font-bold tracking-tight">{label}</h2>
              <p className="mt-3 text-[15px] leading-6 text-muted-foreground">
                This studio surface is intentionally reserved for the server
                setup that powers it.
              </p>
              <span className="mt-6 inline-flex rounded-md border border-white/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Unavailable
              </span>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

function About() {
  return (
    <div className="max-w-3xl space-y-10 pt-6">
      <PageIntro
        kicker="The fine print"
        title="About this theater"
        copy="Cine Stream is an independent discovery room for finding what to watch next."
      />
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-card p-6">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            Catalog
          </p>
          <h2 className="mt-4 text-2xl font-bold tracking-tight">Powered by TMDB</h2>
          <p className="mt-3 text-[15px] leading-6 text-muted-foreground">
            Poster, backdrop, title, cast, genre, and rating metadata comes
            from The Movie Database.
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-card p-6">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            Your room
          </p>
          <h2 className="mt-4 text-2xl font-bold tracking-tight">
            Guest-first by default
          </h2>
          <p className="mt-3 text-[15px] leading-6 text-muted-foreground">
            My List and watch history stay local on this device until an
            account service is connected.
          </p>
        </div>
      </section>
      <p className="border-l-2 border-primary pl-5 text-[15px] leading-7 text-muted-foreground">
        This product uses the TMDB API but is not endorsed or certified by
        TMDB.
      </p>
    </div>
  );
}

function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-start justify-center">
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
        Reel not found / 404
      </p>
      <h1 className="mt-4 text-6xl font-bold tracking-tight">Cut to black.</h1>
      <p className="mt-4 max-w-md text-[16px] leading-7 text-muted-foreground">
        That scene does not exist in this theater.
      </p>
      <Link
        href="/"
        className="mt-8 flex items-center gap-2.5 rounded-xl bg-primary px-6 py-3.5 text-sm font-bold uppercase tracking-[0.12em] text-primary-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to tonight
      </Link>
    </div>
  );
}



function PlayOrAuthLink({
  href,
  className,
  children,
  testId,
}: {
  href: string;
  className?: string;
  children: ReactNode;
  testId?: string;
}) {
  const { user, loading } = useAuth();
  const [showWall, setShowWall] = useState(false);

  if (!loading && !user) {
    return (
      <>
        <button
          type="button"
          data-testid={testId}
          onClick={() => setShowWall(true)}
          className={className}
        >
          {children}
        </button>
        <AuthWallModal
          open={showWall}
          onClose={() => setShowWall(false)}
        />
      </>
    );
  }

  return (
    <Link href={href} data-testid={testId} className={className}>
      {children}
    </Link>
  );
}


/* =========================================================
   AUTH WALL (must sign in to watch) + FORGOT PASSWORD
   ========================================================= */

function AuthWallModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose?: () => void;
}) {
  if (!open) return null;

  const modal = (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Sign in required"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border border-white/15 bg-[rgba(18,18,24,0.96)] p-7 shadow-2xl"
        style={{
          backdropFilter: 'blur(28px) saturate(180%)',
          WebkitBackdropFilter: 'blur(28px) saturate(180%)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          Members only
        </p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
          Sign in to watch
        </h2>
        <p className="mt-3 text-[15px] leading-6 text-muted-foreground">
          Create a free account or sign in to play movies and series.
        </p>

        <div className="mt-7 flex flex-col gap-3">
          <Link
            href="/sign-up"
            className="flex h-12 items-center justify-center rounded-xl bg-primary text-sm font-bold uppercase tracking-[0.12em] text-primary-foreground transition hover:brightness-110"
          >
            Sign up free
          </Link>
          <Link
            href="/sign-in"
            className="flex h-12 items-center justify-center rounded-xl border border-white/20 text-sm font-bold uppercase tracking-[0.12em] transition hover:border-white/40 hover:bg-white/5"
          >
            Sign in
          </Link>
        </div>
      <p className="mt-5 text-center text-[12px] text-muted-foreground">
      Already have an account? Use Sign in.
      </p>
               {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="mt-4 w-full text-center text-[12px] text-muted-foreground transition hover:text-foreground"
          >
            Maybe later
          </button>
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

/** Blocks watch pages until the user is signed in */
function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Checking account…
        </span>
      </div>
    );
  }

  if (!user) {
    return (
      <AuthWallModal
        open
        onClose={() => setLocation('/sign-in')}
      />
    );
  }

  return <>{children}</>;
}

/* =========================================================
   COMPLETE PROFILE (name + age after sign-in)
   ========================================================= */

function isProfileComplete(user: any): boolean {
  if (!user) return false;
  const meta = user.user_metadata || {};
  const name = String(meta.full_name || meta.name || '').trim();
  const ageRaw = meta.age;
  const age = Number(ageRaw);
  return name.length >= 2 && Number.isFinite(age) && age >= 5 && age <= 120;
}

/** After login, force name + age if missing */

/** Keeps local history tied to the signed-in Supabase user */
function AuthSessionBinder() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (user?.id) {
      bindUserSession(user.id);
    } else {
      unbindUserSession();
    }
  }, [user?.id, loading]);

  return null;
}

function ProfileGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (loading) return;
    if (!user) return;

    const allowed = new Set([
      '/complete-profile',
      '/sign-in',
      '/sign-up',
      '/forgot-password',
      '/about',
    ]);
    if (allowed.has(location)) return;

    if (!isProfileComplete(user)) {
      setLocation('/complete-profile');
    }
  }, [user, loading, location, setLocation]);

  return <>{children}</>;
}

function CompleteProfile() {
  const auth = useAuth() as any;
  const { user, loading } = auth;
  // supabase client from auth-context (export it there) — avoids wrong path imports
  const supabaseClient = auth.supabase;
  const [, setLocation] = useLocation();

  const existingName = String(
    user?.user_metadata?.full_name || user?.user_metadata?.name || '',
  ).trim();
  const existingAge =
    user?.user_metadata?.age != null ? String(user.user_metadata.age) : '';

  const [name, setName] = useState(existingName);
  const [age, setAge] = useState(existingAge);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setLocation('/sign-in');
      return;
    }
    if (isProfileComplete(user)) {
      setLocation('/');
    }
  }, [user, loading, setLocation]);

  useEffect(() => {
    if (existingName) setName(existingName);
    if (existingAge) setAge(existingAge);
  }, [existingName, existingAge]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanName = name.trim();
    const ageNum = Number(age);

    if (cleanName.length < 2) {
      setError('Please enter your full name (at least 2 characters).');
      return;
    }
    if (!Number.isFinite(ageNum) || ageNum < 5 || ageNum > 120) {
      setError('Please enter a valid age between 5 and 120.');
      return;
    }

    setSaving(true);
    try {
      if (!supabaseClient?.auth?.updateUser) {
        throw new Error(
          'Supabase client missing. In auth-context.tsx export supabase from useAuth(), e.g. return { user, loading, signOut, supabase }',
        );
      }
      const { error: updateError } = await supabaseClient.auth.updateUser({
        data: {
          full_name: cleanName,
          name: cleanName,
          age: ageNum,
          profile_completed: true,
        },
      });
      if (updateError) throw updateError;

      // Refresh session so user_metadata is up to date
      await supabaseClient.auth.getUser();
      setLocation('/');
    } catch (err: any) {
      setError(err?.message || 'Could not save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Loading…
        </span>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-8 pt-10 pb-16">
      <div>
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          Almost there
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          Complete your profile
        </h1>
        <p className="mt-3 text-[15px] leading-6 text-muted-foreground">
          Tell us your name and age so we can personalize your theater.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-5">
        <div>
          <label
            htmlFor="profile-name"
            className="mb-2 block text-[13px] font-semibold text-foreground"
          >
            Full name
          </label>
          <input
            id="profile-name"
            type="text"
            autoComplete="name"
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Ali Khan"
            className="h-12 w-full rounded-xl border border-white/15 bg-card px-4 text-[15px] font-medium text-foreground outline-none transition focus:border-primary"
          />
        </div>

        <div>
          <label
            htmlFor="profile-age"
            className="mb-2 block text-[13px] font-semibold text-foreground"
          >
            Age
          </label>
          <input
            id="profile-age"
            type="number"
            inputMode="numeric"
            min={5}
            max={120}
            value={age}
            onChange={e => setAge(e.target.value)}
            placeholder="e.g. 22"
            className="h-12 w-full rounded-xl border border-white/15 bg-card px-4 text-[15px] font-medium text-foreground outline-none transition focus:border-primary"
          />
        </div>

        {error && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold uppercase tracking-[0.12em] text-primary-foreground transition hover:brightness-110 disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Continue'}
          {!saving && <ArrowRight className="h-4 w-4" />}
        </button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Signed in as{' '}
        <span className="font-medium text-foreground">{user?.email}</span>
      </p>
    </div>
  );
}

/* =========================================================
   ROUTER + APP
   ========================================================= */

function Router() {
  return (
    <ProfileGate>
    <AuthSessionBinder />
    <Shell>
      <ErrorBoundary>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/movies" component={() => <Browse type="movie" />} />
          <Route path="/tv-shows" component={() => <Browse type="tv" />} />
          <Route path="/anime" component={AnimePage} />
          <Route path="/my-list-cloud" component={MyListPage} />
          <Route path="/profile-cloud" component={ProfilePage} />
          <Route path="/genres" component={Genres} />
          <Route path="/search" component={SearchPage} />
          <Route path="/complete-profile" component={CompleteProfile} />
          <Route path="/movie/:id" component={() => <Detail type="movie" />} />
          <Route path="/tv/:id" component={() => <Detail type="tv" />} />
          <Route
            path="/watch/movie/:id"
            component={() => (
              <RequireAuth>
                <Watch type="movie" />
              </RequireAuth>
            )}
          />
          <Route
            path="/watch/tv/:id/:season/:episode"
            component={() => (
              <RequireAuth>
                <Watch type="tv" />
              </RequireAuth>
            )}
          />
          <Route path="/my-list" component={LocalCollection} />
          <Route path="/history" component={HistoryPage} />
          <Route path="/profile" component={Profile} />
          <Route path="/sign-in" component={SignInPage} />
          <Route path="/sign-up" component={SignUpPage} />
          <Route path="/settings" component={Preferences} />
          <Route path="/about" component={About} />
          <Route path="/admin" component={() => <Admin />} />
          <Route
            path="/admin/dashboard"
            component={() => <Admin section="dashboard" />}
          />
          <Route
            path="/admin/users"
            component={() => <Admin section="users" />}
          />
          <Route
            path="/admin/content"
            component={() => <Admin section="content" />}
          />
          <Route
            path="/admin/settings"
            component={() => <Admin section="settings" />}
          />
          <Route component={NotFound} />
        </Switch>
      </ErrorBoundary>
    </Shell>
    </ProfileGate>
  );
}

function App() {
  useEffect(() => {
    document.title = 'Cine Stream';
    let link = document.querySelector(
      "link[rel='icon']",
    ) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.type = 'image/svg+xml';
    link.href = BRAND_LOGO_SRC;
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;