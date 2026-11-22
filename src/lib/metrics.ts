/**
 * Business indicators computed from the e-Factura invoices of the company (Supabase + uploaded XML).
 * Pure function: same invoices in, same metrics out. Re-run on every upload.
 */
import type { BusinessMetrics, Company, Invoice, MonthPoint, PartyShare } from "../types/scoring";
import { addMonths, daysBetween, lastDayOfMonth, normCui, round1, round2 } from "./util.ts";

/** Grace period before an invoice counts as "paid late". */
export const LATE_GRACE_DAYS = 5;

export const isStorno = (inv: Invoice) => inv.typeCode === "381" || inv.taxExclusiveAmount < 0;
/** Revenue effect of a document: storno (381 or negative amount) reduces revenue. */
export const signedAmount = (inv: Invoice) =>
  isStorno(inv) ? -Math.abs(inv.taxExclusiveAmount) : Math.abs(inv.taxExclusiveAmount);

function shares(map: Map<string, { name: string; value: number }>, total: number, top = 5): PartyShare[] {
  return [...map.entries()]
    .map(([cui, v]) => ({ name: v.name, cui, value: round2(v.value), sharePct: total > 0 ? round1((v.value / total) * 100) : 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, top);
}

function weightedAvg(pairs: [value: number, weight: number][]) {
  const w = pairs.reduce((s, [, x]) => s + x, 0);
  return w > 0 ? pairs.reduce((s, [v, x]) => s + v * x, 0) / w : 0;
}

/**
 * @param today ISO date used for the window when there are no issued invoices. The browser passes it after
 * hydration ("" before), so rendering never reads the clock; server routes and tests default to now.
 */
export function computeMetrics(invoices: Invoice[], company: Company, today?: string): BusinessMetrics {
  const issued = invoices.filter((i) => i.direction === "issued");
  const received = invoices.filter((i) => i.direction === "received");

  // Window: the 12 calendar months ending with the month of the latest issued invoice.
  const latest = issued.reduce((max, i) => (i.issueDate > max ? i.issueDate : max), "0000-00-00");
  const endMonth = latest !== "0000-00-00" ? latest.slice(0, 7) : (today === undefined ? new Date().toISOString() : today || "1970-01-01").slice(0, 7);
  const startMonth = addMonths(endMonth, -11);
  const asOf = lastDayOfMonth(endMonth);
  const inWindow = (i: Invoice) => i.issueDate.slice(0, 7) >= startMonth && i.issueDate.slice(0, 7) <= endMonth;
  const last3Start = addMonths(endMonth, -2);
  const inLast3 = (i: Invoice) => i.issueDate.slice(0, 7) >= last3Start && i.issueDate.slice(0, 7) <= endMonth;

  const sales = issued.filter(inWindow);
  const buys = received.filter(inWindow);

  // --- Monthly series -------------------------------------------------------
  const fixed = company.monthlyFixedCosts + company.existingMonthlyDebtService;
  const months: MonthPoint[] = Array.from({ length: 12 }, (_, k) => {
    const month = addMonths(startMonth, k);
    const s = sales.filter((i) => i.issueDate.startsWith(month));
    const revenue = s.reduce((sum, i) => sum + signedAmount(i), 0);
    const uploadedRevenue = s.filter((i) => i.source === "xml-upload").reduce((sum, i) => sum + signedAmount(i), 0);
    const purchases = buys.filter((i) => i.issueDate.startsWith(month)).reduce((sum, i) => sum + signedAmount(i), 0);
    return {
      month,
      revenue: round2(revenue),
      uploadedRevenue: round2(uploadedRevenue),
      purchases: round2(purchases),
      netCashFlow: round2(revenue - purchases - fixed),
    };
  });

  const revenue12m = months.reduce((s, m) => s + m.revenue, 0);
  const purchases12m = months.reduce((s, m) => s + m.purchases, 0);
  const avgMonthlyRevenue = revenue12m / 12;
  const avgMonthlyPurchases = purchases12m / 12;
  const revenueLast3Months = months.slice(-3).reduce((s, m) => s + m.revenue, 0);

  // --- Stability & seasonality --------------------------------------------
  const variance = months.reduce((s, m) => s + (m.revenue - avgMonthlyRevenue) ** 2, 0) / 12;
  const revenueCv = avgMonthlyRevenue > 0 ? Math.sqrt(variance) / avgMonthlyRevenue : 1;
  const sorted = [...months].sort((a, b) => b.revenue - a.revenue);
  const peak = sorted[0];
  const trough = sorted[sorted.length - 1];
  const seasonalityRatio = trough.revenue > 0 ? peak.revenue / trough.revenue : 99;

  // --- Payment behaviour ----------------------------------------------------
  const invoicesToCollect = sales.filter((i) => !isStorno(i));
  const paidBy = (i: Invoice) => (i.paidDate && i.paidDate <= asOf ? i.paidDate : null);
  const collection: [number, number][] = [];
  let lateValue = 0;
  let dueValue = 0;
  let lateCount = 0;
  let overdueAmount = 0;
  for (const i of invoicesToCollect) {
    const amount = Math.abs(i.taxExclusiveAmount);
    const paid = paidBy(i);
    if (paid) collection.push([daysBetween(i.issueDate, paid), amount]);
    else if (i.dueDate && i.dueDate < asOf) collection.push([daysBetween(i.issueDate, asOf), amount]);

    if (!i.dueDate || i.dueDate > asOf) continue;
    dueValue += amount;
    const late = paid ? daysBetween(i.dueDate, paid) > LATE_GRACE_DAYS : daysBetween(i.dueDate, asOf) > LATE_GRACE_DAYS;
    if (late) {
      lateValue += amount;
      lateCount++;
    }
    if (!paid) overdueAmount += amount;
  }
  const avgPaymentTermDays = weightedAvg(
    invoicesToCollect.filter((i) => i.dueDate).map((i) => [daysBetween(i.issueDate, i.dueDate!), Math.abs(i.taxExclusiveAmount)]),
  );
  const dsoDays = collection.length ? weightedAvg(collection) : avgPaymentTermDays;

  // --- Concentration --------------------------------------------------------
  const byClient = new Map<string, { name: string; value: number }>();
  for (const i of sales) {
    const key = normCui(i.customerCui) || i.customerName;
    const cur = byClient.get(key) ?? { name: i.customerName, value: 0 };
    cur.value += signedAmount(i);
    byClient.set(key, cur);
  }
  const topClients = shares(byClient, revenue12m);

  const bySupplier = new Map<string, { name: string; value: number }>();
  for (const i of buys) {
    const key = normCui(i.supplierCui) || i.supplierName;
    const cur = bySupplier.get(key) ?? { name: i.supplierName, value: 0 };
    cur.value += signedAmount(i);
    bySupplier.set(key, cur);
  }
  const topSuppliers = shares(bySupplier, purchases12m);

  // --- Storno ---------------------------------------------------------------
  const stornoShare = (list: Invoice[]) => {
    const gross = list.filter((i) => !isStorno(i)).reduce((s, i) => s + Math.abs(i.taxExclusiveAmount), 0);
    const storno = list.filter(isStorno).reduce((s, i) => s + Math.abs(i.taxExclusiveAmount), 0);
    return gross > 0 ? (storno / gross) * 100 : 0;
  };

  const operatingCashFlow = avgMonthlyRevenue - avgMonthlyPurchases - company.monthlyFixedCosts;

  return {
    months,
    asOf,
    revenue12m: round2(revenue12m),
    revenueLast3Months: round2(revenueLast3Months),
    annualizedRevenue: round2(avgMonthlyRevenue * 12),
    avgMonthlyRevenue: round2(avgMonthlyRevenue),
    avgMonthlyPurchases: round2(avgMonthlyPurchases),
    revenueCv: Math.round(revenueCv * 1000) / 1000,
    seasonalityRatio: round2(seasonalityRatio),
    peakMonth: peak.month,
    troughMonth: trough.month,
    dsoDays: round1(dsoDays),
    avgPaymentTermDays: round1(avgPaymentTermDays),
    lateSharePct: dueValue > 0 ? round1((lateValue / dueValue) * 100) : 0,
    lateCount,
    overdueAmount: round2(overdueAmount),
    topClients,
    topClientSharePct: topClients[0]?.sharePct ?? 0,
    topSuppliers,
    creditNotesSharePct3m: round2(stornoShare(sales.filter(inLast3))),
    creditNotesSharePct12m: round2(stornoShare(sales)),
    grossMarginPct: revenue12m > 0 ? round1(((revenue12m - purchases12m) / revenue12m) * 100) : 0,
    operatingCashFlow: round2(operatingCashFlow),
    avgMonthlyNetCashFlow: round2(operatingCashFlow - company.existingMonthlyDebtService),
    issuedCount: sales.length,
    receivedCount: buys.length,
    uploadedCount: invoices.filter((i) => i.source === "xml-upload").length,
  };
}
