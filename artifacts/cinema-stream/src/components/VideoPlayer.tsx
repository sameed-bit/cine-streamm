import { useEffect, useMemo, useState } from "react";
import { LoaderCircle, Play, TriangleAlert } from "lucide-react";

type PlayerType = "movie" | "tv";

type ProgressPayload = {
  event: string;
  currentTime: number;
  duration: number;
  percent: number;
};

export function VideoPlayer({
  type,
  id,
  season,
  episode,
  onProgress,
}: {
  type: PlayerType;
  id: number;
  season?: number;
  episode?: number;
  onProgress?: (progress: ProgressPayload) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const src = useMemo(() => {
    if (type === "movie") {
      return `https://www.vidking.net/embed/movie/${id}?autoPlay=true`;
    }
    return `https://www.vidking.net/embed/tv/${id}/${season ?? 1}/${episode ?? 1}?autoPlay=true&nextEpisode=true&episodeSelector=true`;
  }, [episode, id, season, type]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!event.origin.includes("vidking.net")) return;
      const data =
        typeof event.data === "string"
          ? (() => {
              try {
                return JSON.parse(event.data) as Record<string, unknown>;
              } catch {
                return {};
              }
            })()
          : (event.data as Record<string, unknown> | null);
      if (!data || typeof data !== "object") return;
      const currentTime = Number(data.currentTime ?? data.position ?? 0);
      const duration = Number(data.duration ?? 0);
      const percent =
        duration > 0 ? Math.min(100, Math.round((currentTime / duration) * 100)) : 0;
      const eventName = typeof data.event === "string" ? data.event : "timeupdate";
      if (["play", "pause", "timeupdate", "seeked", "ended"].includes(eventName)) {
        onProgress?.({ event: eventName, currentTime, duration, percent });
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onProgress]);

  return (
    <div className="relative aspect-video overflow-hidden border border-white/10 bg-[#08090d] shadow-2xl">
      {!loaded && !failed && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[radial-gradient(ellipse_at_65%_40%,hsl(353_71%_28%/.4),transparent_50%),linear-gradient(120deg,#08090d,#15131b)] text-center">
          <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
          <p className="mt-4 font-mono text-[10px] uppercase tracking-[.22em] text-muted-foreground">
            Opening your screening room
          </p>
        </div>
      )}
      {failed ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-card px-6 text-center">
          <TriangleAlert className="h-7 w-7 text-[hsl(var(--accent))]" />
          <p className="mt-4 font-display text-2xl">The player is unavailable.</p>
          <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
            Try again in a moment or return to the title page.
          </p>
        </div>
      ) : (
        <iframe
          key={src}
          src={src}
          title={type === "movie" ? "Movie player" : "TV episode player"}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          referrerPolicy="origin"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className="h-full w-full border-0"
        />
      )}
      {!loaded && !failed && (
        <div className="pointer-events-none absolute bottom-4 left-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-white/60">
          <Play className="h-3 w-3 fill-current text-primary" /> Authorized embed
        </div>
      )}
    </div>
  );
}