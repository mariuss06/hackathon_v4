/**
 * TEST FIXTURES ONLY — never imported by the app, the API routes or the database seed.
 * Deterministic synthetic e-Factura history (12 months) for a FICTIONAL Romanian SME, used by
 * the unit tests (src/lib/*.test.ts) to exercise the scoring formulas on a known dataset.
 * Every company name and CUI below is invented.
 */
import type { Company, Dataset, Invoice } from "../../types/scoring";
import { invoiceKey } from "../company.ts";
import { hashString, normalizeCompanyName } from "../company.ts";

/** "Nord Fresh Distribuție SRL" → "NFD": invoice number prefix of the fixture data. */
function companyInitials(name: string) {
  const words = normalizeCompanyName(name).toUpperCase().split(" ").filter(Boolean);
  return (words.map((w) => w[0]).join("").slice(0, 4) || "IMM").replace(/[^A-Z0-9]/g, "X");
}
import { addDays, addMonths, daysInMonth, round2 } from "../util.ts";

export const DEMO_COMPANY: Company = {
  id: "00000000-0000-4000-8000-000000004639",
  name: "Nord Fresh Distribuție SRL",
  cui: "RO45127893",
  caenCode: "4639",
  ceoName: "Tudor-Matei Ciorogaru",
  city: "Brașov",
  monthlyFixedCosts: 62_000,
  existingMonthlyDebtService: 30_000,
  financialsDeclared: true,
  createdAt: "2026-11-01T00:00:00.000Z",
};

/** First month of the synthetic window; 12 months: Nov 2025 - Oct 2026. */
export const SYNTHETIC_START = "2025-11";
export const SYNTHETIC_AS_OF = "2026-10-31";

/** Food distribution to HoReCa + retail: December and summer peaks, January-February trough. */
const SEASONALITY = [1.0, 1.32, 0.74, 0.8, 0.92, 1.0, 1.06, 1.12, 1.22, 1.18, 1.02, 0.98];
const BASE_MONTHLY_REVENUE = 700_000;
const VAT_FOOD = 0.11;
const VAT_STANDARD = 0.21;

interface ClientProfile {
  name: string;
  cui: string;
  weight: number;
  termDays: number;
  /** Average days paid after due date, and spread. */
  delay: [number, number];
  perMonth: number;
}

const CLIENTS: ClientProfile[] = [
  { name: "Mega Retail Network SRL", cui: "RO31874520", weight: 0.27, termDays: 45, delay: [4, 5], perMonth: 4 },
  { name: "Hotel Carpați Resort SRL", cui: "RO28411937", weight: 0.13, termDays: 30, delay: [2, 4], perMonth: 3 },
  { name: "Bistro Central Group SRL", cui: "RO36620185", weight: 0.1, termDays: 15, delay: [3, 4], perMonth: 4 },
  { name: "Market Plus Express SRL", cui: "RO33017462", weight: 0.09, termDays: 30, delay: [1, 3], perMonth: 3 },
  { name: "Casa Bunicii HoReCa SRL", cui: "RO40128856", weight: 0.08, termDays: 15, delay: [0, 3], perMonth: 3 },
  { name: "Alpin Catering SRL", cui: "RO38790214", weight: 0.07, termDays: 30, delay: [24, 10], perMonth: 2 },
  { name: "Pensiunea Valea Verde SRL", cui: "RO42251097", weight: 0.06, termDays: 15, delay: [3, 4], perMonth: 2 },
  { name: "Gusturi Urbane SRL", cui: "RO39904471", weight: 0.055, termDays: 30, delay: [4, 6], perMonth: 2 },
  { name: "Minimarket La Colț SRL", cui: "RO41563308", weight: 0.045, termDays: 7, delay: [1, 2], perMonth: 3 },
  { name: "Restaurant Dunărea SRL", cui: "RO35287640", weight: 0.04, termDays: 15, delay: [2, 4], perMonth: 2 },
  { name: "Cafe Aroma Network SRL", cui: "RO37712093", weight: 0.035, termDays: 30, delay: [2, 3], perMonth: 2 },
  { name: "Patiseria Dulce Vis SRL", cui: "RO43380516", weight: 0.025, termDays: 7, delay: [0, 2], perMonth: 2 },
];

interface SupplierProfile {
  name: string;
  cui: string;
  prefix: string;
  weight: number;
  vat: number;
}

const SUPPLIERS: SupplierProfile[] = [
  { name: "Agroalim Distribuție SA", cui: "RO14420587", prefix: "AGR", weight: 0.3, vat: VAT_FOOD },
  { name: "Lactate Transilvania SRL", cui: "RO22378105", prefix: "LTR", weight: 0.22, vat: VAT_FOOD },
  { name: "Carne Premium Prod SRL", cui: "RO29047712", prefix: "CPP", weight: 0.16, vat: VAT_FOOD },
  { name: "Băuturi Unite Distribuție SRL", cui: "RO25510348", prefix: "BUD", weight: 0.12, vat: VAT_STANDARD },
  { name: "Panifcom Brașov SA", cui: "RO11284460", prefix: "PNF", weight: 0.08, vat: VAT_FOOD },
  { name: "Fructe & Legume Bărăgan SRL", cui: "RO34159921", prefix: "FLB", weight: 0.06, vat: VAT_FOOD },
  { name: "Ambalaje Eco Pack SRL", cui: "RO30876254", prefix: "AEP", weight: 0.04, vat: VAT_STANDARD },
  { name: "Logistic Frig Transport SRL", cui: "RO27765039", prefix: "LFT", weight: 0.02, vat: VAT_STANDARD },
];

/** Purchases (cost of goods) as a share of sales. */
const COGS_RATIO = 0.78;

/** mulberry32 — tiny deterministic PRNG. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Splits `total` into `n` positive parts with some randomness. */
function split(total: number, n: number, rnd: () => number) {
  const w = Array.from({ length: n }, () => 0.7 + rnd() * 0.6);
  const s = w.reduce((a, b) => a + b, 0);
  return w.map((x) => round2((total * x) / s));
}

function issueDay(month: string, k: number, n: number, rnd: () => number) {
  const days = daysInMonth(month);
  const day = Math.min(days, 1 + Math.floor(((k + rnd()) * days) / n));
  return `${month}-${String(day).padStart(2, "0")}`;
}

/** Knobs of the generator. The demo company uses DEMO_OPTIONS (output unchanged since v1). */
export interface SyntheticOptions {
  seed: number;
  /** Multiplier on BASE_MONTHLY_REVENUE (700k RON). */
  scale: number;
  /** Invoice number prefix, e.g. "NFD" → NFD-2026-0001. */
  prefix: string;
  /** Weight of the biggest client (the others are rescaled); undefined = demo weights. */
  topClientWeight?: number;
}

export const DEMO_OPTIONS: SyntheticOptions = { seed: 4639, scale: 1, prefix: "NFD" };

/**
 * Deterministic profile of a NEW company, derived from its id: revenue size (≈105k-945k RON / month),
 * client concentration (15-40%) and matching fixed costs / existing debt. Same id → same history,
 * so the browser (local mode) and the API (Supabase seeding) generate identical invoices.
 */
export function syntheticProfile(company: Pick<Company, "id" | "name">) {
  if (company.id === DEMO_COMPANY.id) {
    return { options: DEMO_OPTIONS, monthlyFixedCosts: DEMO_COMPANY.monthlyFixedCosts, existingMonthlyDebtService: DEMO_COMPANY.existingMonthlyDebtService };
  }
  const h = hashString(company.id);
  const scale = 0.15 + ((h % 1000) / 1000) * 1.2;
  const topClientWeight = 0.15 + ((h >>> 10) % 26) / 100;
  const debtFactor = 0.3 + ((h >>> 16) % 100) / 100; // 0.3-1.3 × the demo debt, scaled
  const options: SyntheticOptions = { seed: h % 2_147_483_647, scale, prefix: companyInitials(company.name), topClientWeight };
  return {
    options,
    monthlyFixedCosts: Math.round((62_000 * scale) / 100) * 100,
    existingMonthlyDebtService: Math.round((30_000 * scale * debtFactor) / 100) * 100,
  };
}

function clientsFor(opts: SyntheticOptions): ClientProfile[] {
  if (opts.topClientWeight === undefined) return CLIENTS;
  const top = opts.topClientWeight;
  const restOld = 1 - CLIENTS[0].weight;
  return CLIENTS.map((c, i) => ({ ...c, weight: i === 0 ? top : (c.weight * (1 - top)) / restOld }));
}

export function generateSyntheticInvoices(company: Company = DEMO_COMPANY, opts: SyntheticOptions = DEMO_OPTIONS): Invoice[] {
  const rnd = prng(opts.seed);
  const invoices: Invoice[] = [];
  let seq = 0;
  const nextNumber = (date: string) => `${opts.prefix}-${date.slice(0, 4)}-${String(++seq).padStart(4, "0")}`;
  const clients = clientsFor(opts);

  for (let m = 0; m < 12; m++) {
    const month = addMonths(SYNTHETIC_START, m);
    const monthRevenue = BASE_MONTHLY_REVENUE * opts.scale * SEASONALITY[m];

    // --- Sales (issued) ---------------------------------------------------
    const issuedThisMonth: Invoice[] = [];
    for (const c of clients) {
      const clientTotal = monthRevenue * c.weight * (0.94 + rnd() * 0.12);
      split(clientTotal, c.perMonth, rnd).forEach((amount, k) => {
        const issueDate = issueDay(month, k, c.perMonth, rnd);
        const dueDate = addDays(issueDate, c.termDays);
        const delay = Math.round(c.delay[0] + (rnd() * 2 - 1) * c.delay[1]);
        let paidDate: string | null = addDays(dueDate, Math.max(delay, 1 - c.termDays));
        if (paidDate > SYNTHETIC_AS_OF) paidDate = null;
        // Alpin Catering stopped paying in September: overdue receivables at the analysis date.
        if (c.name.startsWith("Alpin") && month >= "2026-09") paidDate = null;
        issuedThisMonth.push({
          id: "",
          number: nextNumber(issueDate),
          direction: "issued",
          typeCode: "380",
          issueDate,
          dueDate,
          supplierName: company.name,
          supplierCui: company.cui,
          customerName: c.name,
          customerCui: c.cui,
          taxExclusiveAmount: amount,
          payableAmount: round2(amount * (1 + VAT_FOOD)),
          currency: "RON",
          paidDate,
          source: "synthetic",
        });
      });
    }
    invoices.push(...issuedThisMonth);

    // --- Credit notes (storno, 381): ~2.6-3.8% of monthly sales -------------
    const notes = 2 + Math.floor(rnd() * 2);
    const stornoTotal = monthRevenue * (0.026 + rnd() * 0.012);
    split(stornoTotal, notes, rnd).forEach((amount, k) => {
      const ref = issuedThisMonth[Math.floor(rnd() * issuedThisMonth.length)];
      const issueDate = issueDay(month, k, notes, rnd);
      invoices.push({
        ...ref,
        number: nextNumber(issueDate),
        typeCode: "381",
        issueDate,
        dueDate: null,
        taxExclusiveAmount: amount,
        payableAmount: round2(amount * (1 + VAT_FOOD)),
        paidDate: null,
      });
    });

    // --- Purchases (received) ----------------------------------------------
    for (const s of SUPPLIERS) {
      const supplierTotal = monthRevenue * COGS_RATIO * s.weight * (0.95 + rnd() * 0.1);
      split(supplierTotal, 2, rnd).forEach((amount, k) => {
        const issueDate = issueDay(month, k, 2, rnd);
        const dueDate = addDays(issueDate, 30);
        invoices.push({
          id: "",
          number: `${s.prefix}${issueDate.slice(2, 4)}${String(m * 2 + k + 1).padStart(4, "0")}`,
          direction: "received",
          typeCode: "380",
          issueDate,
          dueDate,
          supplierName: s.name,
          supplierCui: s.cui,
          customerName: company.name,
          customerCui: company.cui,
          taxExclusiveAmount: amount,
          payableAmount: round2(amount * (1 + s.vat)),
          currency: "RON",
          paidDate: dueDate <= SYNTHETIC_AS_OF ? dueDate : null,
          source: "synthetic",
        });
      });
    }
  }

  return invoices.map((inv) => ({ ...inv, id: invoiceKey(inv) }));
}


const cache = new Map<string, Invoice[]>();

/** 12-month synthetic e-Factura history of ANY company (memoized by id + identity). */
export function syntheticInvoicesFor(company: Company): Invoice[] {
  const key = `${company.id}|${company.name}|${company.cui}`;
  let list = cache.get(key);
  if (!list) {
    list = generateSyntheticInvoices(company, syntheticProfile(company).options);
    cache.set(key, list);
  }
  return list;
}

/** A fixture company record with the synthetic accounting data (fixed costs, existing debt) filled in. */
export function fixtureCompanyRecord(input: Pick<Company, "id" | "name" | "cui" | "caenCode" | "ceoName"> & Partial<Company>): Company {
  const profile = syntheticProfile(input);
  return {
    city: "",
    monthlyFixedCosts: profile.monthlyFixedCosts,
    existingMonthlyDebtService: profile.existingMonthlyDebtService,
    financialsDeclared: true,
    createdAt: new Date().toISOString(),
    ...input,
  };
}

export function syntheticDataset(): Dataset {
  return { source: "synthetic-local", company: DEMO_COMPANY, invoices: syntheticInvoicesFor(DEMO_COMPANY) };
}
