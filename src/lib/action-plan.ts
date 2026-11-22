/**
 * What pulls the score down (drivers) and the 30-90 day action plan, generated from the
 * weaknesses detected in the assessment. Pure functions, re-run on every change.
 */
import type { ActionItem, ScoreDriver } from "../types/scoring";
import type { Assessment, AssessmentInput } from "./assessment.ts";
import { CREDIT_NOTE_THRESHOLD_PCT } from "./scoringEngine.ts";
import { num, pct, ron, round1 } from "./util.ts";
import { tr } from "./i18n/tr.ts";

/** Everything the plan needs from the assessment (drivers, plan and bank matches excluded). */
export type Core = Omit<Assessment, "drivers" | "plan" | "banks">;

// ---------------------------------------------------------------------------
// What pulls the score down: points of the FINAL score lost on each factor
// ---------------------------------------------------------------------------

export function computeDrivers(a: Core, input: AssessmentInput): ScoreDriver[] {
  const drivers: ScoreDriver[] = a.business.items.map((i) => ({
    id: i.id,
    label: i.label,
    pillar: "Business",
    lostPoints: round1((100 - i.score) * i.weight * 0.7),
    detail: i.value,
  }));
  drivers.push({
    id: "quiz",
    label: "Cunoașterea cifrelor (Quiz)",
    pillar: "Factor uman",
    lostPoints: round1((100 - a.quiz.total) * 0.075 + (a.final.quizKillSwitch ? 10 : 0)),
    detail: `${a.quiz.total}/100 · ${tr(a.quiz.levelLabel)}${a.final.quizKillSwitch ? " · kill-switch -10 p" : ""}`,
  });
  drivers.push({
    id: "legal",
    label: "Verificare portal.just.ro",
    pillar: "Factor uman",
    lostPoints: a.legalScore === null ? 0 : round1((100 - a.legalScore) * 0.075),
    detail: a.legalScore !== null && input.legal ? tr("{s}/100 · {n} dosare relevante", { s: a.legalScore, n: input.legal.totalFound }) : tr("neverificat — nu intră în scor până la un răspuns al portalului"),
  });
  drivers.push({
    id: "investment",
    label: "Calitatea cererii de finanțare",
    pillar: "Investiție",
    lostPoints: round1((100 - a.investment.total) * 0.075),
    detail: tr("{s}/100 · sumă = {p} din CA anualizată", { s: a.investment.total, p: pct(a.investment.leverageRatio * 100) }),
  });
  drivers.push({
    id: "benchmark",
    label: "Poziționare față de sector",
    pillar: "Investiție",
    lostPoints: round1((100 - a.benchmark.score) * 0.075),
    detail: tr("{s}/100 vs. mediana CAEN {c}", { s: a.benchmark.score, c: a.benchmark.sector.caenCode }),
  });
  return drivers.filter((d) => d.lostPoints >= 0.5).sort((x, y) => y.lostPoints - x.lostPoints);
}

// ---------------------------------------------------------------------------
// 30-90 day action plan, generated from detected weaknesses
// ---------------------------------------------------------------------------

const PRIORITY_RANK = { critică: 0, ridicată: 1, medie: 2 } as const;

export function buildActionPlan(a: Core, input: AssessmentInput): ActionItem[] {
  const m = a.metrics;
  const sub = Object.fromEntries(a.business.items.map((i) => [i.id, i]));
  /** Final-score points recovered if the sub-score regains `share` of what it lost. */
  const gain = (id: keyof typeof sub, share: number) => round1((100 - sub[id].score) * sub[id].weight * 0.7 * share);
  const actions: ActionItem[] = [];

  if (a.final.quizKillSwitch || a.quiz.total < 60) {
    actions.push({
      id: "quiz",
      title: "Instituie o rutină lunară de control financiar",
      why: tr("Quiz-ul financiar are {q}/100 ({l}). Banca verifică dacă managementul își cunoaște cifrele.", { q: a.quiz.total, l: tr(a.quiz.levelLabel) }),
      steps: [
        "Programează în prima zi lucrătoare a lunii o revizie de 30 de minute cu contabilul: vânzări, încasări, top 5 clienți.",
        "Exportă lunar raportul e-Factura din SPV și compară-l cu extrasele bancare.",
        "Refă quiz-ul după 30 de zile pentru a reconfirma controlul financiar.",
      ],
      horizon: 30,
      priority: a.final.quizKillSwitch ? "critică" : "ridicată",
      impactPoints: round1((60 - a.quiz.total) * 0.075 + (a.final.quizKillSwitch ? 10 : 0)),
    });
  }

  if (a.investment.overLeveragedRequest) {
    const target = m.annualizedRevenue * 0.25;
    actions.push({
      id: "amount",
      title: "Redimensionează sau etapizează suma solicitată",
      why: tr("Suma cerută ({a}) depășește 50% din CA anualizată ({r}).", { a: ron(input.investment.requestedAmount ?? 0), r: ron(m.annualizedRevenue) }),
      steps: [
        tr("Împarte investiția în etape; prima tranșă recomandată: max. {t} (25% din CA).", { t: ron(target) }),
        "Analizează leasing pentru echipamente în locul creditului clasic.",
        "Atașează la cerere un buget pe etape cu venituri suplimentare estimate.",
      ],
      horizon: 30,
      priority: "critică",
      impactPoints: round1(20 * 0.075 + gain("repayment", 0.5)),
    });
  }

  if (input.legal?.integrityKillSwitch || (input.legal && input.legal.legalScore < 80)) {
    actions.push({
      id: "legal",
      title: "Clarifică dosarele din portal.just.ro",
      why: tr("Verificarea juridică are {s}/100 ({n} dosare relevante).", { s: input.legal.legalScore, n: input.legal.totalFound }),
      steps: [
        "Pregătește pentru bancă o notă explicativă pe fiecare dosar activ (stadiu, sumă, provizion).",
        "Închide prin tranzacție litigiile comerciale mici, unde e posibil.",
        "Obține certificat de atestare fiscală (ANAF) fără datorii restante.",
      ],
      horizon: 60,
      priority: input.legal.integrityKillSwitch ? "critică" : "ridicată",
      impactPoints: round1((100 - input.legal.legalScore) * 0.075 * 0.6),
    });
  }

  if (m.topClientSharePct > 30) {
    actions.push({
      id: "concentration",
      title: "Diversifică portofoliul de clienți",
      why: `${tr("{c} generează {p} din vânzări", { c: m.topClients[0]?.name ?? "—", p: pct(m.topClientSharePct) })}${m.topClientSharePct > 50 ? tr(" — dependență critică") : ""}.`,
      steps: [
        "Țintește 3 clienți noi din același segment (HoReCa / retail regional) în următoarele 90 de zile.",
        "Semnează contract-cadru cu clientul principal (volume minime, termen 12 luni) ca să reduci riscul de pierdere bruscă.",
        tr("Obiectiv: clientul #1 sub 30% din vânzări (acum {p}).", { p: pct(m.topClientSharePct) }),
      ],
      horizon: 90,
      priority: m.topClientSharePct > 50 ? "critică" : "ridicată",
      impactPoints: gain("concentration", 0.5),
    });
  }

  if (m.dsoDays > 45 || m.lateSharePct > 15 || m.overdueAmount > 0) {
    actions.push({
      id: "collections",
      title: "Accelerează încasările și recuperează restanțele",
      why: tr("DSO {d} zile, {l} din valoare încasată cu întârziere, {o} restante la {a}.", { d: num(m.dsoDays), l: pct(m.lateSharePct), o: ron(m.overdueAmount), a: m.asOf }),
      steps: [
        "Trimite remindere automate la scadență, +7 și +15 zile; oprește livrările la clienții cu restanțe > 30 zile.",
        "Oferă 1–2% discount pentru plata în 7 zile clienților mari.",
        m.overdueAmount > 0 ? "Negociază un grafic de plată pentru restanțele existente sau cedează creanțele (factoring)." : "Evaluează factoringul pentru facturile cu termen de 45+ zile.",
      ],
      horizon: m.dsoDays > 45 ? 30 : 60,
      priority: m.dsoDays > 45 ? "ridicată" : "medie",
      impactPoints: gain("payments", 0.5),
    });
  }

  if (a.business.dscr < 1.25) {
    actions.push({
      id: "dscr",
      title: "Crește marja de acoperire a ratelor (DSCR)",
      why: tr("DSCR estimat {d}× — sub covenant-ul de 1,25× folosit de BCR pentru creditele de investiții.", { d: num(a.business.dscr) }),
      steps: [
        "Cere o perioadă de grație sau o maturitate mai lungă pentru creditul nou.",
        "Renegociază prețurile cu furnizorii principali pentru +1–2 pp marjă.",
        "Amână cheltuielile fixe neesențiale până după aprobare.",
      ],
      horizon: 60,
      priority: a.business.dscr < 1 ? "critică" : "ridicată",
      impactPoints: gain("repayment", 0.5),
    });
  }

  if (m.creditNotesSharePct3m > CREDIT_NOTE_THRESHOLD_PCT) {
    actions.push({
      id: "storno",
      title: "Redu stornările (facturi 381)",
      why: tr("Stornările reprezintă {p} din facturare în ultimele 3 luni (prag: 5%).", { p: pct(m.creditNotesSharePct3m) }),
      steps: [
        "Identifică primele 3 cauze de retur (calitate, erori de comandă, preț) și asignează un responsabil.",
        "Verifică comenzile mari înainte de facturare (dublă confirmare).",
      ],
      horizon: 60,
      priority: "medie",
      impactPoints: round1((a.benchmark.items.find((i) => i.id === "storno")?.score ?? 100) < 60 ? 1.5 : 0.8),
    });
  }

  const res = a.business.resilience;
  if (res.ratio < 1.1 || m.seasonalityRatio > 1.6 || m.revenueCv > 0.15) {
    const gap = Math.max(0, res.monthlyObligations - res.weakMonthsMargin);
    actions.push({
      id: "seasonality",
      title: "Pregătește lunile slabe: buffer de lichiditate",
      why: tr("În lunile slabe marja ({g}/lună) acoperă {r}× obligațiile de {o}/lună; vânzările variază de {s}× între vârf și minim.", { g: ron(res.weakMonthsMargin), r: num(res.ratio), o: ron(res.monthlyObligations), s: num(m.seasonalityRatio) }),
      steps: [
        gap > 0
          ? tr("Constituie înainte de extrasezon o rezervă de cel puțin {v} (deficitul lunar × 3 luni slabe).", { v: ron(gap * 3) })
          : "Constituie o rezervă de cash egală cu 1 lună de cheltuieli fixe înainte de lunile slabe.",
        "Solicită o linie de capital de lucru sezonieră în locul acoperirii din cash-ul curent.",
        "Negociază cu banca un grafic de rambursare cu rate mai mici în lunile de extrasezon.",
      ],
      horizon: 90,
      priority: res.ratio < 0.85 ? "ridicată" : "medie",
      impactPoints: round1(gain("seasonality", 0.3) + gain("stability", 0.3)),
    });
  }

  if ((input.investment.ownContributionPct ?? 0) < 10) {
    actions.push({
      id: "own",
      title: "Mărește aportul propriu la minimum 10–20%",
      why: "Un avans sub 10% transferă aproape tot riscul către bancă.",
      steps: ["Planifică reținerea profitului din următoarele luni pentru avans.", "Verifică eligibilitatea pentru garanții FNGCIMM / programe de stat."],
      horizon: 60,
      priority: "medie",
      impactPoints: round1(15 * 0.075),
    });
  }

  if (input.investment.purpose === "refinancing") {
    actions.push({
      id: "purpose",
      title: "Reformulează cererea către o investiție productivă",
      why: "Refinanțarea sau acoperirea golurilor de lichiditate primește cel mai mic punctaj la destinație.",
      steps: ["Leagă finanțarea de un proiect măsurabil (echipament, capacitate nouă) cu venituri estimate."],
      horizon: 30,
      priority: "medie",
      impactPoints: round1(40 * 0.075),
    });
  }

  // Always useful when few weaknesses were detected.
  const fillers: ActionItem[] = [
    {
      id: "dossier",
      title: "Pregătește dosarul de credit",
      why: "Profilul este solid; un dosar complet scurtează analiza băncii.",
      steps: ["Situațiile financiare 2025 depuse, balanța ultimei luni, extrase bancare pe 6 luni.", "Certificat ANAF fără datorii, CI administrator, act constitutiv actualizat."],
      horizon: 30,
      priority: "medie",
      impactPoints: 0,
    },
    {
      id: "spv",
      title: "Sincronizează lunar e-Factura cu platforma",
      why: "Datele la zi mențin scorul actualizat și credibil în fața băncii.",
      steps: ["Încarcă XML-urile din SPV la fiecare închidere de lună.", "Urmărește evoluția scorului înainte de depunerea cererii."],
      horizon: 30,
      priority: "medie",
      impactPoints: 0,
    },
    {
      id: "monitor",
      title: "Monitorizează concentrarea și încasările lunar",
      why: "Doi indicatori care se pot degrada rapid și pe care banca îi urmărește după acordare.",
      steps: ["Alertă internă dacă un client depășește 30% din vânzări sau DSO crește peste 45 de zile."],
      horizon: 60,
      priority: "medie",
      impactPoints: 0,
    },
  ];

  actions.sort((x, y) => PRIORITY_RANK[x.priority] - PRIORITY_RANK[y.priority] || y.impactPoints - x.impactPoints);
  const plan = actions.slice(0, 5);
  for (const f of fillers) if (plan.length < 3) plan.push(f);
  return plan;
}
