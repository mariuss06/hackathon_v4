/**
 * Server-side identity for the API routes.
 *
 *  - Accounts: Supabase Auth (email + password). The browser sends `Authorization: Bearer <access token>`;
 *    the token is verified with Supabase (`auth.getUser`), never trusted blindly.
 *  - Roles: public.profiles.role ('user' | 'admin'), or an email listed in ADMIN_EMAILS.
 *  - Hackathon demo admin: POST /api/admin/demo with ADMIN_DEMO_CODE sets an httpOnly cookie holding an
 *    HMAC of that code. Without ADMIN_DEMO_CODE the demo login is disabled.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase/server";

export const ADMIN_DEMO_COOKIE = "ak_admin_demo";

export interface RequestUser {
  id: string;
  email: string;
}

export type Role = "user" | "admin";

function bearer(request: NextRequest) {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

/** The signed-in account behind the request, or null (guest mode / Supabase not configured). */
export async function getRequestUser(request: NextRequest): Promise<RequestUser | null> {
  const token = bearer(request);
  const sb = getSupabase();
  if (!token || !sb) return null;
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? "" };
}

const adminEmails = () =>
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);

/** Role from public.profiles (created by the on-signup trigger); ADMIN_EMAILS always counts as admin. */
export async function getRole(user: RequestUser): Promise<Role> {
  if (user.email && adminEmails().includes(user.email.toLowerCase())) return "admin";
  const sb = getSupabase();
  if (!sb) return "user";
  const { data } = await sb.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return (data as { role?: string } | null)?.role === "admin" ? "admin" : "user";
}

/** Value stored in the demo-admin cookie: HMAC-SHA256(ADMIN_DEMO_CODE, fixed label). */
export function demoAdminToken(code = process.env.ADMIN_DEMO_CODE ?? "") {
  return code ? createHmac("sha256", code).update("afghankingz-credit-admin-demo").digest("hex") : "";
}

export const demoAdminEnabled = () => Boolean(process.env.ADMIN_DEMO_CODE);

/** Constant-time check of the code typed in the demo-admin form. */
export function checkDemoCode(code: string) {
  const expected = process.env.ADMIN_DEMO_CODE ?? "";
  if (!expected || !code) return false;
  const a = Buffer.from(code);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function hasDemoCookie(request: NextRequest) {
  const expected = demoAdminToken();
  const got = request.cookies.get(ADMIN_DEMO_COOKIE)?.value ?? "";
  if (!expected || got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

/** Admin access: an account with role 'admin' (or in ADMIN_EMAILS), or the hackathon demo cookie. */
export async function getAdminAccess(request: NextRequest): Promise<{ admin: boolean; via: "role" | "demo" | null; user: RequestUser | null }> {
  const user = await getRequestUser(request);
  if (user && (await getRole(user)) === "admin") return { admin: true, via: "role", user };
  if (hasDemoCookie(request)) return { admin: true, via: "demo", user };
  return { admin: false, via: null, user };
}
