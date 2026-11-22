import type { ButtonHTMLAttributes, ReactNode } from "react";
import { tr } from "@/lib/i18n/tr";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function Card({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cx("rounded-[24px] border border-white/80 bg-card p-5 shadow-card backdrop-blur-xl sm:p-7", className)}>
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  subtitle,
  icon,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        {icon && <span className="mt-px shrink-0 text-faint [&_svg]:h-[17px] [&_svg]:w-[17px]">{icon}</span>}
        <div className="min-w-0">
          <h2 className="text-base font-medium leading-tight tracking-tight text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs leading-relaxed text-muted">{subtitle}</p>}
        </div>
      </div>
      {action}
    </header>
  );
}

type Tone = "neutral" | "navy" | "emerald" | "amber" | "red" | "blue";

const TONE: Record<Tone, string> = {
  neutral: "bg-navy-soft/70 text-muted border-transparent",
  navy: "bg-navy-soft text-navy-3 border-transparent",
  emerald: "bg-emerald-soft text-emerald-strong border-transparent",
  amber: "bg-amber-soft text-amber border-transparent",
  red: "bg-red-soft text-red border-transparent",
  blue: "bg-blue-soft text-blue border-transparent",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium", TONE[tone], className)}>
      {children}
    </span>
  );
}

type Variant = "primary" | "emerald" | "secondary" | "ghost";

const VARIANT: Record<Variant, string> = {
  primary: "bg-navy text-white hover:bg-navy-2",
  emerald: "bg-navy text-white hover:bg-navy-2",
  secondary: "bg-white/80 text-ink border border-line hover:border-line-strong hover:bg-white",
  ghost: "text-muted hover:text-ink hover:bg-white/70",
};

export function Button({
  variant = "primary",
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function scoreTone(score: number): Tone {
  if (score >= 75) return "emerald";
  if (score >= 55) return "blue";
  if (score >= 40) return "amber";
  return "red";
}

export const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-muted",
  navy: "text-navy-3",
  emerald: "text-emerald-strong",
  amber: "text-amber",
  red: "text-red",
  blue: "text-blue",
};

export const TONE_BAR: Record<Tone, string> = {
  neutral: "bg-faint",
  navy: "bg-navy-3",
  emerald: "bg-emerald",
  amber: "bg-amber",
  red: "bg-red",
  blue: "bg-blue",
};

export function ProgressBar({ value, tone, className }: { value: number; tone?: Tone; className?: string }) {
  const t = tone ?? scoreTone(value);
  return (
    <div className={cx("h-1.5 w-full overflow-hidden rounded-full bg-navy-soft", className)}>
      <div className={cx("h-full rounded-full transition-[width] duration-500", TONE_BAR[t])} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone,
  highlight,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  highlight?: boolean;
}) {
  return (
    <div className={cx("rounded-2xl border border-line/70 bg-white/60 p-4", highlight && "animate-flash")}>
      <p className="text-xs text-muted">{label}</p>
      <p className={cx("mt-1.5 text-2xl font-normal tracking-tight", tone ? TONE_TEXT[tone] : "text-ink")}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** Segmented single-choice control. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  name,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  name: string;
}) {
  return (
    <div role="radiogroup" aria-label={name} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cx(
              "rounded-full border px-3 py-2.5 text-sm font-medium transition-colors",
              active ? "border-navy bg-navy text-white" : "border-line bg-white/80 text-ink hover:border-line-strong",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full rounded-xl border border-line bg-white/80 px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-navy-3 focus:bg-white focus:ring-4 focus:ring-navy-soft";

export function Disclaimer({ className }: { className?: string }) {
  return (
    <p className={cx("rounded-2xl border border-line/70 px-4 py-3 text-[11px] leading-relaxed text-muted", className)}>
      <strong className="font-medium text-ink">{tr("Ghid de pregătire, nu aprobare bancară.")}</strong>{" "}
      {tr("Scorul „Credit Readiness” CrediFit este calculat pe facturile e-Factura încărcate și pe surse oficiale (ANAF, bilanț, VIES, ONRC, portal.just.ro), cu o formulă publică (vezi „Cum calculăm”). Nu reprezintă o ofertă, o decizie de creditare sau o evaluare de risc a unei bănci.")}
    </p>
  );
}
