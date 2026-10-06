// The one Supabase client. App.jsx used to build it inline; it lives here so
// the account modules and the game share a single session.
//
// Settings (the shared-account pattern, Rainbow and Cluevoyance):
//   flowType 'pkce'            the sign-in code is exchanged on /auth/callback, never from a URL hash
//   detectSessionInUrl false   only the callback page turns a code into a session
//                              (the old magic-link flow that needed URL detection is gone)
//   storageKey                 the library's default for this project, spelled out
//                              (src/game/config.js) so existing guest sessions survive
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_CONFIGURED, SUPABASE_KEY, SUPABASE_URL, authStorageKey } from "../game/config.js";

export const AUTH_STORAGE_KEY = authStorageKey();

/** null when no project is configured (offline preview). */
export const supabase = SUPABASE_CONFIGURED
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        storageKey: AUTH_STORAGE_KEY,
        persistSession: true,
        autoRefreshToken: true,
        flowType: "pkce",
        detectSessionInUrl: false,
      },
    })
  : null;
