# Raport QA — Credit Ready (BCR Challenge 2)

Data: 21.11.2026 · Verificat pe `http://localhost:3001` (next dev) și cu testele din repo.

## 1. Rezumat

| Verificare | Rezultat |
|---|---|
| `npm test` (18 teste: formulă, quiz, parser UBL, upload demo, analiză juridică) | 18/18 trec |
| `npx tsc --noEmit` (TypeScript) | fără erori |
| `npx eslint src` | fără erori |
| portal.just.ro live, firma „LucPROMPT SRL” + administratorul „Hus Antonio” | merge: 0 dosare pe numele exact, 1 omonim parțial exclus, scor legal 100/100 |
| portal.just.ro simulat, scenariul „Mai multe dosare” | merge: 5 dosare (2 pe firmă, 3 pe administrator), scor legal 66/100, calcul corect |

**Concluzie:** aplicația funcționează cap-coadă. **Actualizare 21.11, 15:40:** cardul portal.just.ro are acum **două rapoarte separate, „Firmă” și „Administrator”**, fiecare cu numărul lui de dosare, punctele scăzute și un scor parțial din 100. Scorul legal total, cel care intră în formulă, nu s-a schimbat. Detalii în secțiunea 3.

---

## 2. Cum funcționează proiectul

### 2.1 Ce face
Aplicația evaluează cât de pregătită e o firmă mică (IMM) să ia un credit. Pornește de la facturile e-Factura (un istoric sintetic de 12 luni, plus fișiere XML pe care le poți încărca live) și dă un scor 0–100, explicat pe piloni, plus un plan de acțiune pe 30–90 de zile. Este un ghid de pregătire, nu o aprobare bancară.

Tehnologii: Next.js 16, TypeScript, Tailwind v4, Supabase (opțional), fast-xml-parser.

### 2.2 Cei 4 pași (meniul din stânga)

| Pas | Pagina | Ce vezi / ce faci | Fișier |
|---|---|---|---|
| 1 | **Firmă & factor uman** (`/onboarding`) | Date firmă (nume, CUI, CAEN, administrator) · **verificarea portal.just.ro** · quiz de 5 întrebări | `src/components/steps/OnboardingStep.tsx`, `src/components/LegalPanel.tsx` |
| 2 | **Analiză business & e-Factura** (`/analiza`) | KPI-uri, grafic pe 12 luni, cele 5 sub-scoruri, top clienți/furnizori, upload XML | `src/components/steps/AnalysisStep.tsx` |
| 3 | **Investiție & sector** (`/investitie`) | Scopul creditului, avans, sumă, rată și DSCR estimate, comparație cu sectorul CAEN | `src/components/steps/InvestmentStep.tsx` |
| 4 | **Profil Credit Ready & plan** (`/profil`) | Scor final cu formula completată, factorii care trag scorul în jos, plan 30/60/90 zile, Printează/PDF, Salvează în Supabase | `src/components/steps/ProfileStep.tsx` |

Bara din stânga arată tot timpul **scorul live** și pilonii; în josul ei apare starea portal.just.ro (Live / Simulat / Fallback / neverificat).

### 2.3 Formula scorului

```
ScorFinal    = 0,70 × S_Business + 0,15 × S_Uman + 0,15 × S_Investiție
S_Uman       = 0,50 × Quiz + 0,50 × PortalJust
S_Investiție = 0,50 × Formular + 0,50 × Benchmark sector
Kill-switch  : Quiz sub 35 p → −10 p din scorul final
```

- **S_Business** (din facturi): stabilitatea încasărilor 25%, comportament de plată 25%, sezonalitate 10%, concentrare pe clienți 15%, capacitate de rambursare (DSCR) 25%.
- **Quiz**: 5 întrebări (CA pe 3 luni, termen de plată, cel mai mare client, furnizor principal, stornări). Răspunsurile se verifică automat pe facturi și se re-verifică la fiecare XML încărcat.
- **PortalJust**: pornește de la 100 și scade după gravitatea dosarelor (vezi 3.3).
- **Statusuri**: ≥80 Bank-Ready · ≥60 Pregătit cu rezerve · ≥40 Necesită optimizare · sub 40 Risc ridicat.

### 2.4 Fluxul datelor

1. `AssessmentProvider.tsx` ține toată starea (firmă, facturi, quiz, investiție, rezultat portal) și o salvează în `localStorage` (cheia `credit-ready-v2`).
2. La fiecare schimbare, `computeAssessment()` din `src/lib/assessment.ts` recalculează totul: metrici din facturi (`metrics.ts`) → scoruri (`scoringEngine.ts`) → plan de acțiune.
3. Upload XML: `src/lib/efactura/parser.ts` citește facturile UBL 2.1 (380 = factură, 381 = storno), le adaugă la istoric și arată o notificare „scor X → Y”.
4. Supabase (opțional): `/api/dataset` încarcă firma și facturile, `/api/invoices` salvează XML-urile, `/api/assessments` salvează evaluarea (scorul e recalculat pe server). Fără Supabase, aplicația merge pe date sintetice locale.
5. Quiz extern: răspunsurile pot veni prin redirect (`/onboarding?q1=...`) sau prin webhook (`POST /api/quiz`).

---

## 3. Unde arată portalul raportul persoanei și al firmei

### 3.1 Locul exact în aplicație

**Pasul 1 „Firmă & factor uman” (`/onboarding`) → cardul „Verificare automată portal.just.ro”**, imediat lângă (sau sub, pe ecran îngust) cardul „Date firmă”.

Ce caută:
- **Firma** = câmpul „Denumire firmă” → dosarele apar în secțiunea **„Firmă”**.
- **Persoana** = câmpul „Administrator / CEO” → dosarele apar în secțiunea **„Administrator”**.

Verificarea pornește singură la prima vizită (mod live). Butonul „Reverifică” o repornește; meniul de lângă el schimbă între Live și 4 scenarii simulate (Fără dosare, Dosare minore, Mai multe dosare, Dosar critic).

### 3.2 Ce conține cardul

1. **Scor legal X/100**: scorul total (firmă și persoană împreună) care intră în formulă, plus un rezumat: câte dosare pe numele exact, câte omonime parțiale au fost excluse și mesajul sursei.
2. Alertă roșie dacă există un dosar critic (insolvență sau infracțiune economică) → scor legal 0.
3. **Secțiunea „Firmă”** (numele firmei) și **secțiunea „Administrator”** (numele persoanei). Fiecare are în dreapta o etichetă `N dosare · -X p · Y/100`. Dacă nu are dosare, scrie „Fără litigii, insolvențe sau executări silite pe acest nume”. Altfel apare „Vezi dosarele (N)”, deschis automat când există dosare care scad puncte. Fiecare dosar arată:
   - numărul dosarului, instanța, categoria și stadiul
   - nivelul (0–4) și câte puncte scade
   - tipul dosarului, obiectul, soluția, calitatea (Pârât, Inculpat, Creditor...), următorul termen
   - „De ce acest nivel” (explicația pas cu pas)

Exemplu verificat (simulat, „Mai multe dosare”):

| Dosar | Al cui | Nivel | Puncte |
|---|---|---|---|
| 772/211/2026 contestație la executare | după firmă | 3 Grav | −20 |
| 1893/1285/2025 pretenții | după firmă | 2 Moderat | −8 |
| 645/211/2024 conducere fără permis | după administrator | 1 Minor | −3 |
| 3263/211/2023 lovire (împăcare) | după administrator | 1 Minor | −3 |
| 2210/211/2025 înșelăciune (achitat) | după administrator | 0 | 0 |

Ce afișează acum cardul (verificat în browser):

| Secțiune | Etichetă |
|---|---|
| Firmă — LucPROMPT SRL | 2 dosare · -28 p · 72/100 |
| Administrator — Hus Antonio | 3 dosare · -6 p · 94/100 |
| Scor legal total | 100 − 20 − 8 − 6 = **66** (corect) |

Scenariul „Dosar critic”: Firmă `2 dosare · dosar critic · 0/100`, Administrator `1 dosare · dosar critic · 0/100`. Live: ambele `0 dosare · -0 p · 100/100`.

Scorul parțial se calculează cu aceeași funcție ca totalul (`scoreLegalCases`), aplicată doar pe dosarele acelei părți. Plafonul de 9 p pentru dosarele minore se aplică separat pe fiecare parte, deci cele două scoruri parțiale nu se adună exact la total.

### 3.3 Cum se calculează (`scoringEngine.ts`, `checkPortalJust.ts`)
- Se fac **2 interogări SOAP** la `portalquery.just.ro`: una pe numele firmei, una pe numele administratorului. Dosarele găsite de ambele se păstrează o singură dată.
- Se păstrează doar dosarele unde o parte are **exact** numele căutat (fără diacritice, ordinea cuvintelor nu contează, „SC”/„SRL” ignorate la firme). Restul se numără ca „omonime parțiale excluse”.
- Penalizări: nivel 1 −3 p (plafon 9 p total), nivel 2 −8 p, nivel 3 −20 p, nivel 4 → scor 0. Dosarele unde partea e creditor / reclamant / victimă nu scad nimic. Hotărârile mai vechi de 5 ani scad la jumătate.
- Dacă portalul nu răspunde în 15 secunde → scor neutru 80, marcat „Fallback”.

### 3.4 Unde mai apare rezultatul
- **Bara din stânga**: doar starea (Live / Simulat / Fallback), fără dosare.
- **Pasul 4 „Profil”**: pilonul „Factor uman” arată `portal.just.ro X/100`; lista „factorii care trag scorul în jos” are rândul „Verificare portal.just.ro” (X/100 · N dosare); dacă scorul legal e sub 80, planul primește acțiunea „Clarifică dosarele din portal.just.ro”.
- **Pasul 4, cardul „Verificare juridică portal.just.ro”** (nou, deasupra „Cum calculăm”): scorul legal, sursa (Live / Simulat / Fallback) și data verificării, apoi rapoartele **Firmă** și **Administrator** puse unul lângă altul. Fiecare are eticheta `N dosare · -X p · Y/100` și toate dosarele afișate desfăcut (număr, nivel, puncte, tip, obiect, soluție, rol, instanță).
- **Printează / PDF** (pasul 4): cardul de mai sus nu e ascuns la print și nu are secțiuni pliate, deci PDF-ul conține ambele rapoarte cu toate dosarele.
- **Supabase** (`assessments.legal_result`): tot rezultatul, cu dosarele, se salvează la „Salvează evaluarea”.

---

## 4. Probleme găsite

| # | Gravitate | Problemă | Unde |
|---|---|---|---|
| 1 | ~~Medie (UX)~~ **Rezolvat** | ~~Nu există raport separat pentru persoană și pentru firmă.~~ Cardul are acum secțiunile „Firmă” și „Administrator”, cu scor parțial. | `LegalPanel.tsx` |
| 2 | ~~Medie (UX)~~ **Rezolvat** | ~~Raportul tipărit / PDF din pasul 4 nu include dosarele.~~ Pasul 4 are acum cardul „Verificare juridică portal.just.ro”, cu rapoartele Firmă și Administrator, și apare și în PDF. | `ProfileStep.tsx` |
| 3 | Mică | Dacă același dosar e găsit și pe firmă, și pe administrator, apare doar în secțiunea „Firmă”, iar rolul administratorului în acel dosar se pierde. Cardul spune asta în nota de jos. | `checkPortalJust.ts` (deduplicarea) |
| 7 | Info | Numărul de omonime parțiale excluse e afișat doar pe total, nu pe fiecare parte (serverul nu le trimite separat). | `checkPortalJust.ts` |
| 4 | Mică (securitate, ok pentru demo) | `/api/assessments` primește rezultatul portal.just.ro de la browser și îl crede; un client poate trimite un scor legal fals. Pentru producție, verificarea trebuie refăcută pe server. | `src/app/api/assessments/route.ts` |
| 5 | Mică (securitate, ok pentru demo) | `DELETE /api/invoices?cui=...` și webhook-ul `/api/quiz` (când `QUIZ_WEBHOOK_SECRET` nu e setat) n-au autentificare. | `src/app/api/invoices/route.ts`, `src/app/api/quiz/route.ts` |
| 6 | Info | Portalul nu publică CNP: un dosar pe același nume complet poate fi al altei persoane. Aplicația afișează deja avertismentul. | — |

## 5. Ce mai rămâne

Ambele locuri sunt separate acum: cardul din pasul 1 și raportul din pasul 4, inclusiv PDF-ul. Rămân doar problemele mici #3–#7, niciuna nu blochează demo-ul. Aspectul paginii tipărite nu a fost verificat cu o previzualizare reală de print; e verificat doar că cardul nu e ascuns și nu are secțiuni pliate.

## 6. Cum reproduci verificarea

```powershell
cd "C:\Users\Lupu David\Documents\SME-Credit-Readiness\sme-credit-score"
npm test
npm run dev
```

Apoi: pasul 1 → cardul „Verificare automată portal.just.ro” → alege „Simulat — Mai multe dosare” → „Reverifică” → vezi secțiunile „Firmă” și „Administrator”. Revino la „Live” și „Reverifică” ca să ai iar datele reale.
