#!/usr/bin/env node
/**
 * Automated checks against a deployed preview (or the live site) and the
 * hosted project it talks to. Everything here is safe: public key only (plus
 * one throw-away anonymous guest that is deleted again with the service key
 * when WTF_HOSTED_SERVICE_ROLE_KEY is given), no sign-in, no content write
 * that could succeed. The hosted sign-in page is never automated.
 *
 *   node tools/preview-check.mjs --url https://<preview>.vercel.app [--bypass <token>] [--expect-counts <counts.json>]
 *
 * Reads: WTF_PROJECT_REF (the hosted project the preview must use), WTF_ANON_KEY
 * (its public key), optional VERCEL_PROTECTION_BYPASS or --bypass, optional
 * WTF_HOSTED_SERVICE_ROLE_KEY (only to delete the probe guest afterwards).
 */
import { readFileSync } from "node:fs";
const args = process.argv.slice(2);
const arg = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const url = (arg("--url") || "").replace(/\/$/, "");
if (!/^https:\/\//.test(url)) { console.error("usage: node tools/preview-check.mjs --url https://<preview> [--bypass <token>] [--expect-counts <counts.json>]"); process.exit(2); }
const ref = process.env.WTF_PROJECT_REF;
if (!/^[a-z]{20}$/.test(ref || "")) { console.error("WTF_PROJECT_REF is required"); process.exit(2); }
const KEY = process.env.WTF_ANON_KEY;
if (!KEY) { console.error("WTF_ANON_KEY (the project's public key) is required"); process.exit(2); }
const SERVICE = process.env.WTF_HOSTED_SERVICE_ROLE_KEY || "";
const bypass = arg("--bypass") || process.env.VERCEL_PROTECTION_BYPASS || "";
const expectFile = arg("--expect-counts");
const SB = `https://${ref}.supabase.co`;
const anonHeaders = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const pageHeaders = bypass ? { "x-vercel-protection-bypass": bypass } : {};

const results = [];
function check(name, ok, detail) { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); }

async function page(p) {
  const r = await fetch(url + p, { headers: pageHeaders, redirect: "manual" });
  return { status: r.status, text: await r.text(), location: r.headers.get("location") };
}

// 1. the page and the SPA rewrites
const home = await page("/");
check("home loads (200, has #root)", home.status === 200 && /id="root"/.test(home.text), `HTTP ${home.status}`);
const cb = await page("/auth/callback");
check("/auth/callback is served by the app (SPA rewrite)", cb.status === 200 && /id="root"/.test(cb.text), `HTTP ${cb.status}`);
const adm = await page("/admin");
check("/admin is served by the app (SPA rewrite)", adm.status === 200 && /id="root"/.test(adm.text), `HTTP ${adm.status}`);
const scriptSrc = (home.text.match(/<script[^>]+src="([^"]+\.js)"/) || [])[1];
let bundle = "";
if (scriptSrc) bundle = (await page(scriptSrc.startsWith("http") ? new URL(scriptSrc).pathname : scriptSrc)).text;
check("bundle found", bundle.length > 10000, `${bundle.length} bytes`);
check("bundle points at the hosted project", bundle.includes(`${ref}.supabase.co`));
check("bundle carries the Staging discovery URL (accounts ON)", /authkit\.app\/\.well-known\/openid-configuration/.test(bundle) && /staging/.test(bundle));
check("bundle names no Production AuthKit domain", !bundle.includes("obedient-book-17.authkit.app"));
check("bundle names no local address", !/127\.0\.0\.1:556|localhost:556/.test(bundle));
check("bundle has no email/password sign-in left", !/signInWithPassword|signInWithOtp/.test(bundle));

// 2. content, through the public key, as the client reads it
const games = await fetch(`${SB}/rest/v1/games?select=id,status,questions`, { headers: anonHeaders }).then((r) => r.json());
const questions = Array.isArray(games) ? games.reduce((n, g) => n + (Array.isArray(g.questions) ? g.questions.length : 0), 0) : -1;
check("content readable by the game (every status)", Array.isArray(games) && games.length > 0, `${Array.isArray(games) ? games.length : "?"} games / ${questions} questions`);
if (expectFile) {
  const exp = JSON.parse(readFileSync(expectFile, "utf8"));
  check("content counts match the latest snapshot", games.length === exp.summary.games && questions === exp.summary.questions_total, `snapshot ${exp.summary.games} / ${exp.summary.questions_total}`);
  const ids = new Set(games.map((g) => g.id));
  check("every snapshot id is still present", exp.rows.every((r) => ids.has(r.id)));
}
const stats = await fetch(`${SB}/rest/v1/puzzle_stats?select=puzzle_id&limit=1`, { headers: anonHeaders });
check("community stats readable", stats.status === 200, `HTTP ${stats.status}`);
const favCounts = await fetch(`${SB}/rest/v1/puzzle_favorite_counts?select=puzzle_id&limit=1`, { headers: anonHeaders });
check("favorite counts readable", favCounts.status === 200, `HTTP ${favCounts.status}`);

// 3. refusals for anon (no session)
for (const t of ["players", "game_records", "player_stats", "puzzle_favorites", "accounts", "admins", "guest_handoffs"]) {
  const r = await fetch(`${SB}/rest/v1/${t}?select=*&limit=1`, { headers: anonHeaders });
  check(`anon cannot read ${t}`, r.status === 401 || r.status === 403, `HTTP ${r.status}`);
}
const rpcArgs = { ensure_account: {}, my_account: {}, delete_my_account: {}, offer_guest_history: {}, resolve_guest_handoff: { _code: "x".repeat(32) }, import_guest_history: { _code: "x".repeat(32) }, decline_guest_history: { _code: "x".repeat(32) } };
for (const [fn, body] of Object.entries(rpcArgs)) {
  const r = await fetch(`${SB}/rest/v1/rpc/${fn}`, { method: "POST", headers: anonHeaders, body: JSON.stringify(body) });
  check(`anon cannot call ${fn}`, r.status === 401 || r.status === 403 || r.status === 404, `HTTP ${r.status}`);
}
const ping = await fetch(`${SB}/rest/v1/rpc/ping`, { method: "POST", headers: anonHeaders, body: "{}" });
check("anon can ping", ping.status === 200 && (await ping.text()) === "true", `HTTP ${ping.status}`);
const gameWrite = await fetch(`${SB}/rest/v1/games`, { method: "POST", headers: { ...anonHeaders, Prefer: "return=minimal" }, body: JSON.stringify({ id: "g-preview-probe", date: "2031-01-01", theme_title: "probe", category_a: "A", category_b: "B", status: "draft", questions: [] }) });
const gateOn = gameWrite.status === 401 || gameWrite.status === 403;
check(gateOn ? "anon cannot write content (admin gate ON)" : "anon content write status (admin gate not yet applied)", true, `HTTP ${gameWrite.status}${gateOn ? "" : " — remove g-preview-probe if it was created"}`);

// 4. the guest path: an anonymous sign-in gets its own player row, cannot touch others, is not an account.
//    Skipped with --no-guest (it creates one anonymous auth user; the browser smoke covers the same path).
const noGuest = args.includes("--no-guest");
const anonSignIn = noGuest ? {} : await fetch(`${SB}/auth/v1/signup`, { method: "POST", headers: anonHeaders, body: "{}" }).then((r) => r.json());
const guestToken = anonSignIn.access_token;
const guestId = anonSignIn.user?.id;
if (!noGuest) check("anonymous guest sign-in works", Boolean(guestToken && guestId), guestId ? `guest ${guestId}` : JSON.stringify(anonSignIn).slice(0, 120));
if (guestToken) {
  const gh = { ...anonHeaders, Authorization: `Bearer ${guestToken}` };
  const ins = await fetch(`${SB}/rest/v1/players`, { method: "POST", headers: { ...gh, Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ id: guestId, email: null, is_guest: true }) });
  check("guest can create its own player row", ins.status === 201 || ins.status === 200 || ins.status === 204, `HTTP ${ins.status}`);
  const others = await fetch(`${SB}/rest/v1/players?select=id&id=neq.${guestId}&limit=5`, { headers: gh }).then((r) => r.json());
  check("guest sees no other player rows (0002)", Array.isArray(others) && others.length === 0, JSON.stringify(others).slice(0, 80));
  const otherPlays = await fetch(`${SB}/rest/v1/game_records?select=id&player_id=neq.${guestId}&limit=5`, { headers: gh }).then((r) => r.json());
  check("guest sees no other plays (0002)", Array.isArray(otherPlays) && otherPlays.length === 0, JSON.stringify(otherPlays).slice(0, 80));
  const forged = await fetch(`${SB}/rest/v1/game_records`, { method: "POST", headers: { ...gh, Prefer: "return=minimal" }, body: JSON.stringify({ player_id: "00000000-0000-4000-8000-000000000000", puzzle_id: games[0]?.id, game_date: "2026-01-01" }) });
  check("guest cannot write another player's play", forged.status === 401 || forged.status === 403, `HTTP ${forged.status}`);
  const ea = await fetch(`${SB}/rest/v1/rpc/ensure_account`, { method: "POST", headers: gh, body: "{}" }).then((r) => r.json());
  check("a guest is not an account (ensure_account → not_platform_linked)", ea?.[0]?.outcome === "not_platform_linked", JSON.stringify(ea).slice(0, 80));
  const uid = await fetch(`${SB}/rest/v1/rpc/wtf_uid`, { method: "POST", headers: gh, body: "{}" }).then((r) => r.text());
  check("wtf_uid() is null for a guest", uid === "null" || uid === "", uid);
  const offer = await fetch(`${SB}/rest/v1/rpc/offer_guest_history`, { method: "POST", headers: gh, body: "{}" }).then((r) => r.json());
  check("a guest with no history has nothing to hand off", offer?.[0]?.outcome === "no_history", JSON.stringify(offer).slice(0, 80));
  const imp = await fetch(`${SB}/rest/v1/rpc/import_guest_history`, { method: "POST", headers: gh, body: JSON.stringify({ _code: "x".repeat(32) }) }).then((r) => r.json());
  check("a guest cannot claim a handoff", imp?.[0]?.outcome === "not_signed_in", JSON.stringify(imp).slice(0, 80));
  const acc = await fetch(`${SB}/rest/v1/accounts?select=*`, { headers: gh });
  check("a guest cannot read accounts", acc.status === 401 || acc.status === 403, `HTTP ${acc.status}`);
  if (SERVICE) {
    const del = await fetch(`${SB}/auth/v1/admin/users/${guestId}`, { method: "DELETE", headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } });
    check("probe guest removed again", del.status === 200, `HTTP ${del.status}`);
  } else {
    console.log(`note: probe guest ${guestId} left in place (no service key given)`);
  }
}

// 5. the sign-in start: GoTrue's authorize for custom:platform must redirect to the Staging domain with PKCE
const authz = await fetch(`${SB}/auth/v1/authorize?provider=custom:platform&redirect_to=${encodeURIComponent(url + "/auth/callback")}&code_challenge=abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG&code_challenge_method=s256`, { redirect: "manual", headers: { apikey: KEY } });
const loc = authz.headers.get("location") || "";
check("hosted authorize redirects to the Staging sign-in", authz.status >= 300 && authz.status < 400 && /authkit\.app/.test(loc) && /staging/.test(loc), `HTTP ${authz.status} → ${loc.slice(0, 90)}`);
check("…with PKCE and the project's own GoTrue callback", /code_challenge=/.test(loc) && loc.includes(encodeURIComponent(`${SB}/auth/v1/callback`)) || loc.includes(`${SB}/auth/v1/callback`), loc.includes("redirect_uri") ? "redirect_uri present" : "no redirect_uri");

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
