"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { formatNumber, parseRonInput } from "@/lib/format";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={cx("neu-raised rounded-[28px] p-5 sm:p-7", className)}>{children}</section>;
}

export function Well({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("neu-pressed rounded-2xl", className)}>{children}</div>;
}

export function NeuButton({
  variant = "primary",
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  return (
    <button
      {...rest}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold tracking-wide transition-all duration-200",
        "active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45",
        variant === "primary" && "btn-primary hover:brightness-110",
        variant === "ghost" && "neu-raised-sm text-ink/90 hover:text-ink active:neu-pressed-sm",
        variant === "danger" && "neu-raised-sm text-scarlet hover:brightness-125",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Selectable option rendered as an extruded tile that sinks when chosen. */
export function ChoiceTile({
  selected,
  onClick,
  children,
  className,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cx(
        "relative rounded-2xl px-4 py-3 text-left text-sm font-semibold transition-all duration-200",
        selected
          ? "neu-pressed text-stone ring-2 ring-stone/70"
          : "neu-raised-sm text-ink/85 hover:-translate-y-0.5 hover:text-ink",
        className,
      )}
    >
      {selected && (
        <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-stone shadow-[0_0_10px_var(--accent-stone)]" />
      )}
      {children}
    </button>
  );
}

export function MoneyInput({
  value,
  onChange,
  placeholder,
  id,
  autoFocus,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
  id?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="neu-pressed flex items-center rounded-2xl px-4 focus-within:ring-1 focus-within:ring-stone/60">
      <input
        id={id}
        autoFocus={autoFocus}
        inputMode="numeric"
        autoComplete="off"
        className="w-full bg-transparent py-3.5 font-mono text-lg text-ink placeholder:text-muted/50 focus:outline-none"
        placeholder={placeholder}
        value={value === null ? "" : formatNumber(value)}
        onChange={(e) => onChange(parseRonInput(e.target.value))}
      />
      <span className="ml-3 text-xs font-bold tracking-widest text-muted">RON</span>
    </div>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  id,
  icon,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  id?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="neu-pressed flex items-center gap-3 rounded-2xl px-4 focus-within:ring-1 focus-within:ring-stone/60">
      {icon && <span className="text-muted">{icon}</span>}
      <input
        id={id}
        className="w-full bg-transparent py-3.5 text-base text-ink placeholder:text-muted/50 focus:outline-none"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function QuestionHeader({
  index,
  title,
  hint,
  htmlFor,
}: {
  index: number;
  title: string;
  hint?: string;
  htmlFor?: string;
}) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <span className="neu-raised-sm grid h-9 w-9 shrink-0 place-items-center rounded-xl font-mono text-sm font-bold text-stone">
        {index}
      </span>
      <div className="flex-1">
        <label htmlFor={htmlFor} className="block text-[15px] font-bold leading-snug text-ink">
          {title}
        </label>
        {hint && <p className="mt-0.5 text-[13px] text-muted">{hint}</p>}
      </div>
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="neu-pressed relative h-8 w-14 shrink-0 rounded-full transition-colors"
    >
      <span
        className={cx(
          "absolute top-1 h-6 w-6 rounded-full transition-all duration-300",
          checked
            ? "left-7 bg-amber shadow-[0_0_12px_rgba(245,158,11,.55)]"
            : "neu-raised-sm left-1",
        )}
      />
    </button>
  );
}

/** Pressed track with a glowing fill. */
export function Meter({
  value,
  max,
  color = "var(--accent-stone)",
  className,
}: {
  value: number;
  max: number;
  color?: string;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={cx("neu-pressed-sm h-3 overflow-hidden rounded-full p-[3px]", className)}>
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{
          width: `${pct}%`,
          background: `linear-gradient(90deg, color-mix(in srgb, ${color} 55%, transparent), ${color})`,
          boxShadow: `0 0 10px color-mix(in srgb, ${color} 60%, transparent)`,
        }}
      />
    </div>
  );
}
