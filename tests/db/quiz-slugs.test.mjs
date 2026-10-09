// QUIZ SLUGS (supabase/migrations/0004_quiz_slugs.sql), against the local
// stack (npm run db:start / db:reset):
//   * public.wtf_slugify makes exactly the slugs src/quizSlug.js makes;
//   * the backfill gives existing quizzes exactly the slugs the app already
//     derives for them (so links handed out before the migration still work);
//   * the trigger names a quiz on first publish, uniquely, leaves drafts
//     alone, and never lets a published quiz's slug change;
//   * slugs are unique and well formed.
// Every row this file adds is removed again; the backfill check runs inside
// a rolled-back transaction.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { sql } from "./helpers.mjs";
import { resolveQuizSlugs, slugifyTitle } from "../../src/quizSlug.js";

const PREFIX = "g-slugtest-";
// A multi-statement script through psql's stdin (quiet: only query results
// print, one value per line), for the rolled-back backfill check.
const script = (text) => execFileSync("docker",
  ["exec", "-i", "supabase_db_wtf-trivia", "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"],
  { input: text, encoding: "utf8" }).trim();
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const insert = (id, { title, status = "published", date = "", slug = null }) =>
  sql(`insert into public.games (id, date, theme_title, category_a, category_b, status, questions, slug)
       values (${q(PREFIX + id)}, ${q(date)}, ${q(title)}, 'A', 'B', ${q(status)}, '[]'::jsonb, ${slug === null ? "null" : q(slug)})`);
const slugOf = (id) => sql(`select coalesce(slug, '<null>') from public.games where id = ${q(PREFIX + id)}`);
const fails = (statement, pattern) => assert.throws(() => sql(statement), pattern);

after(() => sql(`delete from public.games where id like '${PREFIX}%'`));

test("Q1 the database's slug rules are the app's, character for character", () => {
  const titles = [
    "Taylor Swift Song OR Skyrim City?", "Board Game or Nicolas Cage Movie?", "  --Hello!!!   World--  ",
    "Swift's Era or Swift’s Song", "Cats & Dogs", "Pokémon OR Tolkien Élf?", "CRÈME BRÛLÉE", "Łódź Żubr Ñandú",
    "🎲 Board Game 🎬 Movie", "a---b___c...d", "???", "", `${"word ".repeat(40)}end`, "Muppet / Rapper: Who?! (Vol. 2)",
  ];
  for (const title of titles) {
    assert.equal(sql(`select coalesce(public.wtf_slugify(${q(title)}), '<null>')`), slugifyTitle(title), JSON.stringify(title));
  }
});

test("Q2 every seeded published quiz already has the slug the app derives from its title", () => {
  const rows = sql(`select id || '|' || date || '|' || status || '|' || theme_title || '|' || coalesce(slug, '') from public.games where id like 'g-seed-%' order by id`)
    .split("\n").filter(Boolean).map((line) => { const [id, date, status, themeTitle, slug] = line.split("|"); return { id, date, status, themeTitle, slug }; });
  assert.ok(rows.length >= 3, "seed puzzles exist");
  const derived = resolveQuizSlugs(rows.map((r) => ({ ...r, slug: "" })));
  for (const r of rows.filter((x) => x.status === "published")) assert.equal(r.slug, derived.get(r.id), r.id);
  assert.equal(rows.find((r) => r.status === "draft")?.slug ?? "", "", "the seeded draft has none yet");
});

test("Q3 the backfill names legacy quizzes exactly as the app does: published first, then by date and id", () => {
  // Inside one rolled-back transaction: rows without slugs (trigger off, as
  // on a database that predates the migration), then the backfill.
  const legacy = [
    { id: "b", date: "2026-01-03", status: "published", themeTitle: "Same Title?" },
    { id: "a", date: "2026-01-02", status: "published", themeTitle: "Same Title" },
    { id: "c", date: "2026-01-01", status: "published", themeTitle: "Same  Title!" },
    // Retired after every published one; on one date, by id.
    { id: "r2", date: "2025-12-01", status: "retired", themeTitle: "Same Title" },
    { id: "r1", date: "2025-12-01", status: "retired", themeTitle: "Same Title" },
    { id: "e", date: "2026-01-04", status: "published", themeTitle: "Crème Brûlée & Co." },
  ];
  const out = script(`begin;
    alter table public.games disable trigger games_quiz_slug;
    ${legacy.map((g) => `insert into public.games (id, date, theme_title, category_a, category_b, status, questions) values (${q(PREFIX + g.id)}, ${q(g.date)}, ${q(g.themeTitle)}, 'A', 'B', ${q(g.status)}, '[]'::jsonb);`).join("\n")}
    alter table public.games enable trigger games_quiz_slug;
    select public.wtf_backfill_quiz_slugs();
    select string_agg(substr(id, ${PREFIX.length + 1}) || '=' || slug, ',' order by id) from public.games where id like '${PREFIX}%';
    rollback;`);
  const got = Object.fromEntries(out.split("\n").at(-1).split(",").map((kv) => kv.split("=")));
  const existing = sql(`select string_agg(slug, ',') from public.games where slug is not null and id not like '${PREFIX}%'`).split(",").filter(Boolean);
  // The app's view: the existing stored slugs, plus these rows unslugged.
  const expected = resolveQuizSlugs([
    ...existing.map((slug, i) => ({ id: `existing-${i}`, slug })),
    ...legacy.map((g) => ({ ...g, id: PREFIX + g.id })),
  ]);
  for (const g of legacy) assert.equal(got[g.id], expected.get(PREFIX + g.id), g.id);
  assert.equal(got.c, "same-title");
  assert.equal(got.a, "same-title-2");
  assert.equal(got.b, "same-title-3");
  assert.equal(got.r1, "same-title-4");
  assert.equal(got.r2, "same-title-5");
  assert.equal(got.e, "creme-brulee-and-co");
  assert.equal(sql(`select count(*) from public.games where id like '${PREFIX}%'`), "0", "rolled back");
});

test("Q4 publishing names a quiz from its title, uniquely; drafts wait", () => {
  insert("p1", { title: "Slug Test: Taylor Swift Song OR Skyrim City?", date: "2001-01-01" });
  assert.equal(slugOf("p1"), "slug-test-taylor-swift-song-or-skyrim-city");
  insert("p2", { title: "Slug test — Taylor Swift song or Skyrim city", date: "2001-01-02" });
  assert.equal(slugOf("p2"), "slug-test-taylor-swift-song-or-skyrim-city-2");
  insert("d1", { title: "Slug Test Draft", status: "draft" });
  assert.equal(slugOf("d1"), "<null>");
  sql(`update public.games set status = 'published', date = '2001-01-03' where id = '${PREFIX}d1'`);
  assert.equal(slugOf("d1"), "slug-test-draft");
});

test("Q5 a published quiz keeps its slug: a save without one keeps it, a new title keeps it, a change is refused", () => {
  insert("lock", { title: "Slug Test Locked", date: "2001-02-01" });
  sql(`update public.games set slug = null, theme_title = 'Slug Test Renamed' where id = '${PREFIX}lock'`);
  assert.equal(slugOf("lock"), "slug-test-locked");
  fails(`update public.games set slug = 'something-else' where id = '${PREFIX}lock'`, /games_slug_locked/);
  sql(`update public.games set status = 'retired' where id = '${PREFIX}lock'`);
  fails(`update public.games set slug = 'something-else' where id = '${PREFIX}lock'`, /games_slug_locked/);
  assert.equal(slugOf("lock"), "slug-test-locked");
});

test("Q6 a draft's chosen slug is kept (and can still change), then fixed once published", () => {
  insert("custom", { title: "Slug Test Whatever", status: "draft", slug: "slug-test-chosen" });
  assert.equal(slugOf("custom"), "slug-test-chosen");
  sql(`update public.games set slug = 'slug-test-chosen-again' where id = '${PREFIX}custom'`);
  sql(`update public.games set status = 'published', date = '2001-03-01' where id = '${PREFIX}custom'`);
  assert.equal(slugOf("custom"), "slug-test-chosen-again");
  fails(`update public.games set slug = 'slug-test-third' where id = '${PREFIX}custom'`, /games_slug_locked/);
});

test("Q7 slugs are unique and well formed", () => {
  insert("u1", { title: "x", status: "draft", slug: "slug-test-unique" });
  fails(`insert into public.games (id, date, theme_title, category_a, category_b, status, questions, slug) values ('${PREFIX}u2', '', 'x', 'A', 'B', 'draft', '[]', 'slug-test-unique')`, /games_slug_key/);
  for (const bad of ["Upper-Case", "two--hyphens", "-leading", "trailing-", "has space", "x".repeat(101)]) {
    fails(`update public.games set slug = ${q(bad)} where id = '${PREFIX}u1'`, /games_slug_format/);
  }
});

test("Q8 the backfill can't be run by the public roles", () => {
  for (const role of ["anon", "authenticated"]) {
    assert.equal(sql(`select has_function_privilege('${role}', 'public.wtf_backfill_quiz_slugs()', 'execute')`), "f", role);
  }
});
