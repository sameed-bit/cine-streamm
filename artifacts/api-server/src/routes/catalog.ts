import { Router, type IRouter, type Request, type Response } from "express";
import {
  GetDiscoverMediaQueryParams,
  GetMovieDetailsParams,
  GetTvDetailsParams,
  SearchCatalogQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();
const TMDB_BASE_URL = "https://api.themoviedb.org/3";

type TmdbRecord = Record<string, unknown>;

function getTmdbKey(): string {
  return process.env.TMDB_API_KEY ?? "";
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function num(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function mediaType(record: TmdbRecord, fallback: "movie" | "tv" = "movie") {
  return record.media_type === "tv" || record.first_air_date !== undefined
    ? "tv"
    : record.media_type === "movie" || record.release_date !== undefined
      ? "movie"
      : fallback;
}

function normalizeMedia(record: TmdbRecord, fallbackType?: "movie" | "tv") {
  const type = mediaType(record, fallbackType);
  return {
    id: num(record.id),
    media_type: type,
    title: text(type === "movie" ? record.title : record.name),
    overview: text(record.overview),
    poster_path: nullableText(record.poster_path),
    backdrop_path: nullableText(record.backdrop_path),
    release_date: nullableText(
      type === "movie" ? record.release_date : record.first_air_date,
    ),
    vote_average: num(record.vote_average),
    vote_count: num(record.vote_count),
    genre_ids: Array.isArray(record.genre_ids)
      ? record.genre_ids.filter((id): id is number => typeof id === "number")
      : Array.isArray(record.genres)
        ? record.genres
            .map((genre) =>
              genre && typeof genre === "object"
                ? (genre as TmdbRecord).id
                : undefined,
            )
            .filter((id): id is number => typeof id === "number")
        : [],
  };
}

function normalizeDetails(record: TmdbRecord, type: "movie" | "tv") {
  const media = normalizeMedia(record, type);
  const seasons = Array.isArray(record.seasons)
    ? record.seasons
        .filter((season): season is TmdbRecord => Boolean(season && typeof season === "object"))
        .map((season) => ({
          season_number: num(season.season_number),
          name: text(season.name),
          episode_count: num(season.episode_count),
          air_date: nullableText(season.air_date),
        }))
    : [];
  const credits =
    record.credits && typeof record.credits === "object"
      ? (record.credits as TmdbRecord)
      : {};
  const cast = Array.isArray(credits.cast)
    ? credits.cast
        .filter((member): member is TmdbRecord => Boolean(member && typeof member === "object"))
        .slice(0, 12)
        .map((member) => ({
          id: num(member.id),
          name: text(member.name),
          character: text(member.character),
          profile_path: nullableText(member.profile_path),
        }))
    : [];
  const genres = Array.isArray(record.genres)
    ? record.genres
        .filter((genre): genre is TmdbRecord => Boolean(genre && typeof genre === "object"))
        .map((genre) => ({ id: num(genre.id), name: text(genre.name) }))
    : [];
  const productionCompanies = Array.isArray(record.production_companies)
    ? record.production_companies
        .filter(
          (company): company is TmdbRecord =>
            Boolean(company && typeof company === "object"),
        )
        .map((company) => text(company.name))
        .filter(Boolean)
    : [];

  return {
    ...media,
    runtime:
      type === "movie"
        ? numberOrNull(record.runtime)
        : numberOrNull(
            Array.isArray(record.episode_run_time)
              ? record.episode_run_time[0]
              : null,
          ),
    genres,
    seasons,
    cast,
    production_companies: productionCompanies,
  };
}

async function tmdbFetch(path: string, params: Record<string, string> = {}) {
  const key = getTmdbKey();
  if (!key) {
    throw new Error("TMDB_API_KEY is not configured");
  }
  const isReadAccessToken = key.split(".").length === 3 || key.length > 80;
  const search = new URLSearchParams({ ...params, language: "en-US" });
  const headers: Record<string, string> = {};
  if (isReadAccessToken) {
    headers.Authorization = `Bearer ${key}`;
  } else {
    search.set("api_key", key);
  }
  const response = await fetch(`${TMDB_BASE_URL}${path}?${search.toString()}`, {
    headers,
  });
  if (!response.ok) {
    throw new Error(`TMDB responded with ${response.status}`);
  }
  return (await response.json()) as TmdbRecord;
}

function sendCatalogError(req: Request, res: Response, error: unknown) {
  req.log.warn({ err: error }, "TMDB catalog request failed");
  res.status(503).json({ error: "The catalog is taking a pause. Please try again shortly." });
}

router.get("/catalog/trending", async (req, res) => {
  try {
    const data = await tmdbFetch("/trending/all/week");
    const items = Array.isArray(data.results)
      ? data.results
          .filter((item): item is TmdbRecord => Boolean(item && typeof item === "object"))
          .map((item) => normalizeMedia(item))
          .filter((item) => item.media_type === "movie" || item.media_type === "tv")
      : [];
    res.json({ items, page: num(data.page) || 1, total_pages: num(data.total_pages) || 1 });
  } catch (error) {
    sendCatalogError(req, res, error);
  }
});

router.get("/catalog/discover", async (req, res) => {
  const parsed = GetDiscoverMediaQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose a valid catalog type and category." });
    return;
  }
  const { type, category, genre } = parsed.data;
  const endpoint =
    category === "now_playing" && type === "movie"
      ? "/movie/now_playing"
      : category === "upcoming" && type === "movie"
        ? "/movie/upcoming"
        : `/${type}/${category}`;
  try {
    const data = await tmdbFetch(endpoint, genre ? { with_genres: String(genre) } : {});
    const items = Array.isArray(data.results)
      ? data.results
          .filter((item): item is TmdbRecord => Boolean(item && typeof item === "object"))
          .map((item) => normalizeMedia(item, type))
      : [];
    res.json({ items, page: num(data.page) || 1, total_pages: num(data.total_pages) || 1 });
  } catch (error) {
    sendCatalogError(req, res, error);
  }
});

router.get("/catalog/search", async (req, res) => {
  const parsed = SearchCatalogQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a search term to explore the catalog." });
    return;
  }
  const { query, filter = "all" } = parsed.data;
  try {
    const data = await tmdbFetch("/search/multi", { query });
    const results = Array.isArray(data.results)
      ? data.results.filter(
          (item): item is TmdbRecord =>
            Boolean(item && typeof item === "object") && item.media_type !== "person",
        )
      : [];
    const filtered =
      filter === "all"
        ? results
        : results.filter((item) => item.media_type === filter);
    const people = Array.isArray(data.results)
      ? data.results
          .filter(
            (item): item is TmdbRecord =>
              Boolean(item && typeof item === "object") && item.media_type === "person",
          )
          .map((person) => ({
            id: num(person.id),
            name: text(person.name),
            profile_path: nullableText(person.profile_path),
            known_for_department: text(person.known_for_department),
          }))
      : [];
    res.json({
      items: filtered.map((item) => normalizeMedia(item)),
      people: filter === "person" ? people : [],
      total_results: num(data.total_results),
    });
  } catch (error) {
    sendCatalogError(req, res, error);
  }
});

router.get("/catalog/genres", async (req, res) => {
  try {
    const [movies, tv] = await Promise.all([
      tmdbFetch("/genre/movie/list"),
      tmdbFetch("/genre/tv/list"),
    ]);
    const normalizeGenres = (data: TmdbRecord) =>
      Array.isArray(data.genres)
        ? data.genres
            .filter((genre): genre is TmdbRecord => Boolean(genre && typeof genre === "object"))
            .map((genre) => ({ id: num(genre.id), name: text(genre.name) }))
        : [];
    res.json({ movies: normalizeGenres(movies), tv: normalizeGenres(tv) });
  } catch (error) {
    sendCatalogError(req, res, error);
  }
});

router.get("/catalog/movie/:id", async (req, res) => {
  const parsed = GetMovieDetailsParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(404).json({ error: "We couldn't find that movie." });
    return;
  }
  try {
    const data = await tmdbFetch(`/movie/${parsed.data.id}`, { append_to_response: "credits" });
    res.json(normalizeDetails(data, "movie"));
  } catch (error) {
    req.log.warn({ err: error }, "Movie details request failed");
    res.status(404).json({ error: "We couldn't find that movie." });
  }
});

router.get("/catalog/tv/:id", async (req, res) => {
  const parsed = GetTvDetailsParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(404).json({ error: "We couldn't find that show." });
    return;
  }
  try {
    const data = await tmdbFetch(`/tv/${parsed.data.id}`, { append_to_response: "credits" });
    res.json(normalizeDetails(data, "tv"));
  } catch (error) {
    req.log.warn({ err: error }, "TV details request failed");
    res.status(404).json({ error: "We couldn't find that show." });
  }
});

export default router;