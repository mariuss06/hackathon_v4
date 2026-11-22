"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { CircleAlert, CircleCheck, FlaskConical, KeyRound, LoaderCircle, LogIn, ShieldCheck, UserPlus } from "lucide-react";
import { useAuth } from "../AuthProvider";
import { BrandIcon } from "../BrandLogo";
import { DemoPlanList } from "../DemoSwitcher";
import { useLanguage } from "../LanguageProvider";
import { Button, cx, Field, inputCls } from "../ui";

/** Where to go after signing in: ?next=/path (same-origin paths only), else the evaluation. */
function nextPath() {
  const n = new URLSearchParams(window.location.search).get("next") ?? "";
  return n.startsWith("/") && !n.startsWith("//") ? n : "/onboarding";
}

/** Discreet hackathon entry: the ADMIN_DEMO_CODE opens /admin without an account (httpOnly cookie). */
function DemoAdminAccess() {
  const router = useRouter();
  const { refreshProfile } = useAuth();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mx-auto mt-6 flex items-center gap-1 text-[11px] text-faint hover:text-muted">
        <ShieldCheck size={11} /> {t.auth.adminLink}
      </button>
    );
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = (await fetch("/api/admin/demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) }).then((x) => x.json())) as { ok: boolean; error?: string };
      if (!r.ok) setError(r.error ?? t.auth.adminDenied);
      else {
        await refreshProfile();
        router.push("/admin");
      }
    } catch {
      setError(t.auth.apiDown);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="mt-6 rounded-2xl border border-dashed border-line p-4">
      <p className="text-xs font-medium text-ink">{t.auth.adminTitle}</p>
      <p className="mt-0.5 text-[11px] text-muted">{t.auth.adminLead}</p>
      <div className="mt-3 flex gap-2">
        <input type="password" className={inputCls} value={code} onChange={(e) => setCode(e.target.value)} placeholder={t.auth.adminPlaceholder} autoComplete="off" />
        <Button type="submit" variant="secondary" disabled={busy || !code}>
          {busy ? <LoaderCircle size={14} className="animate-spin" /> : <KeyRound size={14} />} {t.auth.adminEnter}
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-red">{error}</p>}
    </form>
  );
}

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const { configured, signIn, signUp, session, demoSession, signInDemo } = useAuth();
  const { t } = useLanguage();
  const a = t.auth;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const register = mode === "register";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    const r = register ? await signUp(email, password, fullName) : await signIn(email, password);
    setResult(r);
    setBusy(false);
    if (r.ok && (!register || ("redirect" in r && r.redirect))) router.push(nextPath());
  };

  return (
    <div className="mx-auto mt-6 grid w-full max-w-[960px] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* Instant Demo Login: no email or password; simulated session in this browser only. */}
      <div className="rounded-[28px] border border-navy/10 bg-navy-soft/40 p-6 sm:p-7 lg:order-2">
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-navy text-white">
          <FlaskConical size={18} />
        </span>
        <h2 className="mt-4 text-xl font-normal tracking-tight text-ink">{a.demoTitle}</h2>
        <p className="mb-4 mt-1 text-sm leading-relaxed text-muted">{a.demoLead}</p>
        {demoSession && <p className="mb-3 rounded-xl bg-emerald-soft px-3.5 py-2.5 text-xs font-medium text-emerald-strong">{a.demoActive(demoSession.fullName)}</p>}
        <DemoPlanList
          hrefFor={(tier) => `/demo?plan=${tier}`}
          onPick={() => {
            if (!session) signInDemo();
          }}
        />
      </div>
      <div className="w-full rounded-[28px] border border-white/80 bg-card p-6 shadow-card sm:p-7 lg:order-1">
        <BrandIcon size={40} />
        <h1 className="mt-4 text-2xl font-normal tracking-tight text-ink">{register ? a.registerTitle : a.loginTitle}</h1>
        <p className="mt-1 text-sm leading-relaxed text-muted">{register ? a.registerLead : a.loginLead}</p>

        {session ? (
          <p className="mt-5 flex items-start gap-2 rounded-xl bg-emerald-soft px-3.5 py-2.5 text-xs text-emerald-strong">
            <CircleCheck size={14} className="mt-0.5 shrink-0" />
            <span>
              {a.signedInAs(session.user.email ?? "")}{" "}
              <Link href="/onboarding" className="underline">
                {a.goToEvaluation}
              </Link>
            </span>
          </p>
        ) : !configured ? (
          <p className="mt-5 rounded-xl bg-amber-soft px-3.5 py-3 text-xs leading-relaxed text-amber">
            {a.notConfigured}
          </p>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-3.5">
            {register && (
              <Field label={a.fullName}>
                <input required className={inputCls} value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
              </Field>
            )}
            <Field label={a.email}>
              <input required type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </Field>
            <Field label={a.password} hint={register ? a.passwordHint : undefined}>
              <input required type="password" minLength={register ? 8 : undefined} className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={register ? "new-password" : "current-password"} />
            </Field>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? <LoaderCircle size={15} className="animate-spin" /> : register ? <UserPlus size={15} /> : <LogIn size={15} />}
              {register ? a.submitRegister : a.submitLogin}
            </Button>
            {result && (
              <p className={cx("flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-xs", result.ok ? "bg-emerald-soft text-emerald-strong" : "bg-red-soft text-red")}>
                {result.ok ? <CircleCheck size={14} className="mt-0.5 shrink-0" /> : <CircleAlert size={14} className="mt-0.5 shrink-0" />}
                {result.message}
              </p>
            )}
          </form>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4 text-xs text-muted">
          {register ? (
            <span>
              {a.haveAccount}{" "}
              <Link href="/login" className="font-medium text-ink underline-offset-2 hover:underline">
                {a.loginLink}
              </Link>
            </span>
          ) : (
            <span>
              {a.noAccount}{" "}
              <Link href="/register" className="font-medium text-ink underline-offset-2 hover:underline">
                {a.registerLink}
              </Link>
            </span>
          )}
          <Link href="/onboarding" className="hover:text-ink">
            {a.guest}
          </Link>
        </div>
        {!register && <DemoAdminAccess />}
      </div>
    </div>
  );
}
