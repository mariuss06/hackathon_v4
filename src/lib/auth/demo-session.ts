/**
 * Instant Demo Login — a simulated session that lives only in this browser (localStorage).
 *
 * It never creates a Supabase user and never sends a token: `apiFetch` adds no Authorization header,
 * so every API route treats a demo visitor exactly like guest mode (no 401, no redirect loop).
 * Signing in with a real account clears it (see AuthProvider).
 */

export interface DemoSession {
  id: "demo-user";
  email: string;
  fullName: string;
  startedAt: string;
}

const KEY = "credifit-demo-session";
const listeners = new Set<() => void>();

// useSyncExternalStore needs a stable snapshot: re-parse only when the stored string changes.
let cachedRaw: string | null = null;
let cached: DemoSession | null = null;

export function readDemoSession(): DemoSession | null {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    raw = null;
  }
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  try {
    const p = raw ? (JSON.parse(raw) as Partial<DemoSession>) : null;
    cached = p && p.id === "demo-user" && typeof p.email === "string" ? (p as DemoSession) : null;
  } catch {
    cached = null;
  }
  return cached;
}

export function subscribeDemoSession(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => e.key === KEY && cb();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

function write(value: DemoSession | null) {
  try {
    if (value) window.localStorage.setItem(KEY, JSON.stringify(value));
    else window.localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: the demo session cannot persist */
  }
  listeners.forEach((l) => l());
}

export function startDemoSession(): DemoSession {
  const s: DemoSession = { id: "demo-user", email: "demo@credifit.ro", fullName: "CrediFit Demo", startedAt: new Date().toISOString() };
  write(s);
  return s;
}

export function clearDemoSession() {
  if (typeof window !== "undefined") write(null);
}
