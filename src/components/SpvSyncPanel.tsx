"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CircleAlert, CircleCheck, CloudDownload, FileArchive, KeyRound, LoaderCircle, X } from "lucide-react";
import { browserInflateRaw, invoiceXmlFromZip } from "@/lib/efactura/zip";
import { useAssessment } from "./AssessmentProvider";
import { Button, cx } from "./ui";
import { tr } from "@/lib/i18n/tr";

type StepState = "pending" | "active" | "done" | "error" | "waiting";
interface Step {
  label: string;
  state: StepState;
  detail?: string;
}

const STEP_LABELS = ["Autentificare certificat digital / OAuth SPV", "Preluare facturi emise & primite", "Parsare automată UBL 2.1", "Recalculare scor"];
const freshSteps = (): Step[] => STEP_LABELS.map((label) => ({ label, state: "pending" }));

function StepIcon({ state, n }: { state: StepState; n: number }) {
  if (state === "done") return <CircleCheck size={18} className="text-emerald-strong" />;
  if (state === "error") return <CircleAlert size={18} className="text-red" />;
  if (state === "active") return <LoaderCircle size={18} className="animate-spin text-navy-3" />;
  if (state === "waiting") return <KeyRound size={18} className="text-amber" />;
  return <span className="grid h-[18px] w-[18px] place-items-center rounded-full border border-line-strong text-[10px] text-faint">{n}</span>;
}

/**
 * "Preluare Automată din RO e-Factura (SPV)": the real ANAF flow — certificate login (OAuth 2.0), list of
 * issued + received invoices, download (ZIP with UBL 2.1 XML), parsing on the active company, score recalculation.
 * Without the ANAF OAuth app configured, the same pipeline imports the ZIP archives downloaded from SPV.
 * No invoice is ever invented.
 */
export function SpvSyncButton() {
  const { company, uploadXml } = useAssessment();
  const [open, setOpen] = useState(false);
  const [steps, setSteps] = useState<Step[]>(freshSteps);
  const [status, setStatus] = useState<{ configured: boolean; connected: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const zipRef = useRef<HTMLInputElement>(null);
  const autoRun = useRef(false);

  const set = (i: number, patch: Partial<Step>) => setSteps((all) => all.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  /** Steps 3-4, shared by the SPV download and the ZIP import. */
  const parseAndScore = useCallback(
    async (files: { name: string; xml: string }[]) => {
      set(2, { state: "active", detail: tr("{n} fișiere XML", { n: files.length }) });
      const results = await uploadXml(files);
      const ok = results.filter((r) => r.ok).length;
      const bad = results.length - ok;
      set(2, { state: ok > 0 ? "done" : "error", detail: `${tr("{n} facturi parsate pe {name}", { n: ok, name: company.name })}${bad ? ` · ${tr("{n} respinse (vezi lista de mai jos)", { n: bad })}` : ""}` });
      set(3, ok > 0 ? { state: "done", detail: tr("Toți pilonii au fost recalculați; facturile s-au salvat în e_invoices pe firma activă.") } : { state: "error", detail: tr("Nicio factură validă: scorul nu s-a schimbat.") });
    },
    [uploadXml, company.name],
  );

  const run = useCallback(async () => {
    setBusy(true);
    setSteps(freshSteps());
    try {
      set(0, { state: "active", detail: tr("Verific conexiunea cu SPV…") });
      const st = (await fetch("/api/spv/status").then((r) => r.json())) as { configured: boolean; connected: boolean };
      setStatus(st);
      if (!st.configured) {
        set(0, { state: "error", detail: tr("Aplicația OAuth ANAF nu este configurată pe acest server. Importă arhivele ZIP descărcate din SPV (mai jos) — același flux, aceleași facturi reale.") });
        return;
      }
      if (!st.connected) {
        set(0, { state: "waiting", detail: tr("Conectează-te cu certificatul digital calificat (token USB) pe logincert.anaf.ro.") });
        return;
      }
      if (!company.cui) {
        set(0, { state: "error", detail: tr("SPV listează facturile după CIF: completează CUI-ul firmei în Pasul 1.") });
        return;
      }
      set(0, { state: "done", detail: tr("Sesiune SPV activă (token OAuth ANAF).") });
      set(1, { state: "active", detail: tr("Interoghez SPV pentru CIF {cui} (ultimele 12 luni)…", { cui: company.cui }) });
      const r = (await fetch("/api/spv/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cui: company.cui, days: 365 }) }).then((x) => x.json())) as {
        ok: boolean;
        step?: string;
        error?: string;
        found?: number;
        issued?: number;
        received?: number;
        downloaded?: number;
        truncated?: boolean;
        files?: { name: string; xml: string }[];
      };
      if (!r.ok) {
        set(r.step === "auth" ? 0 : 1, { state: "error", detail: r.error ? tr(r.error) : tr("SPV indisponibil.") });
        return;
      }
      set(1, {
        state: r.found ? "done" : "error",
        detail: r.found ? `${tr("{f} mesaje ({i} emise, {r} primite) · {d} XML descărcate", { f: r.found, i: r.issued ?? 0, r: r.received ?? 0, d: r.downloaded ?? 0 })}${r.truncated ? tr(" · restul la următoarea sincronizare") : ""}` : tr("SPV nu are facturi pentru acest CIF în perioada cerută."),
      });
      if (r.files?.length) await parseAndScore(r.files);
    } catch {
      set(0, { state: "error", detail: tr("API indisponibil.") });
    } finally {
      setBusy(false);
    }
  }, [company.cui, parseAndScore]);

  // Back from the ANAF login (?spv=conectat): open the flow and continue automatically.
  useEffect(() => {
    const spv = new URLSearchParams(window.location.search).get("spv");
    if (!spv || autoRun.current) return;
    autoRun.current = true;
    window.history.replaceState(null, "", window.location.pathname);
    /* eslint-disable react-hooks/set-state-in-effect -- one-time resume after the OAuth redirect */
    setOpen(true);
    if (spv === "conectat") void run();
    else setSteps(freshSteps().map((s, i) => (i === 0 ? { ...s, state: "error", detail: spv === "neconfigurat" ? tr("Aplicația OAuth ANAF nu este configurată.") : tr("Autentificarea SPV a eșuat sau a fost anulată.") } : s)));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [run]);

  const importZip = async (files: File[]) => {
    setBusy(true);
    setSteps(freshSteps());
    set(0, { state: "done", detail: tr("Arhive descărcate de tine din SPV (fără OAuth).") });
    set(1, { state: "active", detail: tr("{n} arhive ZIP", { n: files.length }) });
    try {
      const xml = (await Promise.all(files.map(async (f) => invoiceXmlFromZip(new Uint8Array(await f.arrayBuffer()), browserInflateRaw, f.name)))).flat();
      set(1, { state: xml.length ? "done" : "error", detail: xml.length ? tr("{x} facturi XML găsite în {n} arhive", { x: xml.length, n: files.length }) : tr("Nicio factură XML în arhive (semnăturile sunt ignorate).") });
      if (xml.length) await parseAndScore(xml);
    } catch (e) {
      set(1, { state: "error", detail: e instanceof Error ? tr(e.message) : tr("Arhivă invalidă.") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        onClick={() => {
          setOpen(true);
          if (!busy) void run();
        }}
        disabled={!company.id}
      >
        <CloudDownload size={15} /> {tr("Preluare Automată din RO e-Factura (SPV)")}
      </Button>
      <input
        ref={zipRef}
        type="file"
        accept=".zip,application/zip"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (files.length) void importZip(files);
        }}
      />
      {open && (
        <div className="no-print fixed inset-0 z-50 grid place-items-center bg-navy/30 p-4 backdrop-blur-sm" onClick={() => !busy && setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label={tr("Sincronizare SPV")} className="animate-rise w-full max-w-[520px] rounded-[24px] bg-white p-6 shadow-pop" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-medium tracking-tight text-ink">{tr("Sincronizare RO e-Factura (SPV)")}</h2>
                <p className="text-xs text-muted">
                  {company.officialName || company.name} · {company.cui ? `CIF ${company.cui}` : tr("fără CUI")}
                </p>
              </div>
              <button type="button" onClick={() => !busy && setOpen(false)} aria-label={tr("Închide")} className="text-faint hover:text-ink disabled:opacity-40" disabled={busy}>
                <X size={18} />
              </button>
            </div>
            <ol className="mt-5 space-y-3">
              {steps.map((s, i) => (
                <li key={s.label} className={cx("flex gap-3 rounded-xl border p-3", s.state === "error" ? "border-red/30 bg-red-soft/50" : s.state === "done" ? "border-emerald/30 bg-emerald-soft/40" : s.state === "waiting" ? "border-amber/40 bg-amber-soft" : "border-line")}>
                  <span className="mt-0.5 shrink-0">
                    <StepIcon state={s.state} n={i + 1} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{tr(s.label)}</p>
                    {s.detail && <p className="mt-0.5 text-xs leading-relaxed text-muted">{s.detail}</p>}
                    {i === 0 && s.state === "waiting" && (
                      <a href="/api/spv/authorize?returnTo=/onboarding" className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-navy px-4 py-2 text-xs font-medium text-white hover:bg-navy-2">
                        <KeyRound size={13} /> {tr("Conectează-te la SPV cu certificatul digital")}
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-5 rounded-2xl bg-canvas p-4">
              <p className="text-xs font-medium text-ink">{tr("Ai descărcat deja facturile din SPV?")}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                {tr("În SPV → e-Factura, fiecare factură se descarcă drept arhivă ZIP (XML + semnătură). Încarcă una sau mai multe arhive (sau o arhivă cu arhive): le despachetăm în browser și parcurgem pașii 3–4.")}
              </p>
              <Button variant="secondary" className="mt-3 px-4 py-2 text-xs" onClick={() => zipRef.current?.click()} disabled={busy || !company.id}>
                <FileArchive size={14} /> {tr("Importă arhive ZIP din SPV")}
              </Button>
            </div>
            {status && !status.configured && (
              <p className="mt-3 text-[11px] leading-relaxed text-faint">
                {tr("Pentru preluarea direct din API: înregistrează aplicația în portalul ANAF pentru dezvoltatori și setează ANAF_OAUTH_CLIENT_ID, ANAF_OAUTH_CLIENT_SECRET și ANAF_OAUTH_REDIRECT_URI.")}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
