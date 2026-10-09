// Public quiz addresses: every quiz's permanent, readable link,
// /quiz/<slug> ("Play this quiz"), beside the older /puzzle/<id> links
// (puzzleLink.js), which keep working. games.id stays the quiz's identity;
// the slug is only its public name. Shared by the app, Puzzle Studio and the
// link-preview function (api/puzzle.js), so all of them agree. Pure.
//
// Where a slug comes from (supabase/migrations/0004_quiz_slugs.sql):
// - Stored: games.slug. Set by the database when a quiz is first published
//   (from its title, made unique), or chosen in Puzzle Studio while it is a
//   draft. Once a published quiz has one it never changes, so its link stays
//   valid whatever happens to the title.
// - Derived: a quiz without a stored slug (a database that hasn't run the
//   migration yet, or a draft) gets one from its title here, by exactly the
//   rules the migration's backfill uses, in the same order -- so the links
//   handed out before the migration are the ones it stores.
import { SITE_ORIGIN } from "./puzzleLink.js";

// The longest slug made from a title (a "-2" suffix may follow), and the
// longest one accepted anywhere.
export const SLUG_MAX = 80;
const SLUG_LIMIT = 100;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Accented letters keep their letter ("Pokémon" -> "pokemon"). Character for
// character the same table as public.wtf_slugify's translate() in the
// migration, so both sides make the same slug; anything else that isn't a
// letter or digit becomes a hyphen on both.
const ACCENTED = "àáâãäåāăąçćčďèéêëēėęěìíîïīįłñńňòóôõöøōőřśšşťùúûüūůűųýÿžźż";
const PLAIN = "aaaaaaaaacccdeeeeeeeeiiiiiilnnnoooooooorssstuuuuuuuuyyzzz";
const UNACCENT = new Map([...ACCENTED].map((c, i) => [c, PLAIN[i]]));

export function isQuizSlug(slug) {
  return typeof slug === "string" && slug.length <= SLUG_LIMIT && SLUG.test(slug);
}

// "Taylor Swift Song OR Skyrim City?" -> "taylor-swift-song-or-skyrim-city".
// Lowercase; apostrophes dropped ("Swift's" -> "swifts"); & reads "and";
// every other run of punctuation or spaces is one hyphen; no hyphen at either
// end; at most SLUG_MAX characters. "" when nothing usable is left.
export function slugifyTitle(title) {
  const lowered = [...String(title ?? "").toLowerCase()].map((c) => UNACCENT.get(c) ?? c).join("");
  const slug = lowered
    .replace(/['’]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.slice(0, SLUG_MAX).replace(/-+$/, "");
}

// A quiz's slug before it is made unique: from its title, else "quiz".
export const baseSlug = (game) => slugifyTitle(game?.themeTitle) || "quiz";

// `base`, or base-2, base-3, ... -- the first one not in `taken`.
export function uniqueSlug(base, taken) {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

// Code-unit order, like the migration's `collate "C"`.
const byCode = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// Every quiz's slug: Map(id -> slug). Stored slugs stand as they are. The
// rest are derived from their titles, published quizzes first, then by date
// and id, each avoiding every slug already given out -- the backfill's order.
export function resolveQuizSlugs(games) {
  const slugs = new Map();
  const taken = new Set();
  const derive = [];
  for (const g of games || []) {
    if (!g?.id) continue;
    if (isQuizSlug(g.slug) && !taken.has(g.slug)) { slugs.set(g.id, g.slug); taken.add(g.slug); }
    else derive.push(g);
  }
  derive.sort((a, b) =>
    (b.status === "published") - (a.status === "published")
    || byCode(String(a.date ?? ""), String(b.date ?? ""))
    || byCode(String(a.id), String(b.id)));
  for (const g of derive) {
    const slug = uniqueSlug(baseSlug(g), taken);
    slugs.set(g.id, slug);
    taken.add(slug);
  }
  return slugs;
}

// The slug a quiz without one will get: on a database with slugs, its title
// made unique against every other quiz's link (as the database will do when
// it is published); before that, the one derived for it now.
export function plannedQuizSlug(game, games) {
  const others = (games || []).filter((g) => g.id !== game.id);
  if (!game.slugColumn) return resolveQuizSlugs([...others, game]).get(game.id);
  return uniqueSlug(baseSlug(game), new Set(resolveQuizSlugs(others).values()));
}

// "/quiz/taylor-swift-song-or-skyrim-city"
export const quizPath = (slug) => `/quiz/${encodeURIComponent(slug)}`;

// "https://whatthefudge.gg/quiz/taylor-swift-song-or-skyrim-city"
export const quizUrl = (slug, origin = SITE_ORIGIN) => `${origin}${quizPath(slug)}`;

// The slug in a /quiz/<slug> path (one trailing slash allowed; letters in
// any case), or null when the path isn't a quiz link. A quiz link whose slug
// can't be one gives "", so the app can say it isn't available.
export function quizSlugFromPath(pathname) {
  const m = /^\/quiz\/([^/]*)\/?$/.exec(String(pathname || ""));
  if (!m) return null;
  let slug;
  try { slug = decodeURIComponent(m[1]).toLowerCase(); } catch { return ""; }
  return isQuizSlug(slug) ? slug : "";
}
