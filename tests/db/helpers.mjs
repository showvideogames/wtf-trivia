// Shared setup for the database/API tests. Talks ONLY to the local Supabase
// stack from supabase/config.toml (started with `npm run db:start`, reset
// with `npm run db:reset`) and refuses anything else. Keys are read from
// `supabase status`, never from a committed file.
//
// Signing in without the shared sign-in service (the kit's technique): an auth
// user is minted with the service key, a `custom:platform` identity row is
// inserted into auth.identities the way GoTrue would after a real OIDC round
// trip, and a session comes from the local GoTrue's password grant. Guests are
// real anonymous sign-ins through the local GoTrue. The hosted sign-in page is
// never automated.

import { execFileSync, execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

let cfg = null;
export function stack() {
  if (cfg) return cfg;
  const out = execSync("npx supabase status -o json", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const json = JSON.parse(out.slice(out.indexOf("{")));
  const apiUrl = json.API_URL;
  const host = new URL(apiUrl).hostname;
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
    throw new Error(`Refusing to run database tests against ${apiUrl}: local stack only.`);
  }
  cfg = { apiUrl, anonKey: json.ANON_KEY, serviceKey: json.SERVICE_ROLE_KEY, dbUrl: json.DB_URL };
  return cfg;
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
export const admin = () => createClient(stack().apiUrl, stack().serviceKey, opts);
export const anon = () => createClient(stack().apiUrl, stack().anonKey, opts);

/** Run SQL as postgres inside the local database container; returns stdout (rows as text, one per line). */
export function sql(text) {
  return execFileSync(
    "docker",
    ["exec", "-i", "supabase_db_wtf-trivia", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At", "-c", text],
    { encoding: "utf8" },
  ).trim();
}

const runId = Date.now().toString(36);
let seq = 0;
export const uniqueEmail = (name) => `${name.toLowerCase()}.${runId}.${++seq}@wtf.test`;
export const uniqueGlobalId = () => `user_${runId.toUpperCase().padEnd(8, "0")}${String(++seq).padStart(18, "0")}`.slice(0, 31);

/** An auth user with a password (so the local GoTrue can mint a session). NOT yet a WTF account. */
export async function createAuthUser(email = uniqueEmail("person")) {
  const password = `pw-${runId}-${seq}`;
  const created = await admin().auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  return { id: created.data.user.id, email, password };
}

/** Exactly what GoTrue writes after a real custom:platform sign-in: the identity row with the provider's subject. */
export function attachPlatformIdentity(userId, globalId, email) {
  const data = JSON.stringify({ sub: globalId, email, email_verified: true });
  sql(`insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
       values (gen_random_uuid(), '${userId}', '${data.replace(/'/g, "''")}'::jsonb, 'custom:platform', '${globalId}', now(), now(), now())`);
}

/** Change the email the provider reports (what a later sign-in after an email change at WorkOS does). */
export function setPlatformIdentityEmail(userId, email) {
  sql(`update auth.identities set identity_data = identity_data || '{"email":"${email}"}'::jsonb, updated_at = now()
        where user_id = '${userId}' and provider = 'custom:platform'`);
}

export async function signIn(user) {
  const client = anon();
  const res = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (res.error) throw res.error;
  return client;
}

/** A real guest: an anonymous sign-in through the local GoTrue, plus its players row (as the app does). */
export async function makeGuest() {
  const client = anon();
  const res = await client.auth.signInAnonymously();
  if (res.error) throw res.error;
  const id = res.data.user.id;
  const ins = await client.from("players").insert({ id, email: null, is_guest: true });
  if (ins.error) throw ins.error;
  return { id, client };
}

/** Calls an RPC; throws on transport/SQL error; returns the first row (or scalar). */
export async function rpc(client, fn, args = {}) {
  const { data, error } = await client.rpc(fn, args);
  if (error) {
    const e = new Error(error.message);
    e.code = error.code;
    throw e;
  }
  return Array.isArray(data) ? data[0] : data;
}

/** Calls an RPC expecting an error; returns the error (or throws if it succeeded). */
export async function rpcError(client, fn, args = {}) {
  const { error } = await client.rpc(fn, args);
  if (!error) throw new Error(`${fn} unexpectedly succeeded`);
  return error;
}

/** A full WTF account: auth user + custom:platform identity + ensure_account(). */
export async function makeAccount(name = "player", globalId = uniqueGlobalId()) {
  const user = await createAuthUser(uniqueEmail(name));
  attachPlatformIdentity(user.id, globalId, user.email);
  const client = await signIn(user);
  const row = await rpc(client, "ensure_account");
  if (row.outcome !== "ok") throw new Error(`ensure_account: ${row.outcome}`);
  return { ...user, globalId, client, account: row };
}

/** Published puzzle ids, newest first. */
export function puzzleIds() {
  return sql("select id from public.games where status = 'published' order by date desc").split("\n").filter(Boolean);
}

export function puzzleDate(id) {
  return sql(`select date from public.games where id = '${id}'`);
}

export function grantAdmin(userId) {
  sql(`insert into public.admins (user_id) values ('${userId}') on conflict do nothing`);
}

export function count(table, where = "true") {
  return Number(sql(`select count(*) from ${table} where ${where}`));
}

/** A fingerprint of every content row (the same formula tools/hosted.mjs uses). */
export function contentFingerprint() {
  return sql("select coalesce(md5(string_agg(md5(g::text), '|' order by g.id)), 'empty') from public.games g");
}

/**
 * Play a puzzle through the API exactly as App.jsx does: insert the record,
 * save each answer, then finish. `answers` is an array of booleans (correct?).
 */
export async function playPuzzle(client, playerId, puzzleId, answers, { finish = true } = {}) {
  const date = puzzleDate(puzzleId);
  const ins = await client.from("game_records").upsert(
    { player_id: playerId, puzzle_id: puzzleId, game_date: date, theme_title: "t", score: 0, total_questions: answers.length, answers: [], completed: false },
    { onConflict: "player_id,puzzle_id", ignoreDuplicates: true },
  );
  if (ins.error) throw ins.error;
  const list = answers.map((correct, i) => ({ index: i, choice: correct ? "A" : "B", correct }));
  const score = answers.filter(Boolean).length;
  const upd = await client.from("game_records")
    .update(finish ? { answers: list, score, completed: true, completed_at: new Date().toISOString() } : { answers: list.slice(0, Math.max(1, list.length - 1)), score })
    .eq("player_id", playerId).eq("puzzle_id", puzzleId).select();
  if (upd.error) throw upd.error;
  return upd.data[0];
}
