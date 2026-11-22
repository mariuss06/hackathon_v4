"use client";

import Link from "next/link";
import { FlaskConical, LogIn, LogOut, UserRound } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { useLanguage } from "./LanguageProvider";

/**
 * "Autentificare" / "Contul meu" + "Deconectare". Guest mode keeps working without an account;
 * the Instant Demo session shows as "Cont Demo".
 * Lives in its own module so both the marketing header and the in-app shell can use it
 * without a circular Shell ⇄ HomeNav import.
 */
export function AccountButtons() {
  const { session, profile, signOut, loading, demoSession } = useAuth();
  const { t } = useLanguage();
  if (loading) return null;
  if (!session && !demoSession) {
    return (
      <Link href="/login" className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-white/80 px-3.5 py-1.5 text-xs font-medium text-ink hover:border-line-strong">
        <LogIn size={13} /> {t.account.signIn}
      </Link>
    );
  }
  return (
    <div className="flex min-w-0 shrink-0 items-center gap-1 rounded-full border border-line bg-white/80 p-1">
      <Link href="/cont" className="inline-flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-ink hover:bg-canvas" title={session?.user.email ?? demoSession?.email ?? ""}>
        {demoSession ? <FlaskConical size={13} className="shrink-0 text-navy-3" /> : <UserRound size={13} className="shrink-0" />}
        <span className="truncate">
          {demoSession ? t.account.demoAccount : t.account.myAccount}
          {profile?.role === "admin" ? t.account.adminSuffix : ""}
        </span>
      </Link>
      <button type="button" onClick={() => void signOut()} className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs text-muted hover:bg-canvas hover:text-ink" title={t.account.signOut}>
        <LogOut size={12} /> <span className="hidden sm:inline">{t.account.signOut}</span>
      </button>
    </div>
  );
}
