/**
 * Public base URL of the deployment, without a trailing slash. Never hard-coded to localhost:
 *   1. NEXT_PUBLIC_SITE_URL           — set it in production (e.g. https://credifit.ro)
 *   2. VERCEL_PROJECT_PRODUCTION_URL  — Vercel production domain (no protocol)
 *   3. VERCEL_URL                     — Vercel preview deployment (no protocol)
 *   4. `origin` of the current request (works on any host: Netlify, Railway, local dev)
 * Client code should simply use relative paths ("/api/...").
 */
export function siteUrl(origin?: string): string {
  const withProtocol = (host: string) => (/^https?:\/\//i.test(host) ? host : `https://${host}`);
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || "";
  const base = fromEnv ? withProtocol(fromEnv.trim()) : (origin ?? "");
  return base.replace(/\/+$/, "");
}
