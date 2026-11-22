/**
 * Phrase translation for texts that live inline in components and in the scoring engine.
 *
 *   tr("Verifică acum")                        → "Check now" in English
 *   tr("{n} dosare pe numele exact", { n: 3 })  → placeholders filled in both languages
 *
 * The Romanian text is the key and the fallback: a phrase missing from PHRASES_EN simply stays
 * Romanian. The language is module-level (like the number locale in lib/util): Romanian on the
 * server, in tests and API routes; the client `useLanguage()` hook switches it for the components it renders.
 * Pass already formatted numbers (num(), ron()) in `vars`.
 *
 * Texts generated earlier in Romanian (e.g. the portal.just.ro classification done on the server and kept
 * in the browser) still translate: `tr(alreadyFilledText)` matches it against the templates with
 * placeholders and translates the captured values too when they are known phrases.
 */
import { PHRASES_EN } from "./phrases-en.ts";

export type TrLang = "ro" | "en";
let current: TrLang = "ro";

export const setTrLang = (l: TrLang) => {
  current = l;
};
export const getTrLang = () => current;

const fill = (s: string, vars?: Record<string, string | number>) =>
  vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;

/** Templates with placeholders, compiled once on the first miss: [regex, placeholder names, English]. */
let patterns: [RegExp, string[], string][] | null = null;
function compiled() {
  if (patterns) return patterns;
  patterns = [];
  for (const [ro, en] of Object.entries(PHRASES_EN)) {
    if (!/\{\w+\}/.test(ro)) continue;
    const names: string[] = [];
    const body = ro
      .split(/(\{\w+\})/)
      .map((part) => {
        const m = /^\{(\w+)\}$/.exec(part);
        if (m) {
          names.push(m[1]);
          return "([\\s\\S]+?)";
        }
        return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      })
      .join("");
    patterns.push([new RegExp(`^${body}$`), names, en]);
  }
  // Longer (more specific) templates first.
  patterns.sort((a, b) => b[0].source.length - a[0].source.length);
  return patterns;
}

const cache = new Map<string, string>();

/** English for an already-filled Romanian text, via the templates; null when nothing matches. */
function matchTemplate(text: string): string | null {
  if (cache.has(text)) return cache.get(text)!;
  let out: string | null = null;
  for (const [re, names, en] of compiled()) {
    const m = re.exec(text);
    if (!m) continue;
    const vars: Record<string, string> = {};
    names.forEach((n, i) => {
      const v = m[i + 1];
      vars[n] = PHRASES_EN[v] ?? (v !== text ? matchTemplate(v) : null) ?? v;
    });
    out = fill(en, vars);
    break;
  }
  if (cache.size > 2000) cache.clear();
  cache.set(text, out ?? text);
  return out;
}

export function tr(ro: string, vars?: Record<string, string | number>): string {
  if (current === "en") {
    const en = PHRASES_EN[ro];
    if (en !== undefined) return fill(en, vars);
    if (!vars && ro) {
      const t = matchTemplate(ro);
      if (t !== null) return t;
    }
  }
  return fill(ro, vars);
}
