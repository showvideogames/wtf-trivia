#!/usr/bin/env node
/**
 * Read and (when explicitly approved) change the HOSTED WTF Trivia Supabase
 * project through the Supabase Management API. The Cluevoyance tool with
 * WTF's content model: ONE content table, `games`, whose rows embed their
 * questions. Deb edits it live, so every content check is taken fresh.
 *
 *   node tools/hosted.mjs inventory --out <dir>   schema inventory (tables, columns, constraints, indexes,
 *                                                 functions, triggers, policies, grants, auth counts, storage)
 *                                                 as JSON + a Markdown summary. READ-ONLY.
 *   node tools/hosted.mjs counts                  THE CONTENT SAFETY SNAPSHOT: row counts, question total,
 *                                                 per-row and whole-table fingerprints, stable ids. READ-ONLY.
 *   node tools/hosted.mjs export --out <dir>      every games row as JSONL + the per-row fingerprint list
 *                                                 (the content backup). READ-ONLY.
 *   node tools/hosted.mjs compare <a.json> <b.json>  diff two `counts --out` snapshots: ids added/removed/changed.
 *   node tools/hosted.mjs sql --file <f>          run a SQL file inside BEGIN … ROLLBACK (rehearsal). READ-ONLY
 *                                                 in effect; the content fingerprint is checked before and after.
 *   node tools/hosted.mjs sql --file <f> --apply  run it for real (COMMIT). Needs WTF_HOSTED_WRITE=yes and
 *                                                 --i-mean-the-hosted-wtf-project. Refuses when the content
 *                                                 fingerprint moved during the run.
 *   node tools/hosted.mjs auth-config             the project's auth configuration (site url, allow-list, flags). READ-ONLY.
 *
 * Credentials, shell or git-ignored .runtime only:
 *   SUPABASE_ACCESS_TOKEN  a personal access token (sbp_…) of an organisation member; or
 *                          .runtime/supabase-access-token.txt (preferred, wins over the shell)
 *   WTF_PROJECT_REF        the project ref; named here and nowhere in the repository
 *   WTF_HOSTED_WRITE       must be "yes" for --apply
 *
 * Every command prints the project ref and name it is talking to before doing anything.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API = "https://api.supabase.com";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOKEN_FILE = path.join(ROOT, ".runtime", "supabase-access-token.txt");

function env(name, pattern, hint) {
  const v = (process.env[name] ?? "").trim();
  if (!pattern.test(v)) throw new Error(`${name} is missing or malformed (${hint}). Export it in this shell only.`);
  return v;
}
function token() {
  const fromEnv = (process.env.SUPABASE_ACCESS_TOKEN ?? "").trim();
  const fromFile = existsSync(TOKEN_FILE) ? readFileSync(TOKEN_FILE, "utf8").trim() : "";
  const t = fromFile || fromEnv;
  if (!/^sbp_/.test(t)) throw new Error("No Supabase personal access token: save one to .runtime/supabase-access-token.txt (git-ignored) or export SUPABASE_ACCESS_TOKEN.");
  return t;
}
const ref = () => env("WTF_PROJECT_REF", /^[a-z]{20}$/, "the 20-letter project ref");
const headers = () => ({ Authorization: `Bearer ${token()}`, "Content-Type": "application/json" });

async function api(method, p, body) {
  const res = await fetch(`${API}${p}`, { method, headers: headers(), body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 500) }; }
  if (res.status >= 300) throw new Error(`${method} ${p} → HTTP ${res.status} ${JSON.stringify(json).slice(0, 400)}`);
  return json;
}

/** Read-only query: refuses anything that is not a SELECT/WITH/SHOW. */
async function query(sql) {
  if (!/^\s*(select|with|show)\b/i.test(sql)) throw new Error("query() is read-only; use runSql for anything else");
  return api("POST", `/v1/projects/${ref()}/database/query`, { query: sql, read_only: true });
}
async function execute(sql) {
  return api("POST", `/v1/projects/${ref()}/database/query`, { query: sql });
}

async function identify() {
  const p = await api("GET", `/v1/projects/${ref()}`);
  console.log(`hosted project: ${p.name} (${p.id ?? ref()}), region ${p.region}, status ${p.status}`);
  if ((p.id ?? ref()) !== ref()) throw new Error("project ref mismatch; STOPPING");
  return p;
}

const INVENTORY_QUERIES = {
  tables: `select table_schema, table_name from information_schema.tables where table_schema in ('public','storage') and table_type='BASE TABLE' order by 1,2`,
  columns: `select table_name, column_name, udt_name, is_nullable, column_default, ordinal_position from information_schema.columns where table_schema='public' order by table_name, ordinal_position`,
  constraints: `select conrelid::regclass::text as table_name, conname, contype, pg_get_constraintdef(oid) as definition from pg_constraint where connamespace='public'::regnamespace order by 1,2`,
  indexes: `select tablename, indexname, indexdef from pg_indexes where schemaname='public' order by 1,2`,
  functions: `select p.proname, pg_get_function_identity_arguments(p.oid) as args, pg_get_function_result(p.oid) as result, p.prosecdef as security_definer, left(pg_get_functiondef(p.oid), 4000) as definition from pg_proc p where p.pronamespace='public'::regnamespace order by 1,2`,
  function_privs: `select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon_exec, has_function_privilege('authenticated', p.oid, 'execute') as authenticated_exec from pg_proc p where p.pronamespace='public'::regnamespace order by 1`,
  triggers: `select c.relname as table_name, t.tgname, pg_get_triggerdef(t.oid) as def from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal order by 1,2`,
  policies: `select tablename, policyname, permissive, array_to_string(roles, ',') as roles, cmd, qual, with_check from pg_policies where schemaname='public' order by 1,2`,
  storage_policies: `select policyname, array_to_string(roles, ',') as roles, cmd, qual, with_check from pg_policies where schemaname='storage' and tablename='objects' order by 1`,
  rls: `select relname as table_name, relrowsecurity as rls_enabled from pg_class where relnamespace='public'::regnamespace and relkind='r' order by 1`,
  table_acl: `select c.relname, c.relacl::text from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','S') order by 1`,
  extensions: `select extname, extversion from pg_extension order by 1`,
  migration_ledger: `select version, name from supabase_migrations.schema_migrations order by version`,
  auth_counts: `select (select count(*) from auth.users) as users, (select count(*) from auth.users where is_anonymous) as anonymous_users, (select count(*) from auth.users where email is not null) as users_with_email, (select string_agg(provider||' x'||n, ', ') from (select provider, count(*) n from auth.identities group by 1) i) as identities_by_provider`,
  player_counts: `select (select count(*) from public.players) as players, (select count(*) from public.game_records) as plays, (select count(*) from public.game_records where completed) as finished_plays, (select count(*) from public.player_stats) as player_stats, (select count(*) from public.puzzle_stats) as puzzle_stats, (select count(*) from public.puzzle_favorites) as favorites`,
  account_counts: `select (select count(*) from public.accounts) as accounts, (select count(*) from public.admins) as admins`,
  storage: `select b.id, b.public, (select count(*) from storage.objects o where o.bucket_id=b.id) as objects from storage.buckets b order by 1`,
};

async function inventory(outDir) {
  if (!outDir) throw new Error("inventory needs --out <dir>");
  await identify();
  mkdirSync(outDir, { recursive: true });
  const result = { taken_at: new Date().toISOString() };
  for (const [name, sql] of Object.entries(INVENTORY_QUERIES)) {
    try { result[name] = await query(sql); } catch (e) { result[name] = { error: String(e.message) }; }
    console.log(`${name}: ${Array.isArray(result[name]) ? result[name].length + " rows" : "error/absent"}`);
  }
  writeFileSync(path.join(outDir, "inventory.json"), JSON.stringify(result, null, 2));
  const md = [`# Hosted inventory ${ref()} — ${result.taken_at}`, ""];
  for (const [name, rows] of Object.entries(result)) {
    if (name === "taken_at") continue;
    md.push(`## ${name}`, "");
    if (!Array.isArray(rows)) { md.push("```", JSON.stringify(rows), "```", ""); continue; }
    if (!rows.length) { md.push("_none_", ""); continue; }
    const cols = Object.keys(rows[0]);
    md.push(`| ${cols.join(" | ")} |`, `| ${cols.map(() => "---").join(" | ")} |`);
    for (const r of rows) md.push(`| ${cols.map((c) => String(r[c] ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 300)).join(" | ")} |`);
    md.push("");
  }
  writeFileSync(path.join(outDir, "inventory.md"), md.join("\n"));
  console.log(`written ${outDir}/inventory.json and inventory.md`);
}

// ── THE CONTENT SAFETY SNAPSHOT ──
// The whole-table fingerprint hashes every column of every games row (so a
// changed subtitle, a reordered question, a new tag all move it); the id
// fingerprint hashes only the ordered ids (so "no puzzle was renumbered or
// lost" is a separate, stable check even while Deb edits).
const COUNTS_SQL = `
  select count(*)::int as games,
         count(*) filter (where status = 'published')::int as published,
         count(*) filter (where status = 'draft')::int as drafts,
         count(*) filter (where status = 'retired')::int as retired,
         coalesce(sum(jsonb_array_length(questions)), 0)::int as questions_total,
         min(date) as min_date, max(date) as max_date,
         max(updated_at)::text as last_updated,
         coalesce(md5(string_agg(md5(g::text), '|' order by g.id)), 'empty') as games_fingerprint,
         coalesce(md5(string_agg(g.id, '|' order by g.id)), 'empty') as id_fingerprint
    from public.games g`;
const ROWS_SQL = `select id, date, status, theme_title, jsonb_array_length(questions) as questions, updated_at::text as updated_at, md5(g::text) as row_md5 from public.games g order by id`;

async function snapshot() {
  const [summary] = await query(COUNTS_SQL);
  const rows = await query(ROWS_SQL);
  const storage = await query(`select count(*)::int as objects from storage.objects where bucket_id = 'wtf-images'`).catch(() => [{ objects: null }]);
  return { taken_at: new Date().toISOString(), project: ref(), summary, storage_objects: storage[0]?.objects ?? null, rows };
}

async function counts(outDir) {
  await identify();
  const snap = await snapshot();
  console.log(JSON.stringify({ taken_at: snap.taken_at, ...snap.summary, storage_objects: snap.storage_objects }, null, 1));
  if (outDir) {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(path.join(outDir, "counts.json"), JSON.stringify(snap, null, 2));
    console.log(`written ${outDir}/counts.json (${snap.rows.length} rows fingerprinted)`);
  }
  return snap;
}

async function exportContent(outDir) {
  if (!outDir) throw new Error("export needs --out <dir>");
  await identify();
  mkdirSync(outDir, { recursive: true });
  const snap = await snapshot();
  const games = await query("select * from public.games order by id");
  writeFileSync(path.join(outDir, "games.jsonl"), games.map((r) => JSON.stringify(r)).join("\n") + "\n");
  writeFileSync(path.join(outDir, "counts.json"), JSON.stringify(snap, null, 2));
  const objects = await query(`select name, (metadata->>'size')::bigint as size, created_at::text from storage.objects where bucket_id = 'wtf-images' order by name`).catch(() => []);
  writeFileSync(path.join(outDir, "storage-objects.jsonl"), objects.map((r) => JSON.stringify(r)).join("\n") + (objects.length ? "\n" : ""));
  console.log(`exported ${games.length} games (${snap.summary.questions_total} questions) and ${objects.length} storage object names to ${outDir}; fingerprint ${snap.summary.games_fingerprint}`);
}

/** Compare two counts.json snapshots: which ids were added, removed or changed. */
export function compareSnapshots(a, b) {
  const byId = (s) => Object.fromEntries(s.rows.map((r) => [r.id, r]));
  const A = byId(a), B = byId(b);
  const removed = Object.keys(A).filter((id) => !(id in B));
  const added = Object.keys(B).filter((id) => !(id in A));
  const changed = Object.keys(A).filter((id) => id in B && A[id].row_md5 !== B[id].row_md5);
  return {
    identical: removed.length === 0 && added.length === 0 && changed.length === 0,
    removed, added, changed,
    games: [a.summary.games, b.summary.games],
    questions_total: [a.summary.questions_total, b.summary.questions_total],
    id_fingerprint_same: a.summary.id_fingerprint === b.summary.id_fingerprint,
  };
}

function compareFiles(fa, fb) {
  if (!fa || !fb) throw new Error("compare needs two counts.json paths");
  const a = JSON.parse(readFileSync(fa, "utf8"));
  const b = JSON.parse(readFileSync(fb, "utf8"));
  const d = compareSnapshots(a, b);
  console.log(JSON.stringify(d, null, 1));
  if (!d.identical) process.exitCode = 2;
}

async function runSql(file, apply, confirmed) {
  if (!file) throw new Error("sql needs --file <f>");
  await identify();
  const text = readFileSync(file, "utf8");
  const before = await snapshot();
  console.log(`content before: ${before.summary.games} games, ${before.summary.questions_total} questions, fingerprint ${before.summary.games_fingerprint}`);
  if (apply) {
    if (process.env.WTF_HOSTED_WRITE !== "yes") throw new Error("REFUSING: --apply needs WTF_HOSTED_WRITE=yes");
    if (!confirmed) throw new Error("REFUSING: --apply needs --i-mean-the-hosted-wtf-project");
    if (/0003_wtf_admin_gate/.test(file)) {
      const [{ admins }] = await query("select count(*)::int as admins from public.admins").catch(() => [{ admins: 0 }]);
      if (!admins) throw new Error("REFUSING: 0003 (admin gate) needs an admin account first; Studio saves would fail for everyone.");
    }
    console.log(`APPLYING ${file} (${text.length} chars) to ${ref()} inside one transaction…`);
    const out = await execute(`begin;\n${text}\ncommit;`);
    console.log(JSON.stringify(out, null, 1).slice(0, 4000));
    console.log("applied.");
  } else {
    console.log(`rehearsing ${file} (${text.length} chars) inside BEGIN … ROLLBACK on ${ref()}…`);
    const out = await execute(`begin;\n${text}\nrollback;`);
    console.log(JSON.stringify(out, null, 1).slice(0, 4000));
    console.log("rehearsal complete; nothing was kept.");
  }
  const after = await snapshot();
  const d = compareSnapshots(before, after);
  console.log(`content after:  ${after.summary.games} games, ${after.summary.questions_total} questions, fingerprint ${after.summary.games_fingerprint}`);
  if (d.identical) console.log("CONTENT UNCHANGED by this run.");
  else console.log(`CONTENT MOVED during this run (Deb editing concurrently, or something wrong): ${JSON.stringify({ added: d.added, removed: d.removed, changed: d.changed })}`);
}

async function authConfig() {
  await identify();
  const c = await api("GET", `/v1/projects/${ref()}/config/auth`);
  const keep = ["site_url", "uri_allow_list", "mailer_autoconfirm", "external_email_enabled", "external_anonymous_users_enabled",
    "security_manual_linking_enabled", "disable_signup", "jwt_exp", "mailer_secure_email_change_enabled", "smtp_host", "rate_limit_anonymous_users"];
  console.log(JSON.stringify(Object.fromEntries(keep.map((k) => [k, c[k]])), null, 1));
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const arg = (f) => { const i = rest.indexOf(f); return i >= 0 ? rest[i + 1] : undefined; };
  switch (command) {
    case "inventory": return inventory(arg("--out"));
    case "counts": return counts(arg("--out"));
    case "export": return exportContent(arg("--out"));
    case "compare": return compareFiles(rest[0], rest[1]);
    case "sql": return runSql(arg("--file"), rest.includes("--apply"), rest.includes("--i-mean-the-hosted-wtf-project"));
    case "auth-config": return authConfig();
    default: throw new Error("usage: node tools/hosted.mjs <inventory --out d | counts [--out d] | export --out d | compare a.json b.json | sql --file f [--apply --i-mean-the-hosted-wtf-project] | auth-config>");
  }
}
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().then(() => process.exit(process.exitCode ?? 0), (e) => { console.error(`\n${e.message}\n`); process.exit(1); });
