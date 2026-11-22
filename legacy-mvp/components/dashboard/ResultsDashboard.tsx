"use client";

import type { ReactNode } from "react";
import {
  FileUp,
  Gavel,
  Landmark,
  LoaderCircle,
  Lock,
  Receipt,
  RotateCcw,
  ShieldAlert,
  Snowflake,
  Target,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import type {
  EFacturaGroundTruth,
  EFacturaInvoice,
  FinalScoreResult,
  InvestmentEvaluation,
  LegalCheckResult,
  QuizEvaluation,
} from "@/types/scoring";
import type { BusinessScoreBreakdown } from "@/services/businessScoreService";
import { formatDateTime, formatPct, formatPoints, formatRon } from "@/lib/format";
import { cx, Meter, NeuButton, Panel } from "@/components/ui/neu";
import { ScoreGauge, STATUS_STYLE } from "./ScoreGauge";
import { FeedbackList } from "./FeedbackList";
import { LegalCasesList } from "./LegalCasesList";

export interface UploadEvent {
  invoice: EFacturaInvoice;
  scoreDelta: number;
  businessDelta: number;
}

function PanelTitle({ icon, title, aside }: { icon: ReactNode; title: string; aside?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="neu-raised-sm grid h-10 w-10 place-items-center rounded-xl text-stone">{icon}</span>
        <h3 className="text-base font-extrabold tracking-tight">{title}</h3>
      </div>
      {aside}
    </div>
  );
}

function PillarRow({
  icon,
  label,
  weight,
  points,
  max,
  score,
  color,
  children,
}: {
  icon: ReactNode;
  label: string;
  weight: string;
  points: number;
  max: number;
  score: number;
  color: string;
  children?: ReactNode;
}) {
  return (
    <div className="neu-pressed rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-stone">{icon}</span>
          <div>
            <p className="text-sm font-bold">{label}</p>
            <p className="text-[11px] text-muted">
              pondere {weight} · scor pilon {formatPoints(score)}/100
            </p>
          </div>
        </div>
        <p className="shrink-0 whitespace-nowrap font-mono text-lg font-bold">
          {formatPoints(points)}
          <span className="text-xs text-muted"> / {max}p</span>
        </p>
      </div>
      <Meter value={points} max={max} color={color} className="mt-3" />
      {children}
    </div>
  );
}

function Banner({ tone, children }: { tone: "red" | "amber" | "blue"; children: ReactNode }) {
  const map = {
    red: "text-scarlet ring-scarlet/50",
    amber: "text-amber ring-amber/40",
    blue: "text-stone ring-stone/40",
  };
  const Icon = tone === "red" ? ShieldAlert : TriangleAlert;
  return (
    <div className={cx("neu-pressed flex items-start gap-3 rounded-2xl p-4 ring-1", map[tone])}>
      <Icon size={18} className="mt-0.5 shrink-0" />
      <p className="text-sm leading-relaxed text-ink/90">{children}</p>
    </div>
  );
}

export function ResultsDashboard({
  truth,
  final,
  business,
  frozenQuiz,
  investment,
  legal,
  legalLoading,
  lastUpload,
  onUpload,
  onRetryLegal,
  onRestart,
  debugPanel,
}: {
  truth: EFacturaGroundTruth;
  final: FinalScoreResult | null;
  business: BusinessScoreBreakdown;
  frozenQuiz: QuizEvaluation;
  investment: InvestmentEvaluation;
  legal: LegalCheckResult | null;
  legalLoading: boolean;
  lastUpload: UploadEvent | null;
  onUpload: () => void;
  onRetryLegal: () => void;
  onRestart: () => void;
  debugPanel: ReactNode;
}) {
  const uploads = truth.invoices.filter((i) => i.source === "simulated-upload").length;

  return (
    <div className="space-y-6">
      {/* ---------- Hero: gauge + pillars ---------- */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <div className="metallic animate-rise rounded-[30px] p-[2px] shadow-[12px_12px_28px_rgba(3,8,18,.7),-8px_-8px_20px_rgba(88,120,178,.18)]">
          <div className="flex h-full flex-col items-center rounded-[28px] bg-card px-6 py-7 text-center">
            <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-muted">Credit Readiness Score</p>
            {final ? (
              <>
                <ScoreGauge score={final.finalScore} status={final.status} />
                <span
                  className="neu-pressed-sm mt-1 rounded-full px-4 py-1.5 text-sm font-extrabold"
                  style={{ color: STATUS_STYLE[final.status].color }}
                >
                  {final.status} · {STATUS_STYLE[final.status].range}
                </span>
                <p className="mt-3 max-w-xs text-sm text-muted">{STATUS_STYLE[final.status].blurb}</p>
                {final.rawScore !== final.finalScore && (
                  <p className="mt-3 font-mono text-xs text-muted">
                    scor brut {formatPoints(final.rawScore)} → final {formatPoints(final.finalScore)}
                  </p>
                )}
              </>
            ) : (
              <div className="grid h-56 place-items-center text-sm text-muted">
                <span className="flex items-center gap-2">
                  <LoaderCircle className="animate-spin text-stone" size={18} /> Așteptăm portal.just.ro…
                </span>
              </div>
            )}
            <div className="mt-auto w-full pt-6">
              <div className="neu-pressed-sm flex items-center justify-between rounded-xl px-4 py-2.5 text-left text-xs">
                <span className="truncate text-muted">{truth.companyName}</span>
                <span className="ml-3 shrink-0 font-mono text-stone">CAEN {truth.caenCode}</span>
              </div>
            </div>
          </div>
        </div>

        <Panel className="animate-rise [animation-delay:60ms]">
          <PanelTitle icon={<Target size={18} />} title="Defalcare pe piloni" />
          <div className="space-y-4">
            <PillarRow
              icon={<Landmark size={18} />}
              label="S_Business · e-Factura + benchmark CAEN"
              weight="70%"
              points={final?.pillars.business.points ?? 0.7 * business.sBusiness}
              max={70}
              score={business.sBusiness}
              color="var(--accent-blue)"
            >
              <p className="mt-2 text-[11px] text-muted">
                75% metrici proprii ({formatPoints(business.ownMetrics)}) + 25% benchmark sector (
                {formatPoints(business.industryBenchmark)})
              </p>
            </PillarRow>

            <PillarRow
              icon={<UserRound size={18} />}
              label="S_Uman · Factor uman"
              weight="15%"
              points={final?.pillars.human.points ?? 0}
              max={15}
              score={final?.pillars.human.score ?? 0}
              color="var(--accent-indigo)"
            >
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="flex justify-between text-[11px] text-muted">
                    <span className="flex items-center gap-1">
                      <Snowflake size={11} /> Quiz financiar
                    </span>
                    <span className="font-mono text-ink">{formatPoints(final?.pillars.human.quizPoints ?? 0)} / 7,5</span>
                  </div>
                  <Meter value={final?.pillars.human.quizPoints ?? 0} max={7.5} color="var(--accent-indigo)" className="mt-1.5 h-2.5" />
                </div>
                <div>
                  <div className="flex justify-between text-[11px] text-muted">
                    <span className="flex items-center gap-1">
                      <Gavel size={11} /> Portal Just
                    </span>
                    <span className="font-mono text-ink">{formatPoints(final?.pillars.human.legalPoints ?? 0)} / 7,5</span>
                  </div>
                  <Meter value={final?.pillars.human.legalPoints ?? 0} max={7.5} color="var(--badge-teal)" className="mt-1.5 h-2.5" />
                </div>
              </div>
            </PillarRow>

            <PillarRow
              icon={<Receipt size={18} />}
              label="S_Investiție · Scopul finanțării"
              weight="15%"
              points={final?.pillars.investment.points ?? 0.15 * investment.total}
              max={15}
              score={investment.total}
              color="var(--accent-stone)"
            />
          </div>
        </Panel>
      </div>

      {/* ---------- Warnings ---------- */}
      {Boolean(final?.warnings.length || legal?.isFallback || legal?.isSimulated || investment.overLeveragedRequest) && (
        <div className="space-y-3">
          {final?.warnings.map((w) => (
            <Banner key={w} tone={w.startsWith("Integrity") ? "red" : "amber"}>
              {w}
            </Banner>
          ))}
          {investment.overLeveragedRequest && (
            <Banner tone="amber">
              overLeveragedRequest: suma solicitată depășește 50% din cifra de afaceri anualizată (
              {formatPct(investment.leverageRatio * 100)}). Întrebarea 3 din S_Investiție primește 0p.
            </Banner>
          )}
          {legal?.isFallback && <Banner tone="amber">{legal.message}</Banner>}
          {legal?.isSimulated && <Banner tone="blue">{legal.message}</Banner>}
        </div>
      )}

      {/* ---------- e-Factura upload simulation ---------- */}
      <Panel>
        <PanelTitle
          icon={<FileUp size={18} />}
          title="RO e-Factura · sincronizare live"
          aside={
            <span className="neu-pressed-sm inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-[11px] text-indigo">
              <Lock size={11} /> frozenQuizScore = {frozenQuiz.total}/100
            </span>
          }
        />
        <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <div className="grid grid-cols-2 gap-3">
              {[
                ["CA ultimele 3 luni", formatRon(truth.revenueLast3MonthsNoVat)],
                ["CA anualizată", formatRon(truth.annualizedRevenue)],
                ["S_Business", `${formatPoints(business.sBusiness)}/100`],
                ["Sumă cerută / CA", formatPct(investment.leverageRatio * 100)],
              ].map(([k, v]) => (
                <div key={k} className="neu-pressed-sm rounded-xl p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">{k}</p>
                  <p className="mt-1 font-mono text-sm font-bold">{v}</p>
                </div>
              ))}
            </div>
            <NeuButton onClick={onUpload} className="mt-5 w-full" disabled={!final}>
              <FileUp size={16} /> Simulează Upload XML e-Factura (+1 Factură)
            </NeuButton>
            <p className="mt-3 text-xs text-muted">
              Recalculează live S_Business și raportul sumă/CA din S_Investiție. Scorul Quiz 1 rămâne înghețat.
              {uploads > 0 && <span className="text-ink"> {uploads} facturi simulate încărcate.</span>}
            </p>
            {lastUpload && (
              <p key={lastUpload.invoice.id} className="animate-rise mt-3 font-mono text-xs text-positive">
                + {lastUpload.invoice.id} · {formatRon(lastUpload.invoice.amountNoVat)} · S_Business{" "}
                {lastUpload.businessDelta >= 0 ? "+" : ""}
                {formatPoints(lastUpload.businessDelta)} · scor final {lastUpload.scoreDelta >= 0 ? "+" : ""}
                {formatPoints(lastUpload.scoreDelta)}
              </p>
            )}
          </div>
          <ul className="space-y-2">
            {truth.invoices.slice(0, 5).map((inv) => (
              <li key={inv.id} className="neu-pressed-sm flex items-center justify-between gap-3 rounded-xl px-4 py-2.5 text-xs">
                <div className="min-w-0">
                  <p className="font-mono font-bold">
                    {inv.id}{" "}
                    {inv.source === "simulated-upload" && <span className="ml-1 text-[10px] text-positive">NOU</span>}
                  </p>
                  <p className="truncate text-muted">
                    {inv.customerName} · {inv.issueDate}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={cx("font-mono font-bold", inv.invoiceTypeCode === "381" && "text-scarlet")}>
                    {formatRon(inv.amountNoVat)}
                  </p>
                  <p className="text-[10px] text-muted">cod {inv.invoiceTypeCode}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </Panel>

      {/* ---------- Feedback ---------- */}
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel>
          <PanelTitle
            icon={<Snowflake size={18} />}
            title="Quiz 1 · Feedback comparativ"
            aside={
              <span className="font-mono text-xs text-muted">
                {frozenQuiz.total}/100 · înghețat {formatDateTime(frozenQuiz.evaluatedAt)}
              </span>
            }
          />
          <FeedbackList items={frozenQuiz.items} />
        </Panel>
        <Panel>
          <PanelTitle
            icon={<Receipt size={18} />}
            title="Quiz 2 · Scopul investiției"
            aside={<span className="font-mono text-xs text-muted">{investment.total}/100</span>}
          />
          <FeedbackList items={investment.items} />
        </Panel>
      </div>

      <Panel>
        <PanelTitle
          icon={<Gavel size={18} />}
          title="Verificare portal.just.ro · analiză pe dosare"
          aside={legal && <span className="font-mono text-xs text-muted">{legal.legalScore}/100</span>}
        />
        <LegalCasesList legal={legal} loading={legalLoading} onRetry={onRetryLegal} />
      </Panel>

      {debugPanel}

      <div className="flex justify-center pt-2">
        <NeuButton variant="ghost" onClick={onRestart}>
          <RotateCcw size={16} /> Reîncepe evaluarea
        </NeuButton>
      </div>
    </div>
  );
}
