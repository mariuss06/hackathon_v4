import type { QuestionFeedback } from "@/types/scoring";
import { cx } from "@/components/ui/neu";

function badgeColor(points: number, max: number) {
  if (points >= max) return "text-positive";
  if (points > 0) return "text-amber";
  return "text-scarlet";
}

export function FeedbackList({ items }: { items: QuestionFeedback[] }) {
  return (
    <ul className="space-y-3">
      {items.map((it, i) => (
        <li key={it.id} className="neu-pressed flex gap-4 rounded-2xl p-4">
          <span className="neu-raised-sm grid h-8 w-8 shrink-0 place-items-center rounded-lg font-mono text-xs font-bold text-muted">
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold leading-snug">{it.question}</p>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
              <span className="text-muted">
                Tu: <span className="font-semibold text-ink">{it.userAnswer}</span>
              </span>
              <span className="text-muted">
                Referință: <span className="font-semibold text-stone">{it.truthAnswer}</span>
              </span>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">{it.detail}</p>
          </div>
          <div className="shrink-0 text-right">
            <span className={cx("font-mono text-lg font-bold", badgeColor(it.points, it.maxPoints))}>
              +{it.points}p
            </span>
            <span className="block font-mono text-[10px] text-muted">din {it.maxPoints}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
