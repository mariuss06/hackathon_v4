/**
 * Browser-side Supabase Auth client (anon key) + `apiFetch`, which adds the signed-in user's
 * access token to calls to our own API routes. Without NEXT_PUBLIC_SUPABASE_URL /
 * NEXT_PUBLIC_SUPABASE_ANON_KEY the app runs in guest mode only (accounts disabled).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const authConfigured = Boolean(URL && ANON);

let browserClient: SupabaseClient | null = null;

export function getBrowserSupabase(): SupabaseClient | null {
  if (!authConfigured || typeof window === "undefined") return null;
  browserClient ??= createClient(URL, ANON, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "afghankingz-credit-auth" } });
  return browserClient;
}

let accessToken: string | null = null;

/** Set by AuthProvider whenever the session changes. */
export function setAccessToken(token: string | null) {
  accessToken = token;
}

export const hasAccessToken = () => accessToken !== null;

/** fetch() for our API routes: same signature, plus `Authorization: Bearer` when signed in. */
export function apiFetch(input: string, init: RequestInit = {}) {
  if (!accessToken) return fetch(input, init);
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  return fetch(input, { ...init, headers });
}
