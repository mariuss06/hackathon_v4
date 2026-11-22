"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  Company,
  CourtCase,
  Dataset,
  InvestmentInput,
  Invoice,
  LegalCheckResult,
  QuizAnswers,
} from "@/types/scoring";
import { computeAssessment, type Assessment } from "@/lib/assessment";
import { cleanPersonName, findExistingCompany, formatCui, newCompanyRecord } from "@/lib/company";
import { cleanCaen, GENERAL_SECTOR, sectorForCaen } from "@/lib/data/benchmarks";
import { caseKey, companyCounty, isPreIdentityLegal, rescoreLegal } from "@/lib/scoringEngine";
import { parseEFacturaXml, type ParseResult } from "@/lib/efactura/parser";
import { checkPortalJust } from "@/app/actions/checkPortalJust";
import { scoreRealData, type MultiSourceVerificationReport } from "@/lib/multi-source-verifier";
import { emptyRealData, withLegal, type CompanyRealData } from "@/lib/real-company-sources";
import { canAddCompany as canAddCompanyFor, DEFAULT_BILLING, DEFAULT_PLAN, isBillingCycle, isPlanTier, PLANS, splitUploadsByLimit, type BillingCycle, type PlanTier } from "@/lib/pricing";
import { applyCnpToLegal, validateCnp } from "@/lib/cnp";
import { courtCounties } from "@/lib/scoringEngine";
import { mergeHistory, snapshotFromAssessment, type AssessmentSnapshot } from "@/lib/history";
import { apiFetch } from "@/lib/auth/client";
import { buildDemoPlan, isDemoCompanyId } from "@/lib/demo";
import { useAuth } from "./AuthProvider";
import { useLanguage } from "./LanguageProvider";

export const EMPTY_QUIZ: QuizAnswers = {
  revenueEstimate: null,
  paymentTerm: null,
  topClientShare: null,
  mainSupplier: null,
  hasSignificantCreditNotes: null,
};
export const EMPTY_INVESTMENT: InvestmentInput = { purpose: null, ownContributionPct: null, requestedAmount: null };

/** Shown while no company exists yet: every step renders its empty state instead of another company's data. */
export const BLANK_COMPANY: Company = { id: "", name: "", cui: "", caenCode: "", ceoName: "", city: "", monthlyFixedCosts: 0, existingMonthlyDebtService: 0, financialsDeclared: false, debts: [] };

/**
 * Sequential flow (2026 redesign): date firmă → quiz cunoștințe → (analiză automată) → quiz investiție → raport final.
 * "analiza" is kept only for workspaces saved by the previous flow; there is no page for it anymore.
 */
export type StepId = "onboarding" | "quiz" | "analiza" | "investitie" | "profil";

export interface ScoreToast {
  id: number;
  from: number;
  to: number;
  title: string;
  detail: string;
}

/** What the step-1 form submits. Name and CEO are required; CUI and CAEN are optional. */
export interface CompanyDraft {
  name: string;
  cui: string;
  caenCode: string;
  /** Benchmark sector picked by hand (used when the CAEN code is missing or not mapped). */
  sector: string;
  ceoName: string;
  county?: string;
  /** GDPR: the administrator agreed to be searched by name in public court records. */
  nameSearchConsent?: boolean;
  /**
   * Administrator CNP as typed (optional). Validated on save; only the masked form ("1900101******")
   * and the derived birth date / county are kept. "" = remove the stored CNP; undefined = keep it.
   */
  ceoCnp?: string;
}

export interface SaveCompanyResult {
  ok: boolean;
  company?: Company;
  created?: boolean;
  message: string;
}

/** Everything that belongs to ONE company. Switching company swaps the whole workspace. */
interface Workspace {
  uploads: Invoice[];
  quiz: QuizAnswers;
  investment: InvestmentInput;
  legal: LegalCheckResult | null;
  /** Answers of the real official sources (ANAF, bilanț, VIES, ONRC); portal.just.ro lives in `legal`. */
  official?: CompanyRealData | null;
  visited: StepId[];
  /** Documents of the credit file the user already has (checklist, step 4). */
  docs?: Record<string, boolean>;
  /** Action-plan items marked as done. */
  doneActions?: string[];
  /** Complete final scores over time (one point per day). */
  history?: { date: string; score: number }[];
  /** Every saved evaluation (also in public.assessment_history when Supabase is configured). */
  snapshots?: AssessmentSnapshot[];
  /** Quiz finished and saved (sequential quiz in step 1 / step 3). */
  quizDone?: boolean;
  investmentDone?: boolean;
  /** Step 2 confirmed with "Continuă la Pasul 3". */
  step2Done?: boolean;
  /** Workspace loaded by "Încarcă Demo Complet". */
  demo?: boolean;
}

/** Sequential flow: each step needs the previous ones (saved per company in localStorage). */
export interface CompletedSteps {
  step1: boolean;
  step2: boolean;
  step3: boolean;
}

const EMPTY_WORKSPACE: Workspace = { uploads: [], quiz: EMPTY_QUIZ, investment: EMPTY_INVESTMENT, legal: null, official: null, visited: [] };

interface PersistedV4 {
  version: 4;
  activeId: string;
  companies: Company[];
  workspaces: Record<string, Workspace>;
}

const STORAGE_KEY = "credit-ready-v4";
const V3_KEY = "credit-ready-v3";
/** The fictional demo company of earlier versions: removed from every saved list (zero invented data). */
const LEGACY_DEMO_ID = "00000000-0000-4000-8000-000000004639";
/** Plan per company: { [companyId]: { planTier, billingCycle } } (mirror of public.subscriptions). */
const PLAN_KEY = "credit-ready-plan";

export interface ActivePlan {
  planTier: PlanTier;
  billingCycle: BillingCycle;
}
const DEFAULT_ACTIVE_PLAN: ActivePlan = { planTier: DEFAULT_PLAN, billingCycle: DEFAULT_BILLING };

function readPlans(): Record<string, ActivePlan> {
  try {
    const raw = JSON.parse(window.localStorage.getItem(PLAN_KEY) ?? "{}") as Record<string, Partial<ActivePlan>>;
    return Object.fromEntries(
      Object.entries(raw ?? {})
        .filter(([, v]) => isPlanTier(v?.planTier))
        .map(([id, v]) => [id, { planTier: v.planTier as PlanTier, billingCycle: isBillingCycle(v.billingCycle) ? v.billingCycle : DEFAULT_BILLING }]),
    );
  } catch {
    return {};
  }
}
/** A portal.just.ro result that is not a real answer (old simulations, results saved before identity confidence). */
const staleLegal = (l: LegalCheckResult | null | undefined) => !l || isPreIdentityLegal(l) || (l.source as string) === "simulation";

/**
 * v4 = v3 without invented data: the demo company is removed, generated fixed costs / installments are
 * reset (to be declared), simulated court results and old 6-source reports (with simulated sources) dropped.
 * Real XML uploads, quiz answers and the investment form are kept.
 */
function readStorage(): PersistedV4 | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as PersistedV4;
      if (p.version === 4 && Array.isArray(p.companies)) return p;
    }
    const v3raw = window.localStorage.getItem(V3_KEY);
    if (!v3raw) return null;
    const v3 = JSON.parse(v3raw) as { activeId: string; companies: Company[]; workspaces: Record<string, Workspace & { verification?: unknown }> };
    const companies = (v3.companies ?? [])
      .filter((c) => c.id !== LEGACY_DEMO_ID)
      .map((c) => (c.financialsDeclared ? c : { ...c, monthlyFixedCosts: 0, existingMonthlyDebtService: 0, financialsDeclared: false, debts: c.debts ?? [] }));
    const workspaces: Record<string, Workspace> = {};
    for (const [id, w] of Object.entries(v3.workspaces ?? {})) {
      if (id === LEGACY_DEMO_ID || !w) continue;
      const rest: Workspace = { ...EMPTY_WORKSPACE, ...w };
      delete (rest as Workspace & { verification?: unknown }).verification;
      workspaces[id] = { ...rest, legal: staleLegal(rest.legal) ? null : rest.legal, official: null };
    }
    return { version: 4, activeId: companies.some((c) => c.id === v3.activeId) ? v3.activeId : (companies[0]?.id ?? ""), companies, workspaces };
  } catch {
    return null;
  }
}

export type QuizKind = "quiz" | "investment";
type SupabaseInfo = { configured: boolean; error?: string } | null;

interface Ctx {
  /** The active company (all scores are computed on its invoices only). */
  company: Company;
  companies: Company[];
  activeCompanyId: string;
  switchCompany: (id: string) => void;
  saveCompany: (draft: CompanyDraft) => Promise<SaveCompanyResult>;
  setCompany: (patch: Partial<Company>) => void;
  dataset: Dataset;
  supabase: SupabaseInfo;
  invoices: Invoice[];
  uploads: Invoice[];
  quiz: QuizAnswers;
  setQuiz: (patch: Partial<QuizAnswers>) => void;
  investment: InvestmentInput;
  setInvestment: (patch: Partial<InvestmentInput>) => void;
  /** Whether each quiz of the active company was finished and saved. */
  quizCompleted: Record<QuizKind, boolean>;
  /** Marks a quiz finished (saves it in the browser + Supabase) or reopens it (`done` = false). */
  completeQuiz: (kind: QuizKind, done: boolean) => Promise<string | null>;
  legal: LegalCheckResult | null;
  legalLoading: boolean;
  /** Re-runs portal.just.ro for the active company (official ANAF name when known). */
  runLegalCheck: () => Promise<void>;
  /** Raw answers of the real sources for the active company. */
  official: CompanyRealData;
  /** ScorVerificariExterne report from `official` + the current legal result (with the user's confirmations). */
  verification: MultiSourceVerificationReport;
  verificationLoading: boolean;
  /** Queries ANAF, bilanț, VIES again (then portal.just.ro). */
  runMultiSourceCheck: () => Promise<void>;
  /** Unsaved step-1 form (saved automatically when the user continues to step 2). */
  pendingDraft: CompanyDraft | null;
  setPendingDraft: (d: CompanyDraft | null) => void;
  docs: Record<string, boolean>;
  toggleDoc: (id: string) => void;
  doneActions: string[];
  toggleAction: (id: string) => void;
  history: { date: string; score: number }[];
  setCaseVerdict: (key: string, verdict: CourtCase["userVerdict"] | null) => void;
  assessment: Assessment;
  uploadXml: (files: { name: string; xml: string }[]) => Promise<ParseResult[]>;
  lastUploadResults: ParseResult[];
  persistMessage: string | null;
  resetUploads: () => void;
  resetAll: () => void;
  toast: ScoreToast | null;
  dismissToast: () => void;
  visited: StepId[];
  markVisited: (s: StepId) => void;
  hydrated: boolean;
  /** Plan of the ACTIVE company (Starter until upgraded); gates features instantly, no reload. */
  plan: ActivePlan;
  setPlan: (planTier: PlanTier, billingCycle?: BillingCycle) => void;
  /** Reason shown in the upgrade prompt (e.g. the 4th XML on Starter); null = closed. */
  upgradePrompt: string | null;
  showUpgrade: (reason: string) => void;
  closeUpgrade: () => void;
  /** The active company bought a one-off pay-per-use analysis (unlocks it on any plan). */
  payPerUse: boolean;
  unlockPayPerUse: () => Promise<string>;
  /** Saved evaluations of the active company, oldest first (local + Supabase). */
  snapshots: AssessmentSnapshot[];
  /** Today (YYYY-MM-DD), read once after hydration ("" during prerender). */
  today: string;
  /** Saves the current COMPLETE assessment as a new snapshot (never overwrites older ones). */
  saveSnapshot: () => Promise<{ ok: boolean; message: string }>;
  completedSteps: CompletedSteps;
  /** Marks step 2 as confirmed (button "Continuă la Pasul 3"). */
  confirmStep2: () => void;
  isDemo: boolean;
  /** Plan scenario of the loaded demo (Starter 1 firmă, Pro 3, Business 5); null outside demo mode. */
  demoPlan: PlanTier | null;
  /** Loads the demo companies of one plan scenario (replacing any previous demo) and unlocks steps 1-3. */
  loadDemoPlan: (tier: PlanTier) => void;
  /** Leaves the demo (removes every demo company) and opens a blank company in step 1. */
  startNewCompany: () => void;
  /** Full assessment of ANY saved company (multi-company overview), from its own workspace only. */
  assessCompany: (id: string) => Assessment | null;
  /** Whether one more company may be added under the active plan (demo companies count only in demo mode). */
  canAddCompany: { allowed: boolean; limit: number | null };
}

const AssessmentContext = createContext<Ctx | null>(null);

export function useAssessment() {
  const ctx = useContext(AssessmentContext);
  if (!ctx) throw new Error("useAssessment must be used inside <AssessmentProvider>");
  return ctx;
}

const mergeInvoices = (base: Invoice[], uploads: Invoice[]) => {
  const ids = new Set(uploads.map((u) => u.id));
  return [...base.filter((i) => !ids.has(i.id)), ...uploads];
};

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `local-${Date.now()}-${Math.random().toString(16).slice(2)}`);

export function AssessmentProvider({ children }: { children: ReactNode }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [workspaces, setWorkspaces] = useState<Record<string, Workspace>>({});
  /** Invoices stored in Supabase per company id; null = company not in Supabase (only its uploaded XML counts). */
  const [remote, setRemote] = useState<Record<string, Invoice[] | null>>({});
  const [supabase, setSupabase] = useState<SupabaseInfo>(null);
  const [legalLoading, setLegalLoading] = useState(false);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<CompanyDraft | null>(null);
  const [toast, setToast] = useState<ScoreToast | null>(null);
  const [lastUploadResults, setLastUploadResults] = useState<ParseResult[]>([]);
  const [persistMessage, setPersistMessage] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  /** Today, read once after hydration (never during render / prerender). */
  const [today, setToday] = useState("");
  const [plans, setPlans] = useState<Record<string, ActivePlan>>({});
  const [upgradePrompt, setUpgradePrompt] = useState<string | null>(null);
  /** assessment_history rows from Supabase per company id. */
  const [remoteHistory, setRemoteHistory] = useState<Record<string, AssessmentSnapshot[]>>({});
  const autoChecked = useRef(new Set<string>());
  const { session } = useAuth();
  const accountId = session?.user.id ?? null;
  // Engine texts (sub-score rules, action plan, bank reasons) are generated in the interface language:
  // recompute them when it changes.
  const { lang } = useLanguage();

  const company = useMemo(() => (activeId ? (companies.find((c) => c.id === activeId) ?? companies[0] ?? BLANK_COMPANY) : BLANK_COMPANY), [companies, activeId]);
  const companiesRef = useRef<Company[]>([]);
  useEffect(() => {
    companiesRef.current = companies;
  }, [companies]);
  const ws = workspaces[company.id] ?? EMPTY_WORKSPACE;
  const { uploads, quiz, investment, visited } = ws;
  // The validated CNP (masked + birth date / county) excludes impossible namesakes from the administrator's cases.
  const legal = useMemo(() => applyCnpToLegal(ws.legal, company.ceoCnpInfo && company.ceoCnpMasked ? { ...company.ceoCnpInfo, masked: company.ceoCnpMasked } : null, rescoreLegal, courtCounties), [ws.legal, company.ceoCnpInfo, company.ceoCnpMasked]);
  // The real sources of the ACTIVE company only; the portal.just.ro parts follow the current legal result.
  const official = useMemo(() => withLegal(ws.official ?? emptyRealData(company.cui, ""), legal), [ws.official, company.cui, legal]);
  const verification = useMemo(
    () => scoreRealData(official, legal, { companyId: company.id, companyName: company.officialName || company.name, ceoName: company.ceoName }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lang: regenerate the texts in the new language
    [official, legal, company.id, company.officialName, company.name, company.ceoName, lang],
  );
  const docs = useMemo(() => ws.docs ?? {}, [ws.docs]);
  const doneActions = useMemo(() => ws.doneActions ?? [], [ws.doneActions]);
  const history = useMemo(() => ws.history ?? [], [ws.history]);
  const supabaseLive = Boolean(supabase?.configured && !supabase.error);
  const plan = plans[company.id] ?? DEFAULT_ACTIVE_PLAN;
  const payPerUse = Boolean(company.payPerUseUnlocked);
  const snapshots = useMemo(() => mergeHistory(ws.snapshots ?? [], remoteHistory[company.id] ?? []), [ws.snapshots, remoteHistory, company.id]);

  const remoteInvoices = remote[company.id];
  const dataset: Dataset = useMemo(
    () => (remoteInvoices?.length ? { source: "supabase", company, invoices: remoteInvoices } : { source: "local", company, invoices: [] }),
    [company, remoteInvoices],
  );
  // Only the ACTIVE company's invoices: those stored in Supabase + the XML uploaded for it. Nothing generated.
  const invoices = useMemo(() => mergeInvoices(dataset.invoices, uploads), [dataset.invoices, uploads]);
  const assessment = useMemo(
    () => computeAssessment({ company, invoices, quiz, investment, legal, verification, today }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lang: regenerate the texts in the new language
    [company, invoices, quiz, investment, legal, verification, today, lang],
  );

  const updateWorkspace = useCallback((id: string, fn: (w: Workspace) => Workspace) => {
    setWorkspaces((all) => ({ ...all, [id]: fn(all[id] ?? EMPTY_WORKSPACE) }));
  }, []);

  // --- Restore local state, then sync the company list with Supabase -------------------
  useEffect(() => {
    const saved = readStorage();
    /* eslint-disable react-hooks/set-state-in-effect -- one-time restore from localStorage after hydration */
    if (saved) {
      setCompanies(saved.companies);
      setWorkspaces(saved.workspaces ?? {});
      setActiveId(saved.companies.some((c) => c.id === saved.activeId) ? saved.activeId : (saved.companies[0]?.id ?? ""));
    }
    setPlans(readPlans());
    setToday(new Date().toISOString().slice(0, 10));
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // --- Company list from Supabase: the account's companies when signed in, guest companies otherwise.
  // On sign-in, companies created in guest mode in this browser are linked to the account first.
  const claimed = useRef<string | null>(null);
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    const load = async () => {
      if (accountId && claimed.current !== accountId) {
        claimed.current = accountId;
        const ids = companiesRef.current.map((c) => c.id).filter(Boolean);
        if (ids.length) await apiFetch("/api/account/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyIds: ids }) }).catch(() => undefined);
      }
      const d = (await apiFetch("/api/companies").then((r) => r.json())) as { supabase: { configured: boolean; error?: string }; companies: Company[] };
      if (cancelled) return;
        setSupabase(d.supabase);
        if (!d.supabase.configured || d.supabase.error || !d.companies.length) return;
        // Supabase is the source of truth for saved companies; companies only known locally are kept.
        setCompanies((local) => {
          const byId = new Map(local.map((c) => [c.id, c]));
          for (const c of d.companies) {
            if (c.id === LEGACY_DEMO_ID) continue;
            const prev = byId.get(c.id);
            // Databases without the v6 columns return no CNP / pay-per-use: keep what this browser knows.
            byId.set(c.id, {
              ...prev,
              ...c,
              payPerUseUnlocked: Boolean(prev?.payPerUseUnlocked || c.payPerUseUnlocked),
              ceoCnpMasked: c.ceoCnpMasked ?? prev?.ceoCnpMasked,
              ceoCnpInfo: c.ceoCnpInfo ?? prev?.ceoCnpInfo,
            });
          }
          return [...byId.values()];
        });
        setActiveId((id) => id || (d.companies.find((c) => c.id !== LEGACY_DEMO_ID)?.id ?? ""));
    };
    load().catch(() => !cancelled && setSupabase({ configured: false, error: "API indisponibil" }));
    return () => {
      cancelled = true;
    };
  }, [hydrated, accountId]);

  // --- Saved evaluations of the active company from Supabase (assessment_history).
  useEffect(() => {
    if (!supabaseLive || !activeId || remoteHistory[activeId] !== undefined) return;
    let cancelled = false;
    apiFetch(`/api/history?companyId=${encodeURIComponent(activeId)}`)
      .then((r) => r.json())
      .then((d: { ok: boolean; history?: AssessmentSnapshot[] }) => !cancelled && setRemoteHistory((all) => ({ ...all, [activeId]: d.ok ? (d.history ?? []) : [] })))
      .catch(() => !cancelled && setRemoteHistory((all) => ({ ...all, [activeId]: [] })));
    return () => {
      cancelled = true;
    };
  }, [supabaseLive, activeId, remoteHistory]);

  // --- Load the active company's invoices from Supabase (filtered by company_id) --------
  useEffect(() => {
    if (!supabaseLive || !activeId || remote[activeId] !== undefined) return;
    let cancelled = false;
    fetch(`/api/dataset?companyId=${encodeURIComponent(activeId)}`)
      .then((r) => r.json())
      .then((d: Dataset & { found: boolean }) => {
        if (cancelled) return;
        setRemote((all) => ({ ...all, [activeId]: d.found && d.source === "supabase" ? d.invoices : null }));
      })
      .catch(() => !cancelled && setRemote((all) => ({ ...all, [activeId]: null })));
    return () => {
      cancelled = true;
    };
  }, [supabaseLive, activeId, remote]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      const data: PersistedV4 = { version: 4, activeId, companies, workspaces };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* storage unavailable or full: state simply is not remembered */
    }
  }, [hydrated, activeId, companies, workspaces]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(PLAN_KEY, JSON.stringify(plans));
    } catch {
      /* storage unavailable: the plan lasts for this session only */
    }
  }, [hydrated, plans]);

  // Plan stored in Supabase for a company this browser has no plan for yet.
  useEffect(() => {
    if (!hydrated || !supabaseLive || !activeId || plans[activeId]) return;
    let cancelled = false;
    fetch(`/api/subscription?companyId=${encodeURIComponent(activeId)}`)
      .then((r) => r.json())
      .then((d: { ok: boolean; subscription?: { planTier: unknown; billingCycle: unknown } }) => {
        const sub = d.subscription;
        if (cancelled || !d.ok || !sub || !isPlanTier(sub.planTier) || sub.planTier === DEFAULT_PLAN) return;
        setPlans((all) => (all[activeId] ? all : { ...all, [activeId]: { planTier: sub.planTier as PlanTier, billingCycle: isBillingCycle(sub.billingCycle) ? sub.billingCycle : DEFAULT_BILLING } }));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [hydrated, supabaseLive, activeId, plans]);

  const setPlan = useCallback(
    (planTier: PlanTier, billingCycle?: BillingCycle) => {
      const next = { planTier, billingCycle: billingCycle ?? plan.billingCycle };
      setPlans((all) => ({ ...all, [company.id]: next }));
      setUpgradePrompt(null);
      if (!isDemoCompanyId(company.id)) void fetch("/api/subscription", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company, ...next }) }).catch(() => undefined);
    },
    [company, plan.billingCycle],
  );
  const showUpgrade = useCallback((reason: string) => setUpgradePrompt(reason), []);
  const closeUpgrade = useCallback(() => setUpgradePrompt(null), []);

  // --- Mutators -----------------------------------------------------------------------
  const setCompany = useCallback(
    (patch: Partial<Company>) => setCompanies((list) => list.map((c) => (c.id === activeId ? { ...c, ...patch, id: c.id } : c))),
    [activeId],
  );
  const setQuiz = useCallback((patch: Partial<QuizAnswers>) => updateWorkspace(activeId, (w) => ({ ...w, quiz: { ...w.quiz, ...patch } })), [activeId, updateWorkspace]);
  const setInvestment = useCallback(
    (patch: Partial<InvestmentInput>) => updateWorkspace(activeId, (w) => ({ ...w, investment: { ...w.investment, ...patch } })),
    [activeId, updateWorkspace],
  );
  const quizCompleted: Record<QuizKind, boolean> = {
    quiz: ws.quizDone ?? assessment.quiz.answered === 5,
    investment: ws.investmentDone ?? Boolean(investment.purpose && investment.ownContributionPct != null && investment.requestedAmount),
  };
  const completeQuiz = useCallback(
    async (kind: QuizKind, done: boolean): Promise<string | null> => {
      updateWorkspace(activeId, (w) => (kind === "quiz" ? { ...w, quizDone: done } : { ...w, investmentDone: done }));
      if (!done) return null;
      if (!supabaseLive || isDemoCompanyId(activeId)) return "Rezultat salvat în browser.";
      try {
        const r = (await apiFetch("/api/quiz-result", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyId: activeId,
            kind,
            quizAnswers: quiz,
            quizScore: assessment.dataStatus.hasInvoices ? assessment.quiz.total : null,
            investment,
            sUman: assessment.final.pillars.human.score,
            sInvestitie: assessment.final.pillars.investment.score,
            finalScore: assessment.final.finalScore,
          }),
        }).then((x) => x.json())) as { persisted?: boolean; error?: string };
        return r.persisted ? "Rezultat salvat în Supabase." : `Salvat în browser; Supabase: ${r.error ?? "nesalvat"}.`;
      } catch {
        return "Salvat în browser; API indisponibil.";
      }
    },
    [activeId, assessment, investment, quiz, supabaseLive, updateWorkspace],
  );
  const markVisited = useCallback(
    (s: StepId) => updateWorkspace(activeId, (w) => (w.visited.includes(s) ? w : { ...w, visited: [...w.visited, s] })),
    [activeId, updateWorkspace],
  );
  const dismissToast = useCallback(() => setToast(null), []);

  const showToast = useCallback((from: number, to: number, title: string, detail: string) => {
    const id = Date.now();
    setToast({ id, from, to, title, detail });
    window.setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 9000);
  }, []);

  const switchCompany = useCallback((id: string) => {
    setActiveId(id);
    setLastUploadResults([]);
    setPersistMessage(null);
    setToast(null);
  }, []);

  /**
   * Step 1 submit: load the existing company (same CUI, or same normalized name when there is no CUI)
   * or create a new one with a 12-month synthetic e-Factura history. Never deletes anything.
   */
  const saveCompany = useCallback(
    async (draft: CompanyDraft): Promise<SaveCompanyResult> => {
      const name = draft.name.trim().replace(/\s+/g, " ");
      const ceoName = cleanPersonName(draft.ceoName);
      if (!name || !ceoName) return { ok: false, message: "Completează numele firmei și numele administratorului (obligatorii)." };
      const caenCode = cleanCaen(draft.caenCode);
      const sector = sectorForCaen(caenCode) ?? (draft.sector || GENERAL_SECTOR);
      const cui = formatCui(draft.cui);
      // CNP: validated here, then only the masked form + hints are kept (the raw value is dropped).
      let cnpPatch: Pick<Company, "ceoCnpMasked" | "ceoCnpInfo"> | null = null;
      if (draft.ceoCnp !== undefined) {
        if (draft.ceoCnp.trim() === "") cnpPatch = { ceoCnpMasked: undefined, ceoCnpInfo: undefined };
        else {
          const v = validateCnp(draft.ceoCnp);
          if (!v.valid) return { ok: false, message: `CNP invalid: ${v.error}` };
          cnpPatch = { ceoCnpMasked: v.info.masked, ceoCnpInfo: { birthDate: v.info.birthDate, sex: v.info.sex, countyCode: v.info.countyCode, county: v.info.county } };
        }
      }
      const withCnp = (c: Company): Company => (cnpPatch ? { ...c, ...cnpPatch } : c);

      const activate = (c: Company, created: boolean, extra = "") => {
        setCompanies((list) => (list.some((x) => x.id === c.id) ? list.map((x) => (x.id === c.id ? { ...x, ...c } : x)) : [...list, c]));
        // Answers given before the company existed (blank workspace) move to the new company.
        if (created)
          setWorkspaces((all) => {
            if (!all[""] || all[c.id]) return all;
            const rest = { ...all, [c.id]: all[""] };
            delete rest[""];
            return rest;
          });
        switchCompany(c.id);
        const id = cui ? `CUI ${cui}` : "fără CUI, identificată după nume";
        setPendingDraft(null);
        // Consent changes and identity changes need fresh checks.
        autoChecked.current.delete(c.id);
        return {
          ok: true,
          company: c,
          created,
          message: created
            ? `Firmă nouă salvată (${id}). ${cui ? "Aduc datele oficiale de la ANAF, bilanțurile, VIES și portal.just.ro." : "Fără CUI: verific doar portal.just.ro; completează CUI-ul pentru ANAF, bilanț și VIES."} Pentru analiză încarcă facturile e-Factura în pasul 1.${extra}`
            : `Firma există deja (${id}) — am încărcat datele ei, nimic nu a fost șters.${extra}`,
        };
      };

      if (supabaseLive) {
        try {
          const r = await apiFetch("/api/companies", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, cui, caenCode, sector, ceoName, county: draft.county, nameSearchConsent: draft.nameSearchConsent, ...(cnpPatch ? { ceoCnpMasked: cnpPatch.ceoCnpMasked ?? null, ceoCnpInfo: cnpPatch.ceoCnpInfo ?? null } : {}) }),
          }).then((x) => x.json() as Promise<{ ok: boolean; company?: Company; created?: boolean; seeded?: number; error?: string }>);
          if (r.ok && r.company) {
            setRemote((all) => {
              const next = { ...all };
              delete next[r.company!.id]; // force a fresh load of its invoices
              return next;
            });
            return activate(withCnp({ ...r.company, nameSearchConsent: draft.nameSearchConsent ?? r.company.nameSearchConsent }), Boolean(r.created), " Salvat în Supabase.");
          }
          // Supabase failed: fall through to local mode so the form never blocks.
          const local = saveLocal();
          return { ...local, message: `${local.message} (Supabase: ${r.error ?? "eroare"}; salvat local.)` };
        } catch {
          const local = saveLocal();
          return { ...local, message: `${local.message} (API indisponibil; salvat local.)` };
        }
      }
      return saveLocal();

      function saveLocal(): SaveCompanyResult {
        const existing = findExistingCompany(companies, { name, cui });
        if (existing) {
          // An untouched "General IMM" default from the blank form must not overwrite a sector chosen earlier.
          const keptSector = sectorForCaen(caenCode) ?? (sector !== GENERAL_SECTOR ? sector : (existing.sector ?? sector));
          return activate(
            withCnp({
              ...existing,
              cui: cui || existing.cui,
              caenCode: caenCode || existing.caenCode,
              sector: keptSector,
              ceoName,
              county: draft.county ?? existing.county,
              nameSearchConsent: draft.nameSearchConsent ?? existing.nameSearchConsent,
            }),
            false,
          );
        }
        return activate(withCnp(newCompanyRecord({ id: newId(), name, cui, caenCode, sector, ceoName, county: draft.county, nameSearchConsent: draft.nameSearchConsent })), true);
      }
    },
    [companies, supabaseLive, switchCompany],
  );

  /** portal.just.ro for one company: the official ANAF name when known; the administrator only with consent (GDPR). */
  const runLegalCheckFor = useCallback(
    async (target: Company) => {
      setLegalLoading(true);
      try {
        const res = await checkPortalJust({
          companyName: target.officialName || target.name,
          ceoName: target.nameSearchConsent ? target.ceoName : "",
          companyCounty: companyCounty(target),
        });
        // Keep the user's confirmations for cases that come back again.
        updateWorkspace(target.id, (w) => {
          const verdicts = new Map(w.legal?.cases.filter((c) => c.userVerdict).map((c) => [caseKey(c), c.userVerdict]));
          const legalResult =
            verdicts.size === 0 ? res : rescoreLegal({ ...res, cases: res.cases.map((c) => ({ ...c, userVerdict: verdicts.get(caseKey(c)) ?? c.userVerdict })) });
          return { ...w, legal: legalResult };
        });
        if (supabaseLive && !res.isFallback) {
          void fetch("/api/legal-checks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company: target, result: res }) }).catch(
            () => undefined,
          );
        }
      } finally {
        setLegalLoading(false);
      }
    },
    [supabaseLive, updateWorkspace],
  );

  /**
   * The real official data of one company (ANAF v9, bilanțuri, VIES, ONRC state) via /api/company-real-data,
   * then portal.just.ro with the OFFICIAL name. Empty fields of the company (CAEN, county) are completed from ANAF.
   */
  const refreshCompanyData = useCallback(
    async (target: Company) => {
      if (!target.id) return;
      autoChecked.current.add(target.id);
      let next = target;
      if (formatCui(target.cui)) {
        setVerificationLoading(true);
        try {
          const r = (await fetch("/api/company-real-data", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cui: target.cui, companyName: target.name, ceoName: target.ceoName, companyCounty: companyCounty(target), includePortal: false }),
          }).then((x) => x.json())) as { ok: boolean; real?: CompanyRealData };
          if (r.ok && r.real) {
            const real = r.real;
            updateWorkspace(target.id, (w) => ({ ...w, official: real }));
            const a = real.anaf;
            if (a) {
              const caen = target.caenCode || cleanCaen(a.codCaen);
              next = {
                ...target,
                officialName: a.denumire || undefined,
                caenCode: caen,
                sector: target.caenCode ? target.sector : (sectorForCaen(caen) ?? target.sector),
                county: target.county ?? (a.judet || undefined),
                city: target.city || a.localitate,
              };
              const patch = next;
              setCompanies((list) => list.map((c) => (c.id === patch.id ? { ...c, ...patch } : c)));
            }
          }
        } catch {
          /* API unavailable: the sources stay "unavailable", nothing is assumed */
        } finally {
          setVerificationLoading(false);
        }
      } else {
        updateWorkspace(target.id, (w) => ({ ...w, official: null }));
      }
      await runLegalCheckFor(next);
    },
    [runLegalCheckFor, updateWorkspace],
  );

  const runLegalCheck = useCallback(() => runLegalCheckFor(company), [company, runLegalCheckFor]);
  const runMultiSourceCheck = useCallback(() => refreshCompanyData(company), [company, refreshCompanyData]);

  /** "confirmat" = it is my case, "contestat" = a namesake, null = undo. */
  const setCaseVerdict = useCallback(
    (key: string, verdict: CourtCase["userVerdict"] | null) => {
      updateWorkspace(activeId, (w) =>
        w.legal ? { ...w, legal: rescoreLegal({ ...w.legal, cases: w.legal.cases.map((c) => (caseKey(c) === key ? { ...c, userVerdict: verdict ?? undefined } : c)) }) } : w,
      );
    },
    [activeId, updateWorkspace],
  );

  const toggleDoc = useCallback((id: string) => updateWorkspace(activeId, (w) => ({ ...w, docs: { ...w.docs, [id]: !w.docs?.[id] } })), [activeId, updateWorkspace]);
  const toggleAction = useCallback(
    (id: string) =>
      updateWorkspace(activeId, (w) => {
        const done = w.doneActions ?? [];
        return { ...w, doneActions: done.includes(id) ? done.filter((x) => x !== id) : [...done, id] };
      }),
    [activeId, updateWorkspace],
  );

  // Real data + portal.just.ro the first time each company is opened in this session (and after each save).
  useEffect(() => {
    if (!hydrated || !company.id || autoChecked.current.has(company.id) || !company.name.trim()) return;
    if (legal && ws.official) {
      autoChecked.current.add(company.id);
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- starts the external requests (ANAF, bilanț, VIES, portal.just.ro) once per company
    void refreshCompanyData(company);
  }, [hydrated, company, legal, ws.official, refreshCompanyData]);

  // Score history: one point per day, only for complete scores (never for scores on missing data).
  const finalComplete = Boolean(assessment.final.complete);
  const finalScoreNow = assessment.final.finalScore;
  useEffect(() => {
    if (!hydrated || !company.id || !finalComplete) return;
    const date = new Date().toISOString().slice(0, 10);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- records a derived snapshot; returns the same object when nothing changed
    updateWorkspace(company.id, (w) => {
      const h = w.history ?? [];
      const last = h[h.length - 1];
      if (last?.date === date && last.score === finalScoreNow) return w;
      return { ...w, history: [...h.filter((p) => p.date !== date), { date, score: finalScoreNow }].slice(-60) };
    });
  }, [hydrated, company.id, finalComplete, finalScoreNow, updateWorkspace]);

  const uploadXml = useCallback(
    async (files: { name: string; xml: string }[]) => {
      const target = company;
      const results = files.map((f) => parseEFacturaXml(f.xml, f.name, target));
      setLastUploadResults(results);
      const valid = results.filter((r) => r.ok && r.invoice);
      // Plan limit on XML uploads per company (re-uploading an invoice already counted is free).
      const known = new Set(uploads.map((u) => u.id));
      const fresh = valid.filter((r) => !known.has(r.invoice!.id));
      const { rejected } = splitUploadsByLimit(plan.planTier, uploads.length, fresh, payPerUse);
      if (rejected.length > 0) {
        const limit = PLANS[plan.planTier].limits.maxXmlUploads;
        const msg = `Limita planului ${PLANS[plan.planTier].name}: maximum ${limit} facturi XML pe firmă. Deblochează upload nelimitat cu Planul Pro.`;
        for (const r of rejected) Object.assign(r, { ok: false, error: msg, invoice: undefined });
        setLastUploadResults([...results]);
        setUpgradePrompt(`Ai atins limita de ${limit} facturi XML a planului Starter pentru ${target.name}. Cu Planul Pro încarci nelimitat și scorul se recalculează la fiecare factură.`);
      }
      const parsed = results.filter((r) => r.ok && r.invoice).map((r) => r.invoice!);
      if (parsed.length === 0) return results;

      const nextUploads = mergeInvoices(uploads, parsed);
      const before = assessment.final.finalScore;
      const after = computeAssessment({ company: target, invoices: mergeInvoices(dataset.invoices, nextUploads), quiz, investment, legal, verification, today }).final.finalScore;
      updateWorkspace(target.id, (w) => ({ ...w, uploads: mergeInvoices(w.uploads, parsed) }));
      const first = parsed[0];
      showToast(
        before,
        after,
        parsed.length === 1 ? `Factura ${first.number} → ${target.name}` : `${parsed.length} facturi atașate la ${target.name}`,
        parsed.length === 1
          ? `${first.typeCode === "381" ? "Storno 381" : "Factură 380"} ${first.direction === "issued" ? "emisă (vânzare)" : "primită (achiziție)"} · ${first.direction === "issued" ? first.customerName : first.supplierName} · ${first.taxExclusiveAmount.toLocaleString("ro-RO")} RON fără TVA`
          : "Toți pilonii au fost recalculați doar pe facturile acestei firme.",
      );

      if (isDemoCompanyId(target.id)) {
        setPersistMessage("Mod Demo: facturile rămân doar în acest browser.");
        return results;
      }
      const rawXml = Object.fromEntries(results.filter((r) => r.ok && r.invoice).map((r) => [r.invoice!.id, files.find((f) => f.name === r.fileName)?.xml ?? ""]));
      apiFetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company: target, invoices: parsed, rawXml }),
      })
        .then((r) => r.json())
        .then((r: { persisted: boolean; count?: number; message?: string; error?: string }) =>
          setPersistMessage(r.persisted ? `Salvat în Supabase pe firma ${target.name} (${r.count} facturi).` : (r.error ?? r.message ?? "Nesalvat în Supabase.")),
        )
        .catch(() => setPersistMessage("Nesalvat: API indisponibil (facturile rămân în browser, pe firma activă)."));
      return results;
    },
    [assessment.final.finalScore, company, dataset.invoices, investment, legal, quiz, showToast, updateWorkspace, uploads, verification, plan.planTier, today, payPerUse],
  );

  /** Simulated checkout of one complete analysis (89 RON) for the ACTIVE company. */
  const unlockPayPerUse = useCallback(async () => {
    const target = company;
    if (!target.id) return "Salvează întâi firma în Pasul 1.";
    setCompanies((list) => list.map((c) => (c.id === target.id ? { ...c, payPerUseUnlocked: true } : c)));
    setUpgradePrompt(null);
    try {
      const r = (await apiFetch("/api/pay-per-use", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company: target }) }).then((x) => x.json())) as {
        ok: boolean;
        mode?: string;
        error?: string;
      };
      return r.mode === "local" ? `Analiza completă pentru ${target.name} este deblocată (salvat în browser${r.error ? `; Supabase: ${r.error}` : ""}).` : `Analiza completă pentru ${target.name} este deblocată și salvată în Supabase.`;
    } catch {
      return `Analiza completă pentru ${target.name} este deblocată în acest browser (API indisponibil).`;
    }
  }, [company]);

  const saveSnapshot = useCallback(async () => {
    if (!company.id) return { ok: false, message: "Salvează întâi firma în Pasul 1." };
    if (!assessment.final.complete) return { ok: false, message: "Istoricul păstrează doar evaluări complete (cu date reale). Completează datele lipsă." };
    const snap = snapshotFromAssessment(assessment, company.id, investment, newId(), new Date().toISOString(), accountId);
    updateWorkspace(company.id, (w) => ({ ...w, snapshots: [...(w.snapshots ?? []), snap].slice(-100) }));
    if (!supabaseLive || isDemoCompanyId(company.id)) return { ok: true, message: `Evaluarea #${snapshots.length + 1} a fost salvată în istoricul din browser.` };
    try {
      const r = (await apiFetch("/api/history", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company, snapshot: snap }) }).then((x) => x.json())) as {
        ok: boolean;
        persisted?: boolean;
        error?: string;
      };
      return r.persisted ? { ok: true, message: `Evaluarea #${snapshots.length + 1} a fost salvată în assessment_history (Supabase).` } : { ok: true, message: `Salvată în browser; Supabase: ${r.error ?? "nesalvat"}.` };
    } catch {
      return { ok: true, message: "Salvată în browser (API indisponibil)." };
    }
  }, [company, assessment, investment, accountId, supabaseLive, snapshots.length, updateWorkspace]);

  const resetUploads = useCallback(() => {
    if (uploads.length === 0) return;
    const before = assessment.final.finalScore;
    const after = computeAssessment({ company, invoices: dataset.invoices.filter((i) => i.source !== "xml-upload"), quiz, investment, legal, verification, today }).final.finalScore;
    updateWorkspace(company.id, (w) => ({ ...w, uploads: [] }));
    setRemote((all) => (all[company.id] ? { ...all, [company.id]: all[company.id]!.filter((i) => i.source !== "xml-upload") } : all));
    setLastUploadResults([]);
    setPersistMessage(null);
    showToast(before, after, "Facturi încărcate eliminate", `Doar pentru ${company.name}; celelalte firme rămân neatinse.`);
    void fetch(`/api/invoices?companyId=${encodeURIComponent(company.id)}`, { method: "DELETE" }).catch(() => undefined);
  }, [assessment.final.finalScore, company, dataset.invoices, investment, legal, quiz, showToast, updateWorkspace, uploads.length, verification, today]);

  /** Resets the evaluation of the ACTIVE company (answers, uploads, legal check). Companies are never deleted. */
  const resetAll = useCallback(() => {
    updateWorkspace(company.id, () => EMPTY_WORKSPACE);
    setLastUploadResults([]);
    autoChecked.current.delete(company.id);
  }, [company.id, updateWorkspace]);

  /**
   * New flow gating: step1 = firmă + administrator introduse; step2 = quiz cunoștințe finalizat;
   * step3 = quiz investiție finalizat. Analiza datelor rulează automat între pași (fără confirmare),
   * deci nu mai depinde de `ws.step2Done`.
   */
  const completedSteps: CompletedSteps = useMemo(() => {
    const step1 = Boolean(company.id && company.name && company.ceoName);
    const step2 = step1 && quizCompleted.quiz;
    return { step1, step2, step3: step2 && quizCompleted.investment };
  }, [company.id, company.name, company.ceoName, quizCompleted.quiz, quizCompleted.investment]);
  const confirmStep2 = useCallback(() => updateWorkspace(activeId, (w) => ({ ...w, step2Done: true })), [activeId, updateWorkspace]);
  const isDemo = Boolean(ws.demo);

  const demoPlan = isDemo ? plan.planTier : null;

  const loadDemoPlan = useCallback(
    (tier: PlanTier) => {
      const bundles = buildDemoPlan(tier, today || new Date().toISOString().slice(0, 10));
      const ids = bundles.map((b) => b.company.id);
      // Never query the real sources or Supabase for demo companies.
      for (const id of ids) autoChecked.current.add(id);
      setRemote((all) => ({ ...all, ...Object.fromEntries(ids.map((id) => [id, null])) }));
      setRemoteHistory((all) => ({ ...all, ...Object.fromEntries(ids.map((id) => [id, []])) }));
      setCompanies((list) => [...list.filter((c) => !isDemoCompanyId(c.id)), ...bundles.map((b) => b.company)]);
      setWorkspaces((all) => {
        const rest = Object.fromEntries(Object.entries(all).filter(([id]) => !isDemoCompanyId(id)));
        for (const d of bundles) {
          rest[d.company.id] = {
            ...EMPTY_WORKSPACE,
            uploads: d.uploads,
            quiz: d.quiz,
            investment: d.investment,
            legal: d.legal,
            official: d.official,
            visited: ["onboarding", "quiz", "analiza", "investitie", "profil"],
            quizDone: true,
            investmentDone: true,
            step2Done: true,
            demo: true,
          };
        }
        return rest;
      });
      setPlans((all) => ({
        ...Object.fromEntries(Object.entries(all).filter(([id]) => !isDemoCompanyId(id))),
        ...Object.fromEntries(ids.map((id) => [id, { planTier: tier, billingCycle: DEFAULT_BILLING }])),
      }));
      setUpgradePrompt(null);
      setPendingDraft(null);
      switchCompany(ids[0]);
    },
    [today, switchCompany],
  );

  const startNewCompany = useCallback(() => {
    setCompanies((list) => list.filter((c) => !isDemoCompanyId(c.id)));
    setWorkspaces((all) => {
      const rest = Object.fromEntries(Object.entries(all).filter(([id]) => !isDemoCompanyId(id)));
      delete rest[""];
      return rest;
    });
    setPlans((all) => Object.fromEntries(Object.entries(all).filter(([id]) => !isDemoCompanyId(id))));
    setPendingDraft(null);
    switchCompany("");
  }, [switchCompany]);

  const assessCompany = useCallback(
    (id: string): Assessment | null => {
      const c = companies.find((x) => x.id === id);
      if (!c) return null;
      const w = workspaces[id] ?? EMPTY_WORKSPACE;
      const cLegal = applyCnpToLegal(w.legal, c.ceoCnpInfo && c.ceoCnpMasked ? { ...c.ceoCnpInfo, masked: c.ceoCnpMasked } : null, rescoreLegal, courtCounties);
      const cOfficial = withLegal(w.official ?? emptyRealData(c.cui, ""), cLegal);
      const cVerification = scoreRealData(cOfficial, cLegal, { companyId: c.id, companyName: c.officialName || c.name, ceoName: c.ceoName });
      const cInvoices = mergeInvoices(remote[id] ?? [], w.uploads);
      return computeAssessment({ company: c, invoices: cInvoices, quiz: w.quiz, investment: w.investment, legal: cLegal, verification: cVerification, today });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lang: regenerate the texts in the new language
    [companies, workspaces, remote, today, lang],
  );

  const canAddCompany = useMemo(
    () => canAddCompanyFor(plan.planTier, companies.filter((c) => isDemoCompanyId(c.id) === isDemo).length),
    [plan.planTier, companies, isDemo],
  );

  const value: Ctx = {
    company,
    companies,
    activeCompanyId: company.id,
    switchCompany,
    saveCompany,
    setCompany,
    dataset,
    supabase,
    invoices,
    uploads,
    quiz,
    setQuiz,
    investment,
    setInvestment,
    quizCompleted,
    completeQuiz,
    legal,
    legalLoading,
    runLegalCheck,
    official,
    verification,
    verificationLoading,
    runMultiSourceCheck,
    pendingDraft,
    setPendingDraft,
    docs,
    toggleDoc,
    doneActions,
    toggleAction,
    history,
    setCaseVerdict,
    assessment,
    uploadXml,
    lastUploadResults,
    persistMessage,
    resetUploads,
    resetAll,
    toast,
    dismissToast,
    visited,
    markVisited,
    hydrated,
    plan,
    setPlan,
    upgradePrompt,
    showUpgrade,
    closeUpgrade,
    payPerUse,
    unlockPayPerUse,
    snapshots,
    saveSnapshot,
    today,
    completedSteps,
    confirmStep2,
    isDemo,
    demoPlan,
    loadDemoPlan,
    startNewCompany,
    assessCompany,
    canAddCompany,
  };

  return <AssessmentContext.Provider value={value}>{children}</AssessmentContext.Provider>;
}
