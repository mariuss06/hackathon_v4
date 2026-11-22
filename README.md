# Credit Ready — Challenge 2 (BCR)

Platformă de evaluare „Credit Readiness” pentru IMM-uri din România: transformă datele e-Factura (istoric sintetic pe 12 luni + XML-uri UBL 2.1 încărcate live) într-un profil de eligibilitate explicat pe piloni și un plan de acțiune pe 30–90 de zile.

> **Ghid de pregătire, nu aprobare bancară.** Toate datele sunt sintetice (firmă fictivă: *Nord Fresh Distribuție SRL*, CAEN 4639). Formula este publică (vezi mai jos și pagina „Profil → Cum calculăm”).

Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind CSS v4 · Supabase (opțional) · fast-xml-parser · lucide-react.

## Rulare locală

```bash
npm install
npm run dev          # http://localhost:3000 → pagina de home (landing)
npm test             # 53 de teste: formule BCR, quiz, parser UBL, multi-firmă, motor bănci, analiză juridică
npm run build        # verificare TypeScript + build de producție
```

Fără nicio configurare aplicația rulează în **mod local** (date sintetice generate determinist, toate firmele și evaluările lor în `localStorage`, cheia `credit-ready-v4`).

### Cu Supabase (persistență)

1. Creează un proiect Supabase → SQL Editor → rulează `supabase/schema.sql`, apoi `supabase/seed.sql`. Pe o bază v2 existentă, `schema.sql` face și upgrade-ul (CUI/CAEN devin opționale, apar `name_key`, `sector`, `legal_checks`), fără să șteargă nimic.
2. Copiază `.env.example` în `.env.local` și completează `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
3. `npm run dev` — bara laterală arată „Supabase live”. Firmele noi se salvează în `companies` (cu istoric sintetic de 12 luni atașat), facturile XML în `e_invoices` pe `company_id`-ul firmei active, verificările portal.just.ro în `legal_checks`, iar „Salvează evaluarea” scrie în `assessments` (scorul se recalculează pe server, doar pe facturile acelei firme).

`supabase/seed.sql` se regenerează cu `npm run seed:sql` din același generator folosit de aplicație (`src/lib/data/synthetic.ts`), deci datele din DB și din modul local sunt identice.

## Demo pentru pitch (fișiere XML de test)

În `public/samples/` (și ca butoane cu un click în pasul 2):

| Fișier | Ce conține | Efect pe firma demo (după „Completează scenariul demo”, portal.just.ro neverificat) |
|---|---|---|
| `01_factura_normala.xml` | 380 · 18.450 RON către un client existent | 71,1 → 74,6: DSCR trece de 1,50× (sub-scor 80 → 100) |
| `02_factura_storno_381.xml` | **381 storno** · 85.000 RON (retur marfă) | 71,1 → 65,4: stornări 3 luni > 5% → −15 p la DSO, răspunsul „Nu” de la quiz devine greșit, reziliența în extrasezon scade |
| `03_factura_mare_concentrare.xml` | 380 · 750.000 RON către clientul #1 | 71,1 → 68,1: clientul #1 trece de 30% (concentrare 80 → 45), quiz Q1 picat, apare acțiunea „Diversifică portofoliul” |

Facturile se atașează **doar firmei active** (selectorul din header). Pentru o firmă fără CUI, direcția (emisă / primită) se stabilește după numele normalizat al firmei din `AccountingSupplierParty` / `AccountingCustomerParty`.

Fiecare upload actualizează automat analiza și graficul; scorul se vede doar în raportul final.

## Flow (4 pași)

1. **Date firmă, e-Factura & ANAF** (`/onboarding`) — datele firmei și ale administratorului (nume/CEO obligatorii, CUI și CAEN opționale, CNP mascat opțional), verificarea automată a surselor oficiale (ANAF, bilanț, VIES, ONRC, portal.just.ro), facturile e-Factura (SPV automat sau upload XML/ZIP) și cheltuielile fixe / ratele existente.
2. **Quiz cunoștințe firmă** (`/quiz`) — 5 întrebări despre cifrele firmei, verificate automat față de e-Factura. **Fără punctaj vizibil.**
3. **Analiză automată → Quiz investiție** — analiza datelor rulează automat în fundal (fără pagină separată), apoi 3 întrebări despre finanțare (`/investitie`): destinație, aport propriu, sumă solicitată.
4. **Analiză finală & scor** (`/profil`) — la final, într-un singur raport: analiza business (KPI, grafic pe 12 luni, sub-indicatori, clienți/furnizori, benchmark CAEN, simulatoare), scorul final explicat pe piloni, factorii care îl trag în jos, planul 30/60/90 de zile, recomandarea bancă, print/PDF și salvare în Supabase. **Scorul apare doar aici.**

În header: **Firmă activă / Istoric firme** — comuți între toate firmele salvate; fiecare își păstrează facturile, răspunsurile la quiz-uri, investiția și verificarea juridică.

## Formula

```
ScorFinal   = 0,70·S_Business + 0,15·S_Uman + 0,15·S_Investiție   (limitat 0–100)
S_Uman      = 0,50·Quiz + 0,50·PortalJust
S_Investiție= 0,50·Formular + 0,50·Benchmark sector
Kill-switch : Quiz ≤ 34 p → −10 p din ScorFinal (limitat 0–100) + alertă roșie
```

**S_Business** (din facturi, `src/lib/scoring.ts` + `src/lib/bcr-formulas.ts`):

| Sub-indicator | Pondere | Praguri |
|---|---|---|
| Stabilitatea încasărilor, CV = σ/μ pe 12 luni | 25% | < 0,15 → 100 · 0,15–0,30 → 75 · 0,30–0,50 → 45 · > 0,50 → 20 |
| Capacitate de rambursare: R = P·r(1+r)ⁿ/((1+r)ⁿ−1) la 9,5%/an, 60 luni; DSCR = EBITDA lunar / (rate existente + R) | 25% | ≥ 1,50 → 100 · 1,25–1,49 → 80 · 1,10–1,24 → 55 · 1,00–1,09 → 30 · < 1,00 → 0 |
| Comportament de plată: DSO real ponderat cu valoarea (fără date de încasare: DueDate − IssueDate) | 20% | ≤ 15 → 100 · 16–30 → 80 · 31–45 → 55 · 46–60 → 30 · > 60 → 10; stornări 381 > 5% (3 luni) → −15 p |
| Concentrarea veniturilor: ponderea clientului #1 | 15% | < 15% → 100 · 15–30% → 80 · 30–50% → 45 · > 50% → 15 |
| Sezonalitate & reziliență: marja din cele mai slabe 3 luni / (cheltuieli fixe + rate existente + R) | 15% | ≥ 1,25× → 100 · 1,10–1,24× → 80 · 1,00–1,09× → 60 · 0,85–0,99× → 35 · < 0,85× → 10 |

DSCR include și ratele existente (serviciul total al datoriei), ca în analiza de credit a băncii.

**Quiz** (100 p): Q1 CA 3 luni 35 p (≤10% / 20% / 35% abatere) · Q2 termen de plată 25 p · Q3 pondere client #1 20 p · Q4 furnizor principal 12 p · Q5 stornări >5% (cod 381) 8 p. Se re-validează la fiecare XML încărcat.

**portal.just.ro** (100 p): penalizare progresivă pe gravitate și rol (nivel 1 −3 p plafonat la 9, nivel 2 −8, nivel 3 −20, nivel 4 → 0). Dosarele unde firma e creditor/reclamant/victimă nu se penalizează; omonimele parțiale sunt excluse. Timeout → punctaj neutru 80 marcat „Fallback”.

**Benchmark**: DSO, concentrare, stornări, sezonalitate, marjă brută vs. p25/mediană/p75 pe sector (cuartila bună = 100, mediana = 60, cuartila slabă = 25). Sectorul vine din CAEN (`5610`/`56xx` → HoReCa, `46xx` → Distribuție, `62xx` → IT etc.), altfel din dropdown, altfel „General IMM”.

## Recomandare bancă (România)

`src/lib/bank-matcher.ts` + `src/components/BankRecommendationSection.tsx`: 9 pachete IMM (BCR investiții / capital de lucru / factoring, BT Mic și investiții, ING, Raiffeisen, CEC cu garanții de stat, UniCredit leasing). Procentul de potrivire combină ScorFinal, DSCR recalculat la termenii produsului, destinația, aportul, suma / CA, plus semnale specifice (DSO, concentrare, sezonalitate, volatilitate, mărime) și portal.just.ro. Suma maximă estimată = minimul dintre capacitatea de plată la covenant-ul DSCR, un procent din CA și un plafon orientativ (factoring: ~80% din creanțe). Sub 60 de puncte firma nu e „Credit Ready” și se recomandă întâi planul de 30–90 de zile. Recomandările sunt orientative, nu o ofertă fermă.

## Conectarea cu site-ul existent de quiz-uri

Linkul către platforma de quiz-uri nu a fost furnizat, așa că integrarea e făcută prin contract API, fără să depindă de codul ei:

- **Redirect**: site-ul extern trimite utilizatorul la `/onboarding?q1=2000000&q2=30&q3=15-30&q4=<furnizor>&q5=nu` (sau `?quiz=<base64 JSON QuizAnswers>`). Răspunsurile se importă automat.
- **Webhook**: `POST /api/quiz` cu `{ "companyId": "<uuid>" }` sau `{ "cui": "RO45127893" }` plus `"answers": { ... }` și header `x-quiz-secret` (dacă `QUIZ_WEBHOOK_SECRET` e setat). Se salvează în `assessments` (`quiz_source = 'external'`); butonul „Importă ultimul rezultat” îl aduce în platformă.
- `NEXT_PUBLIC_EXTERNAL_QUIZ_URL` activează butonul „Deschide quiz-ul extern” (adaugă `cui` și `return`).

```bash
curl -X POST http://localhost:3000/api/quiz -H "Content-Type: application/json" \
  -d '{"cui":"RO45127893","answers":{"revenueEstimate":2100000,"paymentTerm":"30","topClientShare":"15-30","mainSupplier":"Agroalim Distribuție SA","hasSignificantCreditNotes":false}}'
```

## Structură

| Zonă | Fișiere |
|---|---|
| Tipuri | `src/types/scoring.ts` |
| Date sintetice + benchmark | `src/lib/data/synthetic.ts` (istoric determinist per firmă), `src/lib/data/benchmarks.ts` (sectoare + mapare CAEN) |
| Identitate firmă (CUI opțional, nume normalizat) | `src/lib/company.ts` |
| Parser e-Factura UBL 2.1 / RO_CIUS | `src/lib/efactura/parser.ts` (Invoice + CreditNote, wrapper SPV) |
| Metrici din facturi | `src/lib/metrics.ts` |
| Formule BCR (praguri, anuitate, ponderi) | `src/lib/bcr-formulas.ts` |
| S_Business + formula finală | `src/lib/scoring.ts` |
| Motor de scor (pur) | `src/lib/scoringEngine.ts` (quiz, investiție, benchmark, analiză juridică; re-exportă `scoring.ts`) |
| Recomandare bancă | `src/lib/bank-matcher.ts` |
| Profil complet | `src/lib/assessment.ts` |
| Factori + plan 30–90 zile | `src/lib/action-plan.ts` |
| portal.just.ro | `src/app/actions/checkPortalJust.ts` (Server Action SOAP + simulare) |
| API | `src/app/api/{companies,dataset,invoices,assessments,legal-checks,quiz}/route.ts` |
| Supabase | `src/lib/supabase/server.ts`, `supabase/schema.sql`, `supabase/seed.sql`, `scripts/generate-seed.mts` |
| UI flux | `src/app/(flow)/{onboarding,quiz,investitie,profil}`, `src/components/steps/{OnboardingStep,QuizStep,InvestmentStep,ProfileStep}.tsx` |
| Home / landing | `src/app/page.tsx`, `src/components/home/*` |
| Shell & navigație (pași, gărzi, sidebar) | `src/components/Shell.tsx`, `src/lib/useHideScores.ts` |
| Analiza afișată doar în raportul final | `src/components/steps/AnalysisStep.tsx` — exportă `AnalysisBody` + `UploadPanel` |
| Restul UI | `src/app/(flow)/*`, `src/components/*` |

`legacy-mvp/` conține componentele MVP-ului anterior (UI neumorfic întunecat), păstrate pentru referință și excluse din build.

## Licență

Distribuit sub licența [MIT](LICENSE). Poți folosi, modifica și redistribui codul, cu păstrarea textului licenței.
