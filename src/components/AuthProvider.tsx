"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { apiFetch, authConfigured, getBrowserSupabase, setAccessToken } from "@/lib/auth/client";
import { clearDemoSession, readDemoSession, startDemoSession, subscribeDemoSession, type DemoSession } from "@/lib/auth/demo-session";
import { useLanguage } from "./LanguageProvider";

export interface AccountProfile {
  id: string;
  email: string;
  fullName: string;
  role: "user" | "admin";
}

interface AuthCtx {
  /** False when Supabase Auth is not configured: guest mode only. */
  configured: boolean;
  /** True until the stored session has been read. */
  loading: boolean;
  session: Session | null;
  profile: AccountProfile | null;
  /** Account admin (role 'admin') or the hackathon demo-admin session. */
  isAdmin: boolean;
  demoAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ ok: boolean; message: string }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ ok: boolean; message: string; redirect?: boolean }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setDemoAdmin: (on: boolean) => void;
  /**
   * Instant Demo Login: a simulated session kept in this browser only (no Supabase account, no token sent to
   * the API, so the API routes treat it as guest mode and never answer 401). A real sign-in replaces it.
   */
  demoSession: DemoSession | null;
  signInDemo: () => DemoSession;
  /** Signed in with a real account OR with the demo session. */
  signedIn: boolean;
}

const Ctx = createContext<AuthCtx | null>(null);

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside <AuthProvider>");
  return c;
}

type AuthErrors = { invalid: string; notConfirmed: string; exists: string; password: string };
const translate = (msg: string, e: AuthErrors) =>
  /invalid login credentials/i.test(msg)
    ? e.invalid
    : /email not confirmed/i.test(msg)
      ? e.notConfirmed
      : /already registered|already exists/i.test(msg)
        ? e.exists
        : /password/i.test(msg)
          ? e.password
          : msg;

const noDemo = () => null;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(authConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [demoAdmin, setDemoAdminState] = useState(false);
  const { t } = useLanguage();
  const a = t.auth;
  const demoSession = useSyncExternalStore(subscribeDemoSession, readDemoSession, noDemo);

  const loadProfile = useCallback(async () => {
    try {
      const r = (await apiFetch("/api/account/profile").then((x) => x.json())) as { ok: boolean; profile?: AccountProfile; demoAdmin?: boolean };
      setProfile(r.ok && r.profile ? r.profile : null);
      setDemoAdminState(Boolean(r.demoAdmin));
    } catch {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    const sb = getBrowserSupabase();
    if (!sb) {
      // Guest mode: only the demo-admin cookie can exist.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the demo-admin session from the API once
      void loadProfile();
      return;
    }
    let active = true;
    void sb.auth.getSession().then(({ data }) => {
      if (!active) return;
      setAccessToken(data.session?.access_token ?? null);
      setSession(data.session);
      setLoading(false);
      void loadProfile();
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, s) => {
      setAccessToken(s?.access_token ?? null);
      setSession(s);
      void loadProfile();
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const sb = getBrowserSupabase();
    if (!sb) return { ok: false, message: a.errors.noKeys };
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    if (!error) clearDemoSession(); // a real account replaces the demo session
    return error ? { ok: false, message: translate(error.message, a.errors) } : { ok: true, message: a.signedIn };
  }, [a]);

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    const sb = getBrowserSupabase();
    if (!sb) return { ok: false, message: a.errors.noKeys };
    if (password.length < 8) return { ok: false, message: a.errors.password };
    const { data, error } = await sb.auth.signUp({ email: email.trim(), password, options: { data: { full_name: fullName.trim() } } });
    if (error) return { ok: false, message: translate(error.message, a.errors) };
    if (data.session) clearDemoSession();
    return data.session ? { ok: true, message: a.createdWithSession, redirect: true } : { ok: true, message: a.createdConfirm };
  }, [a]);

  const signOut = useCallback(async () => {
    clearDemoSession();
    const sb = getBrowserSupabase();
    if (sb) await sb.auth.signOut();
    setAccessToken(null);
    setSession(null);
    setProfile(null);
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      configured: authConfigured,
      loading,
      session,
      profile,
      isAdmin: profile?.role === "admin" || demoAdmin,
      demoAdmin,
      signIn,
      signUp,
      signOut,
      refreshProfile: loadProfile,
      setDemoAdmin: setDemoAdminState,
      demoSession: session ? null : demoSession,
      signInDemo: startDemoSession,
      signedIn: Boolean(session || demoSession),
    }),
    [loading, session, profile, demoAdmin, signIn, signUp, signOut, loadProfile, demoSession],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
