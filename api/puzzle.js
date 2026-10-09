// /quiz/<slug> and the older /puzzle/<id> (vercel.json rewrites them here
// as /api/puzzle?slug=<slug> and /api/puzzle?id=<id>): the app's own page,
// with that quiz's link preview written into the HTML. Both name the quiz's
// public address (/quiz/<slug>, src/quizSlug.js) as its canonical URL.
//
// Messaging apps and social sites read a link's title, description and
// picture from the first HTML response and never run the app, so the tags
// have to be there before any JavaScript. Players get the same page; the app
// then opens the puzzle itself (App.jsx), with all the usual rules: today's
// puzzle plays and scores as normal, older ones replay, and nothing plays
// before its day.
//
// The page is the deployment's own index.html, fetched once per instance.
// The puzzle is read with the public (anon) key, exactly as the app reads it,
// and only the columns a preview shows: never the questions. Drafts, retired
// puzzles, puzzles not out yet, unknown ids and any read failure get the
// site's ordinary preview, which names no puzzle.

import { isPuzzleId, puzzleIdFromPath } from "../src/puzzleLink.js";
import { isQuizSlug, quizSlugFromPath, resolveQuizSlugs } from "../src/quizSlug.js";
import { previewReleased, puzzleMeta, withPuzzleMeta } from "../src/puzzleMeta.js";

const TIMEOUT_MS = 4000;
// Preview columns. The share names and wide artwork were added by later
// migrations, so a database without them is read again with the basics.
const COLUMNS = [
  "id,date,status,theme_title,category_a,category_b,category_a_share_name,category_b_share_name,header_image,wide_image",
  "id,date,status,theme_title,category_a,category_b,header_image",
];

function supabaseConfig(env) {
  const url = String(env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY || "").trim();
  return url && key ? { url, key } : null;
}

const rowToPreviewGame = (row) => ({
  id: row.id,
  date: row.date,
  status: row.status,
  themeTitle: row.theme_title || "",
  categoryA: row.category_a || "",
  categoryB: row.category_b || "",
  categoryAShareName: row.category_a_share_name || "",
  categoryBShareName: row.category_b_share_name || "",
  headerImage: row.header_image || null,
  wideImage: row.wide_image || null,
  // Only the number of questions (when asked for), never the questions.
  questionCount: Array.isArray(row.questions) ? row.questions.length : null,
});

// The puzzle's preview fields, or null when there is no such puzzle.
// Throws when it can't tell (not configured, network, database error).
// withQuestionCount also reads the questions column, only to count them.
export async function loadPreviewGame(id, { fetchImpl = fetch, env = process.env, withQuestionCount = false } = {}) {
  const config = supabaseConfig(env);
  if (!config) throw new Error("Supabase is not configured.");
  for (const [i, columns] of COLUMNS.entries()) {
    const res = await fetchImpl(
      `${config.url}/rest/v1/games?id=eq.${encodeURIComponent(id)}&select=${columns}${withQuestionCount ? ",questions" : ""}&limit=1`,
      { headers: { apikey: config.key, Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    // 400: a column this database doesn't have yet; try the basics.
    if (res.status === 400 && i < COLUMNS.length - 1) continue;
    if (!res.ok) throw new Error(`Supabase error ${res.status}`);
    const rows = await res.json();
    return Array.isArray(rows) && rows[0] ? rowToPreviewGame(rows[0]) : null;
  }
  return null;
}

// Every quiz's public link name: Map(id -> slug), resolved as the app does
// (stored slugs, else derived from titles in the same order), so a link the
// app hands out is the one served here. Only ids, dates, statuses, titles
// and slugs are read. Throws when it can't tell.
const SLUG_COLUMNS = ["id,date,status,theme_title,slug", "id,date,status,theme_title"];
export async function loadQuizSlugs({ fetchImpl = fetch, env = process.env } = {}) {
  const config = supabaseConfig(env);
  if (!config) throw new Error("Supabase is not configured.");
  for (const [i, columns] of SLUG_COLUMNS.entries()) {
    const res = await fetchImpl(`${config.url}/rest/v1/games?select=${columns}`,
      { headers: { apikey: config.key, Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    // 400: a database without the slug column yet (0004_quiz_slugs.sql).
    if (res.status === 400 && i < SLUG_COLUMNS.length - 1) continue;
    if (!res.ok) throw new Error(`Supabase error ${res.status}`);
    const rows = await res.json();
    return resolveQuizSlugs((Array.isArray(rows) ? rows : []).map((r) => ({
      id: r.id, date: r.date, status: r.status, themeTitle: r.theme_title || "", slug: r.slug || "",
    })));
  }
  return new Map();
}

// This deployment's index.html, fetched from itself once per instance (it
// never changes within a deployment). Preview deployments sit behind Vercel
// sign-in, so the visitor's own cookie, or the automation bypass secret when
// the project has one, goes along.
let shellCache = null;
export async function loadShell(req, { fetchImpl = fetch, env = process.env } = {}) {
  if (shellCache) return shellCache;
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  if (!/^[a-z0-9.-]+(:\d+)?$/i.test(host)) throw new Error("Unexpected host.");
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host);
  const headers = { Accept: "text/html" };
  if (req.headers.cookie) headers.cookie = req.headers.cookie;
  if (env.VERCEL_AUTOMATION_BYPASS_SECRET) headers["x-vercel-protection-bypass"] = env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const res = await fetchImpl(`${local ? "http" : "https"}://${host}/index.html`, {
    headers, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`index.html: ${res.status}`);
  const html = await res.text();
  if (!/<\/head>/i.test(html) || !/id="root"/.test(html)) throw new Error("index.html isn't the app.");
  shellCache = html;
  return html;
}

// Test hook.
export function clearShellCache() {
  shellCache = null;
}

// {slug} for a quiz link, else {id} for a puzzle link ("" when unusable).
function requestedLink(req) {
  const url = new URL(req.url || "/", "http://localhost");
  const slug = req.query?.slug ?? url.searchParams.get("slug");
  if (typeof slug === "string") return { slug: slug.toLowerCase() };
  const fromPath = quizSlugFromPath(url.pathname);
  if (fromPath !== null) return { slug: fromPath };
  const fromQuery = req.query?.id ?? url.searchParams.get("id");
  if (typeof fromQuery === "string") return { id: fromQuery };
  return { id: puzzleIdFromPath(url.pathname) || "" };
}

export default async function handler(req, res, deps = {}) {
  const wanted = requestedLink(req);
  const bySlug = "slug" in wanted;
  let shell;
  try {
    shell = await loadShell(req, deps);
  } catch (error) {
    // Without the page, hand over to the app, which opens /?puzzle=<id> as
    // this same link (and puts /puzzle/<id> back in the address bar).
    console.error("[puzzle] page unavailable", error);
    res.statusCode = 302;
    res.setHeader("Location", bySlug
      ? (isQuizSlug(wanted.slug) ? `/?quiz=${encodeURIComponent(wanted.slug)}` : "/")
      : (isPuzzleId(wanted.id) ? `/?puzzle=${encodeURIComponent(wanted.id)}` : "/"));
    res.setHeader("Cache-Control", "no-store");
    res.end();
    return;
  }
  let game = null;
  let lookupFailed = false;
  try {
    // A quiz link: which quiz answers to that name, then its preview.
    let slugs = null;
    let id = wanted.id;
    if (bySlug) {
      id = "";
      if (isQuizSlug(wanted.slug)) {
        slugs = await loadQuizSlugs(deps);
        id = [...slugs].find(([, slug]) => slug === wanted.slug)?.[0] ?? "";
      }
    }
    if (isPuzzleId(id)) game = await loadPreviewGame(id, deps);
    // Its public address, for the canonical URL. A puzzle link's preview
    // works without it (its own address stands in).
    if (game && previewReleased(game)) {
      try { slugs ??= await loadQuizSlugs(deps); game.slug = slugs.get(game.id) || ""; }
      catch (error) { console.error("[puzzle] quiz slugs unavailable", error); }
    }
  } catch (error) {
    game = null;
    lookupFailed = true;
    console.error("[puzzle] lookup failed", error);
  }
  const released = Boolean(game) && previewReleased(game);
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // Shared caches keep a released puzzle's page for five minutes (an edit
  // shows within that); anything else is rechecked within a minute, so a
  // puzzle's preview appears soon after it opens.
  res.setHeader("Cache-Control", released
    ? "public, max-age=0, s-maxage=300, stale-while-revalidate=86400"
    : `public, max-age=0, s-maxage=${lookupFailed ? 15 : 60}`);
  res.setHeader("X-Puzzle-Preview", released ? "puzzle" : "site");
  res.end(released ? withPuzzleMeta(shell, puzzleMeta(game)) : shell);
}
