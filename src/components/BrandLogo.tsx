import { cx } from "./ui";
import { BrandTagline } from "./BrandTagline";

/** CrediFit brand colours (from the logo artwork): deep navy + growth green. */
const NAVY = "#1B3A63";
const GREEN = "#34B44A";

/**
 * CrediFit mark: a shield with three rising bars (growth / credit score) and a green check
 * (the "fit" verdict). Pure SVG, scales from favicon to print, works on light backgrounds.
 */
export function BrandIcon({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden className={className}>
      {/* Shield outline */}
      <path d="M16 2.9 27 7.3v8.1c0 6.7-4.5 11.6-11 13.7C9.5 27 5 22.1 5 15.4V7.3L16 2.9Z" stroke={NAVY} strokeWidth="2.1" strokeLinejoin="round" />
      {/* Rising bars */}
      <rect x="10.1" y="17.6" width="2.7" height="4.6" rx=".6" fill={NAVY} />
      <rect x="14.6" y="14.9" width="2.7" height="7.3" rx=".6" fill={NAVY} />
      <rect x="19.1" y="12.2" width="2.7" height="10" rx=".6" fill={NAVY} />
      {/* Check */}
      <path d="M8.9 19.2 12.1 22.4 22.4 12.1" stroke={GREEN} strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function BrandLogo({ size = "md", className, tagline = false }: { size?: "sm" | "md" | "lg"; className?: string; tagline?: boolean }) {
  const icon = size === "lg" ? 40 : size === "sm" ? 22 : 28;
  const word = size === "lg" ? "text-2xl" : size === "sm" ? "text-[13px]" : "text-[15px]";
  return (
    <span className={cx("inline-flex shrink-0 items-center gap-2.5", className)}>
      <BrandIcon size={icon} />
      <span className="leading-none">
        <span className={cx("block tracking-tight", word)}>
          <span className="font-semibold" style={{ color: NAVY }}>
            Credi
          </span>
          <span className="font-semibold" style={{ color: GREEN }}>
            Fit
          </span>
        </span>
        {tagline && <BrandTagline />}
      </span>
    </span>
  );
}
