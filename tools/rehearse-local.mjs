#!/usr/bin/env node
/**
 * Rehearse the hosted Phase 2 install on the LOCAL stack against a copy of the
 * hosted structure and content, and prove the content did not move.
 *
 *   node tools/rehearse-local.mjs --export <dir>   dir holds games.jsonl from `tools/hosted.mjs export`
 *   node tools/rehearse-local.mjs                  without an export: the seed's sample puzzles stand in
 *
 * Steps (all inside the local database container supabase_db_wtf-trivia; the
 * hosted project is never touched):
 *   1. empty the local public schema and the migration ledger; remove every auth user
 *   2. re-create the hosted project's default privileges (anon/authenticated get
 *      everything on new objects, exactly the setting the install must defeat)
 *   3. apply supabase/ops/hosted/live-replica.sql (the live schema, section A of 0001)
 *   4. load the exported games rows byte-for-byte (jsonb → table)
 *   5. take the content fingerprint (same formula as tools/hosted.mjs counts)
 *   6. apply supabase/ops/hosted/phase2-install.sql in ONE transaction
 *   7. take the fingerprint again: it must be identical; ids and counts too
 *   8. apply 0003 (the admin gate) the same way, fingerprint again
 *   9. report; the stack is left in this rehearsed state for `npm run test:db`
 *      (run `npm run db:reset` afterwards to return to the seeded state)
 */
import { execFileSync, execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTAINER = "supabase_db_wtf-trivia";
const args = process.argv.slice(2);
const exportDir = (() => { const i = args.indexOf("--export"); return i >= 0 ? args[i + 1] : null; })();

function guardLocal() {
  const out = execSync("npx supabase status -o json", { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const json = JSON.parse(out.slice(out.indexOf("{")));
  const host = new URL(json.API_URL).hostname;
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) throw new Error(`REFUSING: ${json.API_URL} is not a local stack`);
}
const psql = (sql, input) => execFileSync("docker", ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At", ...(input === undefined ? ["-c", sql] : ["-c", sql])], { encoding: "utf8", input }).trim();
const psqlFile = (text) => execFileSync("docker", ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q"], { encoding: "utf8", input: text });

const FINGERPRINT = `select count(*)::text || '|' || coalesce(sum(jsonb_array_length(questions)),0)::text || '|' || coalesce(md5(string_agg(md5(g::text), '|' order by g.id)), 'empty') || '|' || coalesce(md5(string_agg(g.id, '|' order by g.id)), 'empty') from public.games g`;

guardLocal();
console.log("1. blank slate (local only)");
psqlFile(`
  drop schema if exists public cascade;
  create schema public;
  grant usage on schema public to postgres, anon, authenticated, service_role;
  grant all on schema public to postgres, service_role;
  drop schema if exists supabase_migrations cascade;
  delete from auth.users;
  drop schema if exists puzzle_id_cutover_backup cascade;
  create schema puzzle_id_cutover_backup;
`);
console.log("2. hosted default privileges");
psqlFile(`
  alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;
`);
console.log("3. live schema (section A)");
psqlFile(readFileSync(path.join(ROOT, "supabase/ops/hosted/live-replica.sql"), "utf8"));
// the hosted project has no ledger at all
psqlFile(`drop schema if exists supabase_migrations cascade;`);

console.log("4. content");
if (exportDir) {
  const file = path.join(exportDir, "games.jsonl");
  if (!existsSync(file)) throw new Error(`${file} not found`);
  const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
  // one jsonb literal per row, loaded through a temp table so the row shape is populated by Postgres itself
  const values = lines.map((l) => `(${psqlLiteral(l)}::jsonb)`).join(",\n");
  psqlFile(`
    create temp table incoming (doc jsonb);
    insert into incoming (doc) values ${values};
    insert into public.games
      select (jsonb_populate_record(null::public.games, doc)).* from incoming;
  `);
  console.log(`   loaded ${lines.length} exported games rows`);
} else {
  psqlFile(readFileSync(path.join(ROOT, "supabase/seed.sql"), "utf8"));
  console.log("   loaded the seed's sample puzzles (no export given)");
}

console.log("5. fingerprint before");
const before = psql(FINGERPRINT);
console.log("   " + before);

console.log("6. phase2-install.sql in one transaction");
const install = readFileSync(path.join(ROOT, "supabase/ops/hosted/phase2-install.sql"), "utf8");
psqlFile(`begin;\n${install}\ncommit;`);

console.log("7. fingerprint after install");
const after = psql(FINGERPRINT);
console.log("   " + after);
if (after !== before) throw new Error("CONTENT MOVED during the install rehearsal; STOP");
console.log("   identical: count, questions, every row, every id");

console.log("8. 0003 admin gate in one transaction");
const gate = readFileSync(path.join(ROOT, "supabase/migrations/0003_wtf_admin_gate.sql"), "utf8").replace(/\r\n/g, "\n");
psqlFile(`begin;\n${gate}\ninsert into supabase_migrations.schema_migrations (version, name) values ('0003', 'wtf_admin_gate') on conflict do nothing;\ncommit;`);
const after3 = psql(FINGERPRINT);
if (after3 !== before) throw new Error("CONTENT MOVED during the admin-gate rehearsal; STOP");
console.log("   identical again");

console.log("9. ledger: " + psql("select string_agg(version, ',' order by version) from supabase_migrations.schema_migrations"));
console.log("   policies on games: " + psql("select string_agg(policyname, ', ' order by policyname) from pg_policies where tablename='games'"));
console.log("   permissive leftovers on player tables: " + psql("select count(*) from pg_policies where schemaname='public' and tablename in ('players','game_records','player_stats') and 'public' = any(roles)"));
console.log("REHEARSAL OK. The local stack now holds the rehearsed hosted state; run `npm run test:db` against it, then `npm run db:reset`.");

function psqlLiteral(s) {
  return "'" + s.replace(/'/g, "''") + "'";
}
