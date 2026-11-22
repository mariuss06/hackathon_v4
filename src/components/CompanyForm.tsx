"use client";

import { useEffect, useState } from "react";
import { Building2, CircleAlert, CircleCheck, Fingerprint, LoaderCircle, Lock, Plus, Save, ShieldCheck } from "lucide-react";
import { PLANS } from "@/lib/pricing";
import { useLanguage } from "./LanguageProvider";
import { cleanCnp, validateCnp } from "@/lib/cnp";
import { getNumberLocale } from "@/lib/util";
import { caenWarning, cuiWarning } from "@/lib/company";
import { cleanCaen, findSector, GENERAL_SECTOR, SECTOR_BENCHMARKS, sectorForCaen } from "@/lib/data/benchmarks";
import { companyCounty, COUNTIES } from "@/lib/scoringEngine";
import { useAssessment, type CompanyDraft } from "./AssessmentProvider";
import { Badge, Button, Card, CardHeader, cx, Field, inputCls } from "./ui";
import { tr } from "@/lib/i18n/tr";

const fromCompany = (c: {
  name: string;
  cui: string;
  caenCode: string;
  sector?: string;
  ceoName: string;
  county?: string;
  city?: string;
  nameSearchConsent?: boolean;
}): CompanyDraft => ({
  name: c.name,
  cui: c.cui,
  caenCode: c.caenCode,
  sector: c.sector ?? sectorForCaen(c.caenCode) ?? GENERAL_SECTOR,
  ceoName: c.ceoName,
  county: companyCounty(c) || undefined,
  nameSearchConsent: Boolean(c.nameSearchConsent),
});

const EMPTY_DRAFT: CompanyDraft = { name: "", cui: "", caenCode: "", sector: GENERAL_SECTOR, ceoName: "", nameSearchConsent: false };

/**
 * Step 1 "Date firmă". Name and CEO are required; CUI and CAEN are optional and never block saving.
 * Saving finds the company (by CUI, or by normalized name) or creates it — previous companies stay stored.
 * The fields re-sync when the active company changes (save or header switch); the save message stays.
 */
export function CompanyForm() {
  const { company, companies, saveCompany, supabase, setPendingDraft, canAddCompany, plan, showUpgrade } = useAssessment();
  const { t } = useLanguage();
  const [draft, setDraft] = useState<CompanyDraft>(() => fromCompany(company));
  // No company yet: the form starts directly in "new company" mode.
  const [isNew, setIsNew] = useState(() => !company.id);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [touched, setTouched] = useState(false);
  const [syncedId, setSyncedId] = useState(company.id);
  // Adjust state while rendering when the active company changes (React's recommended pattern, no effect).
  if (syncedId !== company.id) {
    setSyncedId(company.id);
    setDraft(fromCompany(company));
    setIsNew(!company.id);
    setTouched(false);
  }

  const set = (patch: Partial<CompanyDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setResult(null);
  };
  const caen = cleanCaen(draft.caenCode);
  const mapped = sectorForCaen(draft.caenCode);
  const cnpTyped = draft.ceoCnp !== undefined && draft.ceoCnp.trim() !== "";
  const cnpCheck = cnpTyped ? validateCnp(draft.ceoCnp ?? "") : null;
  const cnpInvalid = Boolean(cnpCheck && !cnpCheck.valid);
  const nameMissing = !draft.name.trim();
  const ceoMissing = !draft.ceoName.trim();
  const dirty =
    isNew ||
    draft.name.trim() !== company.name ||
    draft.ceoName.trim() !== company.ceoName ||
    draft.cui.trim() !== company.cui ||
    caen !== company.caenCode ||
    (draft.county ?? "") !== (companyCounty(company) ?? "") ||
    Boolean(draft.nameSearchConsent) !== Boolean(company.nameSearchConsent) ||
    draft.ceoCnp !== undefined ||
    (!mapped && draft.sector !== (company.sector ?? GENERAL_SECTOR));

  // The unsaved form is shared with "Continuă": going to step 2 saves it first, so step 2 never shows another company.
  useEffect(() => {
    setPendingDraft(dirty && !nameMissing && !ceoMissing && !cnpInvalid ? draft : null);
  }, [dirty, nameMissing, ceoMissing, cnpInvalid, draft, setPendingDraft]);
  useEffect(() => () => setPendingDraft(null), [setPendingDraft]);

  const submit = async () => {
    setTouched(true);
    if (nameMissing || ceoMissing || cnpInvalid) return;
    setBusy(true);
    try {
      const r = await saveCompany(draft);
      setResult(r);
      if (r.ok) {
        setIsNew(false);
        // The raw CNP leaves the form as soon as it is saved: only the masked value stays.
        setDraft((d) => ({ ...d, ceoCnp: undefined }));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader
        icon={<Building2 size={18} />}
        title={isNew ? tr("Firmă nouă") : tr("Date firmă")}
        subtitle={
          isNew
            ? tr("Doar numele firmei și al administratorului sunt obligatorii. CUI și CAEN sunt opționale.")
            : tr(companies.length === 1 ? "Firma activă · {n} firmă salvată {where}" : "Firma activă · {n} firme salvate {where}", {
                n: companies.length,
                where: supabase?.configured && !supabase.error ? tr("în Supabase") : tr("în browser"),
              })
        }
        action={
          !isNew && (
            <Button
              variant="secondary"
              title={canAddCompany.allowed ? undefined : t.plan.companyLimit(PLANS[plan.planTier].name, canAddCompany.limit ?? 0)}
              onClick={() => {
                // Plan limit (Starter 1 firmă, Pro 3): blocked with an upgrade prompt instead of a new form.
                if (!canAddCompany.allowed) return showUpgrade(t.plan.companyLimit(PLANS[plan.planTier].name, canAddCompany.limit ?? 0));
                setDraft(EMPTY_DRAFT);
                setIsNew(true);
                setTouched(false);
                setResult(null);
              }}
            >
              {canAddCompany.allowed ? <Plus size={14} /> : <Lock size={13} />} {canAddCompany.allowed ? t.plan.newCompany : t.plan.newCompanyLocked}
            </Button>
          )
        }
      />
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label={<>{tr("Denumire firmă (SRL)")} <span className="text-red">*</span></>} hint={touched && nameMissing ? <span className="text-red">{tr("Obligatoriu.")}</span> : undefined}>
          <input className={inputCls} value={draft.name} placeholder={tr("ex. Bistro La Mama SRL")} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={<>{tr("Administrator / CEO")} <span className="text-red">*</span></>}
            hint={touched && ceoMissing ? <span className="text-red">{tr("Obligatoriu.")}</span> : tr("Căutat și el în portal.just.ro (potrivire pe numele complet).")}
          >
            <input className={inputCls} value={draft.ceoName} placeholder={tr("ex. Ana Popescu")} onChange={(e) => set({ ceoName: e.target.value })} />
          </Field>
          <Field label={<>{tr("Județul sediului")} <span className="text-faint">{tr("(opțional)")}</span></>} hint={tr("Portalul nu are CNP: comparăm județul instanței ca să deosebim omonimii.")}>
            <select className={inputCls} value={draft.county ?? ""} onChange={(e) => set({ county: e.target.value || undefined })}>
              <option value="">{tr("Nespecificat")}</option>
              {COUNTIES.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={<>{tr("CUI")} <span className="text-faint">{tr("(opțional)")}</span></>}
            hint={(cuiWarning(draft.cui) && tr(cuiWarning(draft.cui)!)) ?? (draft.cui.trim() ? tr("Identifică facturile emise / primite.") : tr("Fără CUI: facturile și portal.just.ro se potrivesc după numele firmei."))}
          >
            <input className={inputCls} value={draft.cui} placeholder={tr("ex. RO45127893")} onChange={(e) => set({ cui: e.target.value.toUpperCase() })} />
          </Field>
          <Field
            label={<>{tr("Cod CAEN")} <span className="text-faint">{tr("(opțional)")}</span></>}
            hint={(caenWarning(draft.caenCode) && tr(caenWarning(draft.caenCode)!)) ?? (mapped ? `→ ${tr("sector")} ${tr(findSector(mapped).shortLabel)}` : caen ? tr("Cod necunoscut în benchmark: alege sectorul mai jos.") : tr("Lipsă: alege sectorul de activitate mai jos."))}
          >
            <input className={inputCls} value={draft.caenCode} inputMode="numeric" placeholder={tr("ex. 5610")} onChange={(e) => set({ caenCode: e.target.value })} />
          </Field>
        </div>
        <div className="rounded-xl border border-line p-3.5">
          <Field
            label={
              <span className="flex items-center gap-1.5">
                <Fingerprint size={13} /> {tr("CNP Administrator / CEO")} <span className="text-faint">{tr("(opțional)")}</span>
              </span>
            }
            hint={
              cnpCheck ? (
                cnpCheck.valid ? (
                  <span className="text-emerald-strong">
                    {tr("Valid · {masked} · născut(ă) {date} · județ {county}", { masked: cnpCheck.info.masked, date: new Date(cnpCheck.info.birthDate).toLocaleDateString(getNumberLocale()), county: cnpCheck.info.county })}
                    {cnpCheck.info.sex ? ` · ${cnpCheck.info.sex}` : ""}
                  </span>
                ) : (
                  <span className="text-red">{tr(cnpCheck.error)}</span>
                )
              ) : company.ceoCnpMasked && !isNew ? (
                <span>
                  {tr("Salvat mascat:")} <strong className="font-mono">{company.ceoCnpMasked}</strong>. {tr("Lasă gol ca să-l păstrezi")}
                  {" · "}
                  <button type="button" className="underline hover:text-ink" onClick={() => set({ ceoCnp: "" })}>
                    {tr("șterge CNP-ul")}
                  </button>
                </span>
              ) : draft.ceoCnp === "" && company.ceoCnpMasked ? (
                <span className="text-amber">{tr("CNP-ul salvat va fi șters la salvare.")}</span>
              ) : (
                tr("Folosit doar pentru a deosebi omonimii la verificarea administratorului (vârstă la data dosarului, județ).")
              )
            }
          >
            <input
              className={cx(inputCls, "font-mono tracking-wider", cnpInvalid && "border-red/60")}
              inputMode="numeric"
              autoComplete="off"
              maxLength={13}
              value={draft.ceoCnp ?? ""}
              placeholder={company.ceoCnpMasked && !isNew ? company.ceoCnpMasked : tr("13 cifre")}
              onChange={(e) => set({ ceoCnp: cleanCnp(e.target.value).slice(0, 13) })}
            />
          </Field>
          <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-emerald-soft/60 px-2.5 py-1.5 text-[11px] leading-relaxed text-emerald-strong">
            <ShieldCheck size={13} className="mt-0.5 shrink-0" />
            <span>
              {tr("GDPR: CNP-ul este validat matematic (cheia 279146358279) și mascat — afișat doar ca")} <span className="font-mono">1900101******</span> {tr("în rapoarte. Valoarea completă nu se salvează și nu se trimite nicăieri.")}
            </span>
          </p>
        </div>
        <label className="flex items-start gap-2.5 rounded-xl border border-line bg-canvas px-3.5 py-3 text-xs leading-relaxed text-muted">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 accent-[#16213e]"
            checked={Boolean(draft.nameSearchConsent)}
            onChange={(e) => set({ nameSearchConsent: e.target.checked })}
          />
          <span>
            {tr("Administratorul este de acord să fie căutat după nume în dosarele publice de pe portal.just.ro (GDPR, art. 6 alin. 1 lit. a). Fără acord verificăm doar firma; datele sunt folosite numai pentru această evaluare.")}
          </span>
        </label>
        {mapped ? (
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
            {tr("Sector pentru comparația cu industria:")} <Badge tone="emerald">{tr(findSector(mapped).shortLabel)}</Badge>
            <span className="text-faint">{tr("mapat automat din CAEN {caen}", { caen })}</span>
          </p>
        ) : (
          <Field label={tr("Sector de activitate")} hint={tr("Folosit în S_Investiție pentru comparația cu industria (valori de referință orientative p25 / mediană / p75, nu statistici oficiale).")}>
            <select className={inputCls} value={draft.sector} onChange={(e) => set({ sector: e.target.value })}>
              {SECTOR_BENCHMARKS.map((s) => (
                <option key={s.caenCode} value={s.caenCode}>
                  {tr(s.shortLabel)}
                </option>
              ))}
            </select>
          </Field>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button type="submit" disabled={busy || cnpInvalid || (!dirty && !isNew)}>
            {busy ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />}
            {isNew ? tr("Salvează și analizează firma") : dirty ? tr("Salvează modificările") : tr("Firmă salvată")}
          </Button>
          {isNew && company.id && (
            <Button
              variant="ghost"
              onClick={() => {
                setDraft(fromCompany(company));
                setIsNew(false);
                setTouched(false);
              }}
            >
              {tr("Renunță")}
            </Button>
          )}
        </div>
        {result && (
          <p className={cx("flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-xs", result.ok ? "bg-emerald-soft text-emerald-strong" : "bg-red-soft text-red")}>
            {result.ok ? <CircleCheck size={14} className="mt-0.5 shrink-0" /> : <CircleAlert size={14} className="mt-0.5 shrink-0" />}
            {result.message}
          </p>
        )}
      </form>
    </Card>
  );
}
