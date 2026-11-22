import { Check } from "lucide-react";
import { cx } from "@/components/ui/neu";

const STEPS = ["Firmă & CEO", "Cunoaștere financiară", "Scopul investiției", "Rezultate"];

export function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-2 sm:gap-3" aria-label="Pași evaluare">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex flex-1 items-center gap-2 sm:gap-3 last:flex-none">
            <div className="flex items-center gap-2.5">
              <span
                aria-current={active ? "step" : undefined}
                className={cx(
                  "grid h-9 w-9 shrink-0 place-items-center rounded-full font-mono text-sm font-bold transition-all duration-300",
                  active && "neu-pressed text-stone ring-1 ring-stone/60",
                  done && "btn-primary",
                  !active && !done && "neu-raised-sm text-muted",
                )}
              >
                {done ? <Check size={16} strokeWidth={3} /> : i + 1}
              </span>
              <span
                className={cx(
                  "hidden text-[13px] font-semibold md:block",
                  active ? "text-ink" : "text-muted",
                )}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <span className="neu-pressed-sm h-1.5 flex-1 overflow-hidden rounded-full">
                <span
                  className="block h-full rounded-full bg-stone transition-[width] duration-500"
                  style={{ width: done ? "100%" : "0%" }}
                />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
