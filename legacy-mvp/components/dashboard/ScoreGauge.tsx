import type { ScoreStatus } from "@/types/scoring";
import { formatPoints } from "@/lib/format";

export const STATUS_STYLE: Record<ScoreStatus, { color: string; range: string; blurb: string }> = {
  "Bank-Ready": { color: "var(--status-positive)", range: "80-100", blurb: "Dosar solid, gata de depus la bancă." },
  "Pregătit cu rezerve": { color: "var(--accent-stone)", range: "60-79", blurb: "Eligibil, cu câteva puncte de clarificat." },
  "Necesită optimizare": { color: "var(--badge-amber)", range: "40-59", blurb: "Recomandăm optimizări înainte de aplicare." },
  "High Risk": { color: "var(--status-negative)", range: "0-39", blurb: "Risc ridicat — aplicarea acum nu e recomandată." },
};

const R = 100;
const ARC = Math.PI * R;
/** Point on the semicircle for a 0-100 value (0 = left, 100 = right). */
const pointAt = (v: number, r = R) => {
  const a = Math.PI * (1 - v / 100);
  return { x: 120 + r * Math.cos(a), y: 120 - r * Math.sin(a) };
};

export function ScoreGauge({ score, status }: { score: number; status: ScoreStatus }) {
  const { color } = STATUS_STYLE[status];
  const filled = (Math.max(0, Math.min(100, score)) / 100) * ARC;
  const path = `M 20 120 A ${R} ${R} 0 0 1 220 120`;

  return (
    <svg viewBox="0 0 240 140" className="w-full max-w-[340px]" role="img" aria-label={`Scor final ${score} din 100, ${status}`}>
      <defs>
        <linearGradient id="gaugeFill" x1="0" x2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.55" />
          <stop offset="100%" stopColor={color} />
        </linearGradient>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3.5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* pressed track: dark groove + highlight edge */}
      <path d={path} fill="none" stroke="rgba(3,8,18,.85)" strokeWidth="24" strokeLinecap="round" />
      <path d={path} fill="none" stroke="#111a2b" strokeWidth="19" strokeLinecap="round" transform="translate(1.2 1.6)" />

      {/* threshold ticks 40 / 60 / 80 */}
      {[40, 60, 80].map((t) => {
        const a = pointAt(t, R - 17);
        const b = pointAt(t, R - 23);
        return <line key={t} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--text-muted)" strokeWidth="1.5" opacity=".6" />;
      })}

      <path
        d={path}
        fill="none"
        stroke="url(#gaugeFill)"
        strokeWidth="14"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${ARC}`}
        filter="url(#glow)"
        style={{ transition: "stroke-dasharray 900ms cubic-bezier(.2,.7,.2,1)" }}
      />

      <text x="120" y="108" textAnchor="middle" className="font-mono" fontSize="46" fontWeight="700" fill="var(--text-primary)">
        {formatPoints(score)}
      </text>
      <text x="120" y="130" textAnchor="middle" fontSize="11" fill="var(--text-muted)" letterSpacing="2">
        DIN 100
      </text>
    </svg>
  );
}
