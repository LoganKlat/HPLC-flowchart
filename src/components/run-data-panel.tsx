"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChromatogramChart } from "./chromatogram-chart";
import { evaluateRun, resolutionForDecision, type RuleNumbers } from "@/lib/evaluate";
import type { LabFileRead } from "@/lib/lab-file";
import type { RunDetails } from "@/lib/run-details";

export type RunDataEntry = {
  index: number; label: string; fileName: string | null; status: string;
  details: RunDetails; read: LabFileRead | null; message: string | null;
};
const fields: [keyof RunDetails, string, string][] = [
  ["solvent", "Solvent", ""], ["percentB", "Organic solvent", "% B"], ["ph", "pH", ""], ["method", "Method", ""],
  ["flowRate", "Flow rate", "mL/min"], ["injectionVolume", "Injection volume", "µL"], ["sampleType", "Sample type", ""],
  ["sampleConcentration", "Sample concentration", "mg/mL"], ["ligand", "Column coating", ""], ["coreShell", "Core shell", ""],
  ["lengthMm", "Column length", "mm"], ["diameterMm", "Internal diameter", "mm"], ["particleSize", "Particle size", "µm"],
  ["poreSize", "Pore size", "Å"], ["carbonLoad", "Carbon load", "%"], ["temperature", "Temperature", "°C"], ["wavelength", "Wavelength", "nm"],
];
const fmt = (value: number | null | undefined, decimals = 3) => value == null || !Number.isFinite(value) ? "—" : value.toFixed(decimals);
function download(name: string, text: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function cellCsv(value: string) {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
function displayedCondition(value: string, unit: string) {
  if (!value) return "Not set";
  if (unit === "°C" && /^(amb|ambient)$/i.test(value)) return "Ambient";
  return `${value}${unit ? ` ${unit}` : ""}`;
}

export function RunDataPanel({ runs, checks, onOpen }: { runs: RunDataEntry[]; checks: RuleNumbers; onOpen: (index: number) => void }) {
  const [exampleFull, setExampleFull] = useState<{fileName: string; read: LabFileRead}[]>([]);
  const [exampleError, setExampleError] = useState<string | null>(null);
  const needExamples = runs.some(run => run.read && !run.read.exportSections);
  useEffect(() => {
    if (!needExamples) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/decision-example/full-data.json.gz", { signal: controller.signal });
        if (!response.ok || !response.body) throw new Error("Could not load the full example sections.");
        const decoded = response.body.pipeThrough(new DecompressionStream("gzip"));
        const full = await new Response(decoded).json();
        if (!controller.signal.aborted) setExampleFull(full);
      } catch {
        if (!controller.signal.aborted) setExampleError("Full example sections could not be loaded. Re-upload an original file to inspect every section.");
      }
    }
    void load();
    return () => controller.abort();
  }, [needExamples]);
  const completeRuns = runs.map(run => !run.read || run.read.exportSections ? run : ({ ...run, read: exampleFull.find(item => item.fileName === run.fileName)?.read ?? run.read }));
  const loadingSections = needExamples && !exampleFull.length && !exampleError;
  const [selected, setSelected] = useState(0);
  const [search, setSearch] = useState("");
  const available = completeRuns.filter(run => run.fileName || run.read || run.status === "error");
  const filtered = available.filter(run => `${run.index + 1} ${run.fileName} ${Object.values(run.details).join(" ")}`.toLowerCase().includes(search.toLowerCase()));
  const run = available.find(item => item.index === selected) ?? available[0];
  const read = run?.read;
  return <section className="flex flex-col gap-5" aria-label="All run data">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="font-heading text-3xl">Run data</h1><p className="mt-2 text-sm text-muted-foreground">Every loaded export, run condition, peak measurement, and available trace. Current specifications apply to all runs. “—” means unavailable.</p></div>
      <button className="rounded-md border border-border bg-card px-3 py-2 text-sm disabled:opacity-50" disabled={!available.length || loadingSections} onClick={() => download("hplc-all-run-data.json", JSON.stringify({ specifications: checks, runs: available.map(run => ({ ...run, checks: run.read ? evaluateRun(run.read, checks) : [] })) }, null, 2))}>Download all runs (JSON)</button>
    </header>
    {loadingSections && <p role="status" className="text-sm text-muted-foreground">Loading full example export sections…</p>}
    {exampleError && <p role="status" className="text-sm text-amber-800">{exampleError}</p>}
    <label className="flex flex-col gap-1 text-sm">Find a run<input type="search" placeholder="Filename, solvent, column, temperature…" value={search} onChange={event => setSearch(event.target.value)} className="rounded-md border border-border bg-card px-3 py-2" /></label>
    {!available.length ? <p className="rounded-xl border border-border bg-card p-5">No files loaded yet. Add a file in the decision engine to see its data here.</p> : <>
      <div className="max-h-80 overflow-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[850px] text-left text-sm"><thead className="sticky top-0 bg-card"><tr>{["Run", "Conditions", "Peaks", "Reported worst Rs", "Decision Rs", "t₀ (min)", "Last peak (min)", "Max psi", "Checks"].map(label => <th key={label} className="p-3 font-medium">{label}</th>)}</tr></thead><tbody>
          {filtered.map(item => { const rows = item.read ? evaluateRun(item.read, checks) : []; const met = rows.filter(row => row.status === "met").length; return <tr key={item.index} className={`border-t border-border ${run?.index === item.index ? "bg-[#e7f3ee]" : ""}`}>
            <td className="p-3"><button type="button" aria-pressed={run?.index === item.index} onClick={() => setSelected(item.index)} className="font-semibold text-[#0f6b56] underline underline-offset-4">Run {item.index + 1}</button></td>
            <td className="p-3">{item.details.solvent} · {item.details.percentB}% B · {displayedCondition(item.details.temperature, "°C")} · {item.details.ligand}<span className="mt-1 block max-w-96 break-all text-xs text-muted-foreground">{item.fileName}</span></td>
            <td className="p-3">{item.read?.peakCount ?? "—"}</td><td className="p-3">{fmt(item.read?.minResolutionExcludingFirst)}</td>
            <td className="p-3">{fmt(item.read ? resolutionForDecision(item.read.peakCount, item.read.minResolutionExcludingFirst, checks.requiredPeaks) : null)}</td>
            <td className="p-3">{fmt(item.read?.firstPeakTimeMin)}</td><td className="p-3">{fmt(item.read?.lastPeakTimeMin)}</td><td className="p-3">{fmt(item.read?.maxBackPressurePsi, 1)}</td><td className="p-3">{item.read ? `${met}/4 met` : item.status}</td>
          </tr>; })}
          {!filtered.length && <tr><td colSpan={9} className="p-4">No runs match your search.</td></tr>}
        </tbody></table>
      </div>
      {run && <article key={run.index} className="flex flex-col gap-5">
        <header className="flex flex-wrap justify-between gap-3"><div><h2 className="font-heading text-2xl">Run {run.index + 1}</h2><p className="mt-1 break-all text-sm text-muted-foreground">{run.fileName}</p></div><button type="button" className="rounded-md border border-border bg-card px-3 py-2 text-sm" onClick={() => onOpen(run.index)}>Open in decision engine</button></header>
        <Block title="Run conditions"><dl className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">{fields.map(([key, label, unit]) => <div key={key}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-sm font-medium">{displayedCondition(run.details[key], unit)}</dd></div>)}</dl></Block>
        {!read ? <p role="status">{run.message ?? (run.status === "reading" ? "File is still being read." : "Results are unavailable.")}</p> : <>
          <Block title="Specifications and measured results"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{evaluateRun(read, checks).map(row => <div key={row.id} className="rounded-md border border-border p-3 text-sm"><h3 className="font-medium">{row.label}</h3><p className="mt-2">Measured: {row.measured}</p><p>Rule: {row.rule}</p><p className={`mt-2 font-medium ${row.status === "met" ? "text-[#0f6b56]" : "text-amber-800"}`}>{row.status.replaceAll("-", " ")}</p>{row.note && <p className="mt-2 text-xs text-muted-foreground">{row.note}</p>}</div>)}</div><p className="mt-3 text-sm text-muted-foreground">Reported peaks: {read.peakCount}; table rows: {read.peakRowCount}. t₀: {fmt(read.firstPeakTimeMin)} min (the app assumes the first peak is the marker). Reported worst Rs: {fmt(read.minResolutionExcludingFirst)}. Decision Rs becomes zero when the expected peak count is missing.</p></Block>
          {read.chromatogram && <Block title="Chromatogram and pressure"><ChromatogramChart points={read.chromatogram} yLabel={read.chromatogramYAxis} peakTimesMin={read.peakTimesMin} pressure={{ points: read.pressureTrace ?? [], unit: read.pressureUnits }} /><p className="mt-3 text-sm text-muted-foreground">Detector section: {read.chromatogramSectionName ?? "—"}; signal units: {read.chromatogramYAxis}. {read.chromatogram.length} detector points; {read.pressureTrace?.length ?? 0} pressure points. Pressure units: {read.pressureUnits ?? "—"}.</p></Block>}
          <Block title="Complete reported peak table">
            <p className="mb-3 text-sm text-muted-foreground">Every column present in the export, including resolution, widths, area %, and other metrics when reported. Values and column units are retained as exported; no missing widths are invented.</p>
            {read.peakTable ? <><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{read.peakTable.headers.map((header, i) => <th key={i} className="whitespace-nowrap border-b border-border p-2 font-medium">{header || `Column ${i + 1}`}</th>)}</tr></thead><tbody>{read.peakTable.rows.map((row, i) => <tr key={i}>{read.peakTable!.headers.map((_, col) => <td key={col} className="whitespace-nowrap border-b border-border p-2">{row[col] || "—"}</td>)}</tr>)}</tbody></table></div><button type="button" className="mt-3 rounded-md border border-border px-3 py-2 text-sm" onClick={() => download(`run-${run.index + 1}-peaks.csv`, [read.peakTable!.headers, ...read.peakTable!.rows].map(row => row.map(cellCsv).join(",")).join("\r\n"), "text/csv;charset=utf-8")}>Download peak table (CSV)</button><dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">{Object.entries(read.peakTable.metadata).map(([key, value]) => <div key={key}><dt className="text-muted-foreground">{key}</dt><dd>{value || "—"}</dd></div>)}</dl></> : <p>The full table is unavailable in this older read. Re-upload the file to retain every column.</p>}
          </Block>
          <Block title="Peak retention and adjacent resolution"><p className="mb-3 text-sm text-muted-foreground">k = (tR − t₀) / t₀. log₁₀(k) is undefined for k ≤ 0. Resolution is reported by the export, usually relative to the preceding peak; the first retained peak’s value may refer to the marker. Peak 1 is the assumed marker, not an identified compound.</p><div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead><tr>{["Peak", "Name / ID", "tR (min)", "ΔtR to previous (min)", "Area (export units)", "Height (export units)", "Reported Rs", "k", "log₁₀(k)"].map(label => <th key={label} className="border-b border-border p-2">{label}</th>)}</tr></thead><tbody>{read.peaks.map((peak, index) => { const k = read.firstPeakTimeMin != null && read.firstPeakTimeMin > 0 && peak.timeMin != null ? (peak.timeMin - read.firstPeakTimeMin) / read.firstPeakTimeMin : null; const previous = read.peaks[index - 1]?.timeMin; return <tr key={index}>{[`${index + 1}${index === 0 ? " (marker)" : ""}`, [peak.name, peak.id].filter(Boolean).join(" / ") || "—", fmt(peak.timeMin), fmt(peak.timeMin != null && previous != null ? peak.timeMin - previous : null), fmt(peak.area, 2), fmt(peak.height, 2), fmt(peak.resolution), fmt(k), fmt(k != null && k > 0 ? Math.log10(k) : null)].map((value, col) => <td key={col} className="border-b border-border p-2">{value}</td>)}</tr>; })}</tbody></table></div></Block>
          {read.notes.length > 0 && <Block title="Import notes"><ul className="list-disc space-y-2 pl-5 text-sm">{read.notes.map(note => <li key={note}>{note}</li>)}</ul></Block>}
          {read.chromatogramMissingMessage && <p>{read.chromatogramMissingMessage}</p>}
          <Block title="Every export section and trace point"><p className="mb-3 text-sm text-muted-foreground">Includes available acquisition information, detector sections, peak tables and pump traces. Large sections are paged to keep the tab responsive. Download all runs above for the complete data without paging.</p>{read.exportSections?.map((section, index) => <details key={index} className="border-t border-border py-2"><summary className="cursor-pointer text-sm font-medium">{section.name} · {section.lines.length} lines</summary><RawSection lines={section.lines} /></details>) ?? <p>Raw sections were not retained for this read.</p>}</Block>
        </>}
      </article>}
    </>}
  </section>;
}
function Block({ title, children }: { title: string; children: ReactNode }) { return <section className="rounded-xl border border-border bg-card p-4 sm:p-5"><h3 className="mb-3 font-heading text-lg">{title}</h3>{children}</section>; }
function RawSection({ lines }: { lines: string[] }) {
  const [page, setPage] = useState(0); const pages = Math.max(1, Math.ceil(lines.length / 100));
  return <div className="mt-3"><div className="flex items-center gap-3 text-xs"><button disabled={page === 0} onClick={() => setPage(value => value - 1)} className="rounded border border-border px-2 py-1 disabled:opacity-40">Previous</button><span>Page {page + 1}/{pages} · lines {lines.length ? page * 100 + 1 : 0}–{Math.min((page + 1) * 100, lines.length)}</span><button disabled={page + 1 >= pages} onClick={() => setPage(value => value + 1)} className="rounded border border-border px-2 py-1 disabled:opacity-40">Next</button></div><pre className="mt-2 max-h-96 overflow-auto rounded bg-muted p-3 text-xs">{lines.slice(page * 100, (page + 1) * 100).join("\n")}</pre></div>;
}
