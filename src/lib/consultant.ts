/**
 * What a credit consultant adds on top of the score: the right financing instrument, the questions the bank
 * will ask (with what to prepare), and the documents of the credit file. Pure functions over the assessment
 * and the REAL inputs (uploaded invoices, declared debts, official balance sheet, portal.just.ro).
 */
import type { Assessment } from "./assessment.ts";
import type { Company, InvestmentInput, LegalCheckResult } from "../types/scoring";
import { annuityInstallment, LOAN_ANNUAL_RATE, LOAN_MONTHS, principalForInstallment } from "./bcr-formulas.ts";
import { effectiveDebtService } from "./company.ts";
import { netResult, type BilantYear } from "./real-company-sources.ts";
import { num, pct, ron } from "./util.ts";
import { tr } from "./i18n/tr.ts";

export interface ConsultantInput {
  company: Company;
  investment: InvestmentInput;
  legal: LegalCheckResult | null;
  /** Filed balance sheets, newest first (may be empty). */
  bilant: BilantYear[];
  /** Firm age in months from the ONRC record (null = unknown). */
  ageMonths: number | null;
}

export const TARGET_DSCR = 1.25;

/** Largest loan the firm can carry at DSCR 1.25 with the chosen term (0 without invoices / declared costs). */
export function sustainableAmount(a: Assessment, input: ConsultantInput) {
  if (!a.dataStatus.hasInvoices || !a.dataStatus.financialsDeclared) return 0;
  const term = input.investment.termMonths ?? LOAN_MONTHS;
  const maxInstallment = Math.max(0, a.metrics.operatingCashFlow / TARGET_DSCR - effectiveDebtService(input.company));
  return Math.floor(principalForInstallment(maxInstallment, LOAN_ANNUAL_RATE, term) / 1000) * 1000;
}

export interface FinancingInstrument {
  id: string;
  title: string;
  why: string;
  fit: "recomandat" | "de luat în calcul";
}

export function financingInstruments(a: Assessment, input: ConsultantInput): FinancingInstrument[] {
  const m = a.metrics;
  const inv = input.investment;
  const out: FinancingInstrument[] = [];
  const [y] = input.bilant;
  const amount = inv.requestedAmount ?? 0;
  const collateral = inv.collateral;
  const coverage = amount > 0 && collateral && collateral.kind !== "fara" ? collateral.value / amount : 0;

  if (y && y.capitaluriProprii < 0) {
    out.push({
      id: "equity",
      title: tr("Majorare de capital sau conversia împrumuturilor de la asociați"),
      why: tr("Capitalurile proprii sunt negative în bilanțul {a}. Înainte de orice credit, aducerea capitalului pe plus este de regulă condiție de eligibilitate.", { a: y.an }),
      fit: "recomandat",
    });
  }
  if (inv.purpose === "growth") {
    out.push({
      id: "leasing",
      title: tr("Leasing financiar pentru echipamente / vehicule"),
      why: tr("Bunul finanțat este chiar garanția, aprobarea e de obicei mai rapidă decât la un credit de investiții, iar avansul se negociază."),
      fit: coverage < 1 ? "recomandat" : "de luat în calcul",
    });
  }
  if (a.dataStatus.hasInvoices && m.dsoDays > 45) {
    out.push({
      id: "factoring",
      title: tr("Factoring pe facturile emise"),
      why: tr("Încasezi în medie în {a} zile. Factoringul transformă facturile neîncasate în lichiditate fără să crească gradul de îndatorare pe termen lung.", { a: num(m.dsoDays) }),
      fit: "recomandat",
    });
  }
  if (inv.purpose === "working_capital" || (a.dataStatus.hasInvoices && (m.seasonalityRatio > 1.6 || a.business.resilience.ratio < 1))) {
    out.push({
      id: "credit_line",
      title: tr("Linie de credit pentru capital de lucru"),
      why:
        a.dataStatus.hasInvoices && m.seasonalityRatio > 1.6
          ? tr("Luna cea mai bună are de {a}× vânzările celei mai slabe: o linie reînnoibilă acoperă golurile sezoniere mai ieftin decât un credit pe termen lung.", { a: num(m.seasonalityRatio) })
          : tr("Pentru stocuri, salarii și furnizori, o linie reînnoibilă se plătește doar cât e folosită."),
      fit: inv.purpose === "working_capital" ? "recomandat" : "de luat în calcul",
    });
  }
  if (amount > 0 && coverage < 1) {
    out.push({
      id: "guarantee_fund",
      title: tr("Garanție de la un fond de garantare (FNGCIMM / FGCR)"),
      why: tr("Garanțiile oferite acoperă {a}% din suma cerută. Un fond de garantare poate acoperi o parte din credit, contra unui comision.", { a: num(Math.round(coverage * 100)) }),
      fit: "recomandat",
    });
  }
  out.push({
    id: "grants",
    title: tr("Fonduri nerambursabile și programe de stat pentru IMM"),
    why: tr("Verifică apelurile deschise pe site-urile oficiale ale programelor pentru IMM și fondurilor europene: o parte din investiție poate fi acoperită fără rambursare, iar creditul devine mai mic."),
    fit: "de luat în calcul",
  });
  if (out.every((i) => i.id === "grants")) {
    out.unshift({
      id: "term_loan",
      title: tr("Credit de investiții / pentru dezvoltare"),
      why: tr("Indicatorii nu cer un instrument special: un credit clasic, cu rata și durata din simulator, este varianta de bază."),
      fit: "recomandat",
    });
  }
  return out;
}

export interface BankQuestion {
  q: string;
  prep: string;
}

/** The questions a credit analyst will ask given THIS profile, with what to prepare. */
export function bankQuestions(a: Assessment, input: ConsultantInput): BankQuestion[] {
  const m = a.metrics;
  const inv = input.investment;
  const out: BankQuestion[] = [
    {
      q: tr("Pentru ce sunt banii și cum generează investiția banii pentru rate?"),
      prep: tr("Ofertele / facturile proforma, calculul randamentului și proiecția de cash-flow din simulator (scenariul de bază și cel cu vânzări −20%)."),
    },
  ];
  const [y, prev] = input.bilant;
  if (y && netResult(y) < 0) out.push({ q: tr("De ce firma a avut pierdere în {a}?", { a: y.an }), prep: tr("Explicația punctuală (investiție, an atipic, cost unic) și balanța din anul curent care arată revenirea pe profit.") });
  if (y && prev && prev.cifraAfaceri > 0 && y.cifraAfaceri < prev.cifraAfaceri * 0.8) {
    out.push({ q: tr("De ce a scăzut cifra de afaceri în {a}?", { a: y.an }), prep: tr("Clienții pierduți / câștigați, contractele noi și facturile din ultimele luni care arată tendința actuală.") });
  }
  if (y && a.dataStatus.hasInvoices && y.cifraAfaceri > 0 && Math.abs(m.annualizedRevenue - y.cifraAfaceri) / y.cifraAfaceri > 0.25) {
    out.push({
      q: tr("De ce cifra de afaceri din facturi diferă de cea din bilanț?"),
      prep: tr("Facturile încărcate dau {a}/an, bilanțul {b}. Pregătește extrasele de cont și, la vânzările cu bon fiscal, rapoartele Z.", { a: ron(m.annualizedRevenue), b: ron(y.cifraAfaceri) }),
    });
  }
  if (a.dataStatus.hasInvoices && m.topClientSharePct > 30) {
    out.push({
      q: tr("Ce se întâmplă dacă pierdeți clientul {a} ({b} din vânzări)?", { a: m.topClients[0]?.name ?? "principal", b: pct(m.topClientSharePct) }),
      prep: tr("Contractul cu clientul (durată, clauze de reziliere), istoricul colaborării și lista clienților noi în discuție."),
    });
  }
  if (a.dataStatus.hasInvoices && m.dsoDays > 45) {
    out.push({ q: tr("De ce încasați în medie în {a} de zile?", { a: num(m.dsoDays) }), prep: tr("Lista creanțelor pe vechime (aging), termenele din contracte și ce faci pentru clienții care plătesc târziu.") });
  }
  if (a.dataStatus.hasInvoices && m.creditNotesSharePct3m > 5) {
    out.push({ q: tr("De ce ați stornat {a} din facturi în ultimele 3 luni?", { a: pct(m.creditNotesSharePct3m) }), prep: tr("Motivul fiecărei stornări mari (retur, eroare, discount) și dovada că problema e rezolvată.") });
  }
  if (a.dataStatus.hasInvoices && a.dataStatus.financialsDeclared && a.business.dscr < TARGET_DSCR) {
    out.push({
      q: tr("Cum veți plăti rata dacă cash-flow-ul acoperă ratele de doar {a} ori?", { a: num(a.business.dscr) }),
      prep: tr("O sumă mai mică (vezi „suma pe care firma o poate susține”), o durată mai lungă, aport propriu mai mare sau venituri noi contractate."),
    });
  }
  for (const d of input.company.debts ?? []) {
    if (d.daysLate > 0) out.push({ q: tr("Ce s-a întâmplat cu întârzierea de {a} zile la {b}?", { a: d.daysLate, b: d.lender }), prep: tr("Dovada plății la zi (sau planul de regularizare) și explicația scrisă a întârzierii.") });
  }
  const counted = input.legal && !input.legal.isFallback ? input.legal.cases.filter((c) => c.severity > 0 && c.userVerdict !== "contestat") : [];
  if (counted.length > 0) {
    out.push({ q: tr("Ce sunt cele {a} dosare din portal.just.ro?", { a: counted.length }), prep: tr("Pentru fiecare: stadiul, suma în litigiu și hotărârea sau tranzacția. Pentru omonimi, o declarație că nu ești parte.") });
  }
  if (input.ageMonths !== null && input.ageMonths < 24) {
    out.push({ q: tr("Firma are doar {a} luni. Ce experiență are administratorul în domeniu?", { a: input.ageMonths }), prep: tr("CV-ul administratorului, contractele semnate și, eventual, un garant sau o garanție de la un fond de garantare.") });
  }
  if (inv.ownContributionPct !== null && inv.ownContributionPct < 10) {
    out.push({ q: tr("De ce aportul propriu este sub 10%?"), prep: tr("Sursa aportului (profit reinvestit, aport asociați) sau o garanție suplimentară care compensează.") });
  }
  return out;
}

export interface CreditDocument {
  id: string;
  label: string;
  where: string;
  /** Only when this condition holds (e.g. real-estate collateral). */
  when?: (input: ConsultantInput) => boolean;
}

export const CREDIT_DOCUMENTS: CreditDocument[] = [
  { id: "onrc", label: "Certificat constatator ONRC (recent)", where: "ONRC — online pe portalul ONRC sau la ghișeu" },
  { id: "statut", label: "Act constitutiv actualizat", where: "ONRC / arhiva firmei" },
  { id: "bilant", label: "Bilanțurile și conturile de profit și pierdere pe ultimii 2 ani", where: "Contabil; recipisa de depunere ANAF" },
  { id: "balanta", label: "Balanța de verificare din ultima lună încheiată", where: "Contabil" },
  { id: "atestare", label: "Certificat de atestare fiscală ANAF (fără datorii)", where: "SPV ANAF" },
  { id: "fiscal_local", label: "Certificat fiscal local (taxe la primărie)", where: "Primăria sediului / ghiseul.ro" },
  { id: "extrase", label: "Extrase de cont pe ultimele 6–12 luni", where: "Internet banking" },
  { id: "crc", label: "Raport CRC (BNR) / Biroul de Credit", where: "Gratuit, la orice bancă sau la BNR" },
  { id: "contracte", label: "Contractele principale cu clienții și furnizorii", where: "Arhiva firmei" },
  { id: "plan", label: "Plan de afaceri și proiecția de cash-flow pentru investiție", where: "Simulatorul din Pasul 3 + contabil" },
  { id: "oferte", label: "Oferte / facturi proforma pentru investiție", where: "Furnizorii investiției", when: (i) => (i.investment.requestedAmount ?? 0) > 0 },
  {
    id: "garantii",
    label: tr("Acte de proprietate și raport de evaluare ANEVAR pentru garanție"),
    where: "Notar / evaluator autorizat ANEVAR",
    when: (i) => i.investment.collateral?.kind === "imobil" || i.investment.collateral?.kind === "echipament",
  },
  { id: "identitate", label: "Actele de identitate ale administratorului și asociaților", where: "—" },
];

export const documentsFor = (input: ConsultantInput) => CREDIT_DOCUMENTS.filter((d) => !d.when || d.when(input));

/** One-paragraph conclusion, or why there is none yet. */
export function consultantConclusion(a: Assessment, input: ConsultantInput) {
  if (!a.final.complete) return { ready: false, text: tr("Concluzia apare după ce completezi: {a}.", { a: (a.final.missing ?? []).join("; ") }) };
  const requested = input.investment.requestedAmount ?? 0;
  const sustainable = sustainableAmount(a, input);
  const term = input.investment.termMonths ?? LOAN_MONTHS;
  const parts = [tr("Scor {s}/100 ({st}).", { s: num(a.final.finalScore), st: tr(a.final.status) })];
  if (requested > 0) {
    parts.push(
      sustainable >= requested
        ? tr("Suma cerută de {a} este susținută de cash-flow (rată {b}/lună pe {c} luni).", { a: ron(requested), b: ron(annuityInstallment(requested, LOAN_ANNUAL_RATE, term)), c: term })
        : tr("Suma cerută de {a} depășește ce poate susține firma; recomandăm cel mult {b} pe {c} luni sau completarea cu aport propriu / garanții.", { a: ron(requested), b: ron(sustainable), c: term }),
    );
  } else {
    parts.push(tr("Firma poate susține un credit de până la {a} pe {b} luni la DSCR {c}×.", { a: ron(sustainable), b: term, c: num(TARGET_DSCR) }));
  }
  if (a.final.warnings.length) parts.push(tr("De rezolvat înainte de depunere: {a} semnal(e) din profil.", { a: a.final.warnings.length }));
  return { ready: true, text: parts.join(" ") };
}
