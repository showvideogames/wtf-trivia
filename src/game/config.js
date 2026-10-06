// Runtime configuration. Everything that names a Supabase project or the
// shared sign-in service comes from the environment: there is no hosted
// project default in code, so pointing WTF Trivia at another project is a
// configuration change, never a code change.
//
//   VITE_SUPABASE_URL              the Supabase project (content, players, accounts)
//   VITE_SUPABASE_ANON_KEY         its publishable (anon) key, public by design
//                                  (VITE_SUPABASE_PUBLISHABLE_KEY is accepted as an alias)
//   VITE_PLATFORM_DISCOVERY_URL    the shared sign-in's OpenID discovery document;
//                                  empty = accounts OFF (guest-only build, exactly today's game)
//   VITE_ACCOUNTS_ENABLED          "false" hides every sign-in surface (emergency switch)
//
// See .env.example and docs/SHARED-ACCOUNTS.md.

const trim = (v) => (typeof v === "string" ? v.trim() : "");

export const SUPABASE_URL = trim(import.meta.env.VITE_SUPABASE_URL);
export const SUPABASE_KEY = trim(import.meta.env.VITE_SUPABASE_ANON_KEY) || trim(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);

/** True when the app has a Supabase project to talk to. */
export const SUPABASE_CONFIGURED = SUPABASE_URL !== "" && SUPABASE_KEY !== "";

export const PLATFORM_DISCOVERY_URL = trim(import.meta.env.VITE_PLATFORM_DISCOVERY_URL);

/** Accounts are on when a project and the sign-in service are configured and the switch is not explicitly off. */
export const ACCOUNTS_ENABLED =
  SUPABASE_CONFIGURED && PLATFORM_DISCOVERY_URL !== "" && trim(import.meta.env.VITE_ACCOUNTS_ENABLED ?? "true") !== "false";

/**
 * The browser-storage key supabase-js uses for this project's session. It is
 * the library's own default (sb-<host label>-auth-token), spelled out so the
 * code that removes the provider token after sign-in and the code that drops
 * a deleted account's session agree with the client. Keeping the default
 * means every existing guest's session survives this change.
 */
export function authStorageKey(url = SUPABASE_URL) {
  try {
    return `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
  } catch {
    return "sb-wtf-auth-token";
  }
}

let announced = false;
/** Say once, in the console, which mode the app is in (development only). */
export function announceConfiguration() {
  if (announced || !import.meta.env.DEV) return;
  announced = true;
  if (!SUPABASE_CONFIGURED) {
    console.info("[wtf] Supabase is not configured: offline preview with the demo puzzle; accounts off.");
  } else if (!ACCOUNTS_ENABLED) {
    console.info("[wtf] accounts are off (no VITE_PLATFORM_DISCOVERY_URL, or VITE_ACCOUNTS_ENABLED=false); guest-only build.");
  }
}
