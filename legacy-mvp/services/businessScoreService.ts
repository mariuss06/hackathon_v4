import type { EFacturaGroundTruth, SBusinessMock } from "@/types/scoring";
import { round1 } from "@/lib/scoringEngine";

export interface BusinessScoreBreakdown {
  /** 0-100 own e-Factura metrics (incl. momentum from new invoices). */
  ownMetrics: number;
  /** 0-100 CAEN sector benchmark. */
  industryBenchmark: number;
  /** Points added to ownMetrics by invoices uploaded after the baseline sync. */
  momentumAdjustment: number;
  /** Final S_Business 0-100 = 75% own + 25% benchmark. */
  sBusiness: number;
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/**
 * S_Business placeholder engine.
 *
 * TODO: Replace with the full S_Business engine:
 *  - 75% own metrics computed from parsed UBL 2.1 invoices (growth, seasonality,
 *    client concentration, DSO, storno rate, supplier dependency...)
 *  - 25% benchmark against the CAEN sector (percentile of each metric).
 */
export function computeBusinessScore(
  truth: EFacturaGroundTruth,
  mock: SBusinessMock,
): BusinessScoreBreakdown {
  const uploaded = truth.invoices
    .filter((i) => i.source === "simulated-upload")
    .reduce((s, i) => s + i.amountNoVat, 0);
  const baseline = truth.revenueLast3MonthsNoVat - uploaded;
  // +1 point on own metrics for every +2% revenue momentum, capped at +/-10.
  const momentumAdjustment =
    baseline > 0 ? round1(clamp((uploaded / baseline) * 100 * 0.5, -10, 10)) : 0;

  const ownMetrics = clamp(mock.ownMetricsScore + momentumAdjustment, 0, 100);
  const industryBenchmark = clamp(mock.industryBenchmarkScore, 0, 100);

  return {
    ownMetrics: round1(ownMetrics),
    industryBenchmark: round1(industryBenchmark),
    momentumAdjustment,
    sBusiness: round1(0.75 * ownMetrics + 0.25 * industryBenchmark),
  };
}
