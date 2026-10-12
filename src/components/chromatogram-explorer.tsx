"use client";

import { useId, useState } from "react";
import { EXAMPLE_BASELINE as baseline, EXAMPLE_T0 as t0, pairResolution, peakMetrics, peakSignal, teachingPeaks } from "@/lib/chromatogram-example";

const topics = [
  ["axes", "X & Y axes"], ["peaks", "Peaks & tR"], ["t0", "Dead time t₀"],
  ["retention", "Retention factor k"], ["baseline", "Baseline"], ["height", "Peak height"],
  ["area", "Peak area"], ["width", "Width & FWHM"], ["resolution", "Resolution Rs"],
  ["last", "Last peak & runtime"], ["pressure", "Back-pressure"], ["checks", "App checks"],
] as const;
type Topic = typeof topics[number][0];
const green = "#0f6b56", amber = "#b36a13", blue = "#2563a6";
const x = (time: number) => 80 + time / 13 * 730;
const y = (signal: number) => 285 - signal / 150 * 225;
const n = (value: number) => value.toFixed(2);

export function ChromatogramExplorer() {
  const [topic, setTopic] = useState<Topic>("axes");
  const [selected, setSelected] = useState(2);
  const [spacing, setSpacing] = useState(1.2);
  const [width, setWidth] = useState(1);
  const [amount, setAmount] = useState(85);
  const [lastTime, setLastTime] = useState(11);
  const [pressure, setPressure] = useState(2300);
  const id = useId().replaceAll(":", "");
  const peaks = teachingPeaks(spacing, width, amount, lastTime);
  const peak = peaks[selected];
  const metric = peakMetrics(peak);
  const resolution = pairResolution(peaks[2], peaks[3]);
  const worst = Math.min(...peaks.slice(1, -1).map((p, i) => pairResolution(p, peaks[i + 2])));
  const last = peaks[peaks.length - 1];
  const signal = (time: number) => baseline + peaks.reduce((sum, p) => sum + peakSignal(p, time), 0);
  const curve = Array.from({ length: 1301 }, (_, i) => {
    const time = i / 100;
    return `${i ? "L" : "M"}${x(time).toFixed(2)},${y(signal(time)).toFixed(2)}`;
  }).join(" ");
  const area = Array.from({ length: 181 }, (_, i) => {
    const time = peak.time - 3 * peak.sigma + i / 180 * 6 * peak.sigma;
    return `L${x(time)},${y(baseline + peakSignal(peak, time))}`;
  }).join(" ");
  const pressureCurve = Array.from({ length: 131 }, (_, i) => {
    const time = i / 10;
    const value = pressure - 160 + 80 * (1 + Math.cos((time - 4) * Math.PI / 7));
    return `${i ? "L" : "M"}${x(time)},${408 - value / 5500 * 58}`;
  }).join(" ");
  const descriptions: Record<Topic, { title: string; body: string; formula?: string; app: string }> = {
    axes: { title: "Time and detector response", body: "The X axis is time after injection, in minutes. The Y axis is the detector signal; this UV example uses mAU (milli-absorbance units). A higher signal is not a longer retention time. Pressure uses its own scale below.", app: "The app takes the time, detector signal, and units from the export. Wavelength affects how strongly a compound appears." },
    peaks: { title: "Peaks and retention time (tR)", body: `Choose a peak on the graph or below it. ${peak.label} has tR = ${n(peak.time)} min. Retention time is measured from injection to the peak apex. Overlapping compounds can appear as one peak; an extra peak can also be an impurity.`, app: "The decision engine uses the export’s peak table for peak count and retention times. It does not identify compounds from their order alone." },
    t0: { title: "Dead time (t₀)", body: "The marker elutes at 1.00 min. It represents material that is not retained by the stationary phase. The injection is time zero; t₀ is the later marker retention time. In the class, uracil is used to measure it.", formula: "t₀ = 1.00 min; marker k = 0", app: "The app assumes the first peak-table peak is the unretained marker. Check that assignment before relying on calculated k or log k." },
    retention: { title: "Retention factor k", body: `${peak.label}: k = ${n(metric.k)}. k describes retention relative to the time spent passing through the column. The marker has k = 0, so log₁₀(k) is undefined for it.`, formula: `k = (tR − t₀) / t₀ = (${n(peak.time)} − 1.00) / 1.00; log₁₀(k) = ${metric.k > 0 ? n(Math.log10(metric.k)) : "undefined for marker"}`, app: "The app uses the marker and retained peaks to support isocratic %B decisions and retention fitting. Only k > 0 can be plotted as log k." },
    baseline: { title: "The local baseline", body: "The dotted line is the signal without the selected compound. This teaching example has a flat baseline of 5 mAU. Real baselines may drift or contain noise. Height and area must be measured relative to a suitable baseline.", app: "The app displays the chromatogram and imports peak measurements from LabSolutions. The flat baseline here is for explaining those measurements." },
    height: { title: "Peak height above the baseline", body: `${peak.label}: height = ${n(peak.height)} mAU above the baseline. The apex detector value for that isolated peak is ${n(baseline + peak.height)} mAU. When peaks overlap, the observed trace includes signals from both compounds.`, formula: "Height = apex signal − local baseline", app: "The app shows heights reported in the peak table. Height depends on detector response, amount, and peak broadening; it is not a direct purity measurement." },
    area: { title: "Integrated peak area", body: `The shaded area is the selected peak’s contribution above the baseline. Its full theoretical area is ${n(metric.area)} mAU·min. The graphic shades ±3σ (about 99.7% of that area). Increasing B’s amount increases its area. Widening the peaks keeps their area constant and lowers their height.`, formula: "Area = ∫ (peak signal − baseline) dt", app: "The app imports reported areas for peak comparisons. Export units may differ (for example, time in seconds). Quantifying concentration needs an appropriate calibration." },
    width: { title: "Baseline width and half-height width", body: `${peak.label}: W = ${n(metric.baselineWidth)} min; FWHM = ${n(metric.fwhm)} min. FWHM is the distance between half-height crossings. For this ideal Gaussian, the baseline width uses the inflection-point tangents (W = 4σ); the curve itself approaches the baseline gradually.`, formula: "W = 4σ; FWHM = 2√(2 ln 2)σ ≈ 2.355σ", app: "Width describes peak broadening. An integration window is not automatically a baseline width. The engine uses the export’s reported resolution rather than these teaching widths." },
    resolution: { title: "Resolution between adjacent peaks", body: `B and C have Rs = ${n(resolution)}. Move C closer or widen both peaks: Rs falls as overlap increases. In this example the worst adjacent retained pair has Rs = ${n(worst)}. Rs ≈ 1.5 is a common reference for Gaussian peaks; use the required specification.`, formula: `Rs = 2(tR₂ − tR₁) / (W₁ + W₂) = 2 × ${n(spacing)} / (${n(peakMetrics(peaks[2]).baselineWidth)} + ${n(peakMetrics(peaks[3]).baselineWidth)})`, app: "The app takes the lowest reported resolution after the marker. If the detected peak count is below the required count, decision resolution is set to zero. A half-height formula is Rs = 1.18ΔtR / (FWHM₁ + FWHM₂); do not mix width conventions." },
    last: { title: "Last peak and runtime limit", body: `D is the last peak at ${n(last.time)} min. The dashed line at 12 min is this example’s maximum last-peak time. The trace continues to 13 min, showing that last-peak time and total acquisition time are different.`, app: "The app checks the latest peak-table retention time against your maximum last-peak time. A compound that has not yet eluted cannot be counted as a detected peak." },
    pressure: { title: "Pump back-pressure", body: `The separate blue trace has a maximum of ${pressure} psi. The red line is the example limit of 4000 psi. Pressure comes from flow resistance, not from UV absorbance. Flow, solvent viscosity, temperature, and column dimensions can affect it.`, app: "The app finds the maximum pump-pressure trace value and checks that it is below your limit. The pressure slider is an independent teaching control, not a prediction of how the other sliders change pressure." },
    checks: { title: "How these measurements guide the app", body: "This example requires 5 peak-table entries including the marker, minimum Rs 1.5, last peak at or before 12 min, and pressure below 4000 psi. The cards below respond to your controls. The synthetic example knows all five components; it does not simulate peak detection when peaks merge.", app: "Upload checks use reported peak count, worst resolution, last-peak time, and pressure. Missing or extra peaks need attention. Retention changes %B; selectivity tests temperature, solvent, then ligand. Efficiency and gradient are not yet implemented." },
  };
  const note = descriptions[topic];
  function pick(index: number) { setSelected(index); if (["axes", "peaks", "t0", "last", "checks", "pressure", "resolution"].includes(topic)) setTopic(index === 0 ? "t0" : "peaks"); }
  const showWidth = topic === "width" || topic === "resolution";
  const widthPeaks = topic === "resolution" ? [peaks[2], peaks[3]] : [peak];

  return (
    <section className="flex flex-col gap-4" aria-label="Interactive chromatogram guide">
      <header>
        <h2 className="font-heading text-2xl">Read a chromatogram</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">An idealised isocratic UV example with one marker and four retained compounds. Choose a measurement, tap a peak, then change the controls to see what happens.</p>
      </header>
      <div className="flex flex-wrap gap-2" aria-label="Chromatogram measurements">
        {topics.map(([key, label]) => <button key={key} type="button" aria-pressed={topic === key} onClick={() => { setTopic(key); if (key === "t0") setSelected(0); if (key === "last") setSelected(4); }} className={`rounded-md border px-3 py-2 text-sm ${topic === key ? "border-[#0f6b56] bg-[#cfe8df] text-[#144237]" : "border-border bg-card hover:bg-accent"}`}>{label}</button>)}
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0 rounded-xl border border-border bg-card p-3 sm:p-5">
          <div className="overflow-x-auto">
            <svg viewBox="0 0 900 450" className="w-full min-w-[600px]" role="img" aria-labelledby={`${id}-title ${id}-desc`}>
              <title id={`${id}-title`}>Interactive UV chromatogram and pump-pressure trace</title>
              <desc id={`${id}-desc`}>Five components: marker at 1 minute, A at 3, B at 6, C at {n(6 + spacing)}, D at {n(last.time)}. Select a peak to inspect it. The lower plot shows pressure in psi.</desc>
              <defs><clipPath id={`${id}-clip`}><rect x="80" y="45" width="730" height="250" /></clipPath></defs>
              {[0, 50, 100, 150].map(v => <g key={v}><line x1="80" x2="810" y1={y(v)} y2={y(v)} stroke="#e5e7eb" /><text x="68" y={y(v) + 4} textAnchor="end" fontSize="12" fill="#475569">{v}</text></g>)}
              <line x1="80" x2="80" y1="45" y2="285" stroke={green} strokeWidth={topic === "axes" ? 3 : 1} />
              <line x1="80" x2="810" y1="285" y2="285" stroke={green} strokeWidth={topic === "axes" ? 3 : 1} />
              <text transform="translate(20 180) rotate(-90)" fontSize="14" textAnchor="middle" fill={green}>UV signal (mAU)</text>
              {[0, 2, 4, 6, 8, 10, 12, 13].map(v => <g key={v}><line x1={x(v)} x2={x(v)} y1="285" y2="291" stroke={green} /><text x={x(v)} y="310" textAnchor="middle" fontSize="12" fill="#475569">{v}</text></g>)}
              <text x="445" y="333" textAnchor="middle" fontSize="14" fill={green}>Time after injection (min)</text>
              <g clipPath={`url(#${id}-clip)`}>
                {(topic === "area" || topic === "height" || topic === "width") && <path d={`M${x(peak.time - 3 * peak.sigma)},${y(baseline)} ${area} L${x(peak.time + 3 * peak.sigma)},${y(baseline)} Z`} fill={green} opacity="0.16" />}
                <line x1="80" x2="810" y1={y(baseline)} y2={y(baseline)} stroke={topic === "baseline" ? amber : "#94a3b8"} strokeDasharray="5 4" strokeWidth={topic === "baseline" ? 3 : 1} />
                <path d={curve} fill="none" stroke={green} strokeWidth="2.5" />
                {["t0", "retention"].includes(topic) && <line x1={x(t0)} x2={x(t0)} y1="50" y2="285" stroke={amber} strokeDasharray="6 4" strokeWidth="2" />}
                {["last", "checks"].includes(topic) && <><line x1={x(12)} x2={x(12)} y1="45" y2="285" stroke="#be123c" strokeDasharray="6 4" /><text x={x(12) - 6} y="58" textAnchor="end" fontSize="12" fill="#be123c">12 min limit</text></>}
                {["peaks", "retention", "last"].includes(topic) && <line x1={x(peak.time)} x2={x(peak.time)} y1={y(baseline + peak.height)} y2="285" stroke={amber} strokeDasharray="4 3" strokeWidth="2" />}
                {topic === "height" && <><line x1={x(peak.time)} x2={x(peak.time)} y1={y(baseline)} y2={y(baseline + peak.height)} stroke={amber} strokeWidth="3" /><text x={x(peak.time) + 10} y={y(baseline + peak.height / 2)} fontSize="13" fill={amber}>h = {n(peak.height)} mAU</text></>}
                {showWidth && widthPeaks.map(p => {
                  const m = peakMetrics(p);
                  return <g key={p.label}>
                    <line x1={x(p.time - m.baselineWidth / 2)} x2={x(p.time + m.baselineWidth / 2)} y1={y(baseline)} y2={y(baseline)} stroke={amber} strokeWidth="4" />
                    <text x={x(p.time)} y={y(baseline) - 10} textAnchor="middle" fontSize="12" fill={amber}>W {n(m.baselineWidth)}</text>
                    {topic === "width" && <><line x1={x(p.time - m.fwhm / 2)} x2={x(p.time + m.fwhm / 2)} y1={y(baseline + p.height / 2)} y2={y(baseline + p.height / 2)} stroke={blue} strokeWidth="3" /><text x={x(p.time) + 12} y={y(baseline + p.height / 2) - 8} fontSize="12" fill={blue}>FWHM {n(m.fwhm)}</text></>}
                  </g>;
                })}
                {topic === "resolution" && <><line x1={x(6)} x2={x(6 + spacing)} y1="80" y2="80" stroke={amber} strokeWidth="2" /><text x={x(6 + spacing / 2)} y="68" textAnchor="middle" fontSize="13" fill={amber}>ΔtR = {n(spacing)} min</text></>}
              </g>
              {peaks.map((p, i) => <g key={p.label} role="button" tabIndex={0} aria-label={`Inspect ${p.label} at ${n(p.time)} minutes`} onClick={() => pick(i)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(i); } }} className="cursor-pointer outline-none focus:opacity-60">
                <circle cx={x(p.time)} cy={y(signal(p.time))} r="17" fill="transparent" />
                <circle cx={x(p.time)} cy={y(signal(p.time))} r={selected === i ? 5 : 3} fill={selected === i ? amber : green} />
                <text x={x(p.time)} y={y(signal(p.time)) - 14 - (i === 3 && spacing < 0.65 ? 18 : 0)} textAnchor="middle" fontSize="13" fontWeight="600" fill={selected === i ? amber : green}>{p.label}</text>
              </g>)}
              <text x="80" y="355" fontSize="13" fontWeight="600" fill={blue}>Pump pressure · same time axis</text>
              <line x1="80" x2="810" y1="408" y2="408" stroke="#94a3b8" />
              <line x1="80" x2="80" y1="350" y2="408" stroke="#94a3b8" />
              <text x="68" y="411" textAnchor="end" fontSize="11" fill={blue}>0</text>
              <text x="68" y="360" textAnchor="end" fontSize="11" fill={blue}>5000</text>
              <text x="22" y="391" fontSize="12" fill={blue}>psi</text>
              <path d={pressureCurve} fill="none" stroke={blue} strokeWidth={topic === "pressure" ? 3 : 2} />
              <line x1="80" x2="810" y1={408 - 4000 / 5500 * 58} y2={408 - 4000 / 5500 * 58} stroke="#be123c" strokeDasharray="5 4" />
              <text x="818" y={408 - 4000 / 5500 * 58 + 4} fontSize="11" fill="#be123c">4000 limit</text>
              <text x={x(4)} y={408 - pressure / 5500 * 58 - 7} textAnchor="middle" fontSize="12" fill={blue}>max {pressure} psi</text>
              <text x="80" y="435" fontSize="11" fill="#64748b">Illustrative signals; pressure and UV response have separate units.</text>
            </svg>
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Choose a peak">
            {peaks.map((p, i) => <button key={p.label} type="button" aria-pressed={selected === i} onClick={() => pick(i)} className={`rounded-md border px-3 py-1.5 text-sm ${selected === i ? "border-[#b36a13] bg-amber-50 text-amber-900" : "border-border"}`}>{p.label} · {n(p.time)} min</button>)}
          </div>
        </div>
        <aside className="rounded-xl border border-border bg-card p-5 text-sm leading-relaxed xl:sticky xl:top-4" aria-live="polite">
          <p className="text-xs tracking-widest text-[#0f6b56] uppercase">Selected measurement</p>
          <h3 className="mt-2 font-heading text-xl">{note.title}</h3>
          <p className="mt-3">{note.body}</p>
          {note.formula && <p className="mt-3 rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">{note.formula}</p>}
          <h4 className="mt-4 font-semibold">In the decision engine</h4>
          <p className="mt-2 text-muted-foreground">{note.app}</p>
        </aside>
      </div>
      <div className="grid gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Slider label="B–C spacing" value={spacing} min={0.4} max={2} step={0.05} unit="min" onChange={setSpacing} />
        <Slider label="Retained peak widths" value={width} min={0.6} max={1.6} step={0.05} unit="×" onChange={setWidth} />
        <Slider label="B response at 1× width" value={amount} min={40} max={120} step={5} unit="mAU" onChange={setAmount} />
        <Slider label="Last peak time" value={lastTime} min={9} max={12.8} step={0.1} unit="min" onChange={setLastTime} />
        <Slider label="Maximum pressure" value={pressure} min={500} max={5000} step={100} unit="psi" onChange={setPressure} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Check label="Known components" value="5 incl. marker" rule="Target: 5 peak-table entries" met />
        <Check label="Worst resolution" value={n(worst)} rule="Example minimum: 1.5" met={worst >= 1.5} />
        <Check label="Last peak" value={`${n(last.time)} min`} rule="Example maximum: 12 min" met={last.time <= 12} />
        <Check label="Maximum pressure" value={`${pressure} psi`} rule="Example limit: below 4000 psi" met={pressure < 4000} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-muted-foreground">Try reducing spacing, then narrowing the peaks. Both change resolution; increasing amount alone does not change this model’s Rs. Move the last peak beyond 12 minutes to fail the runtime check.</p>
        <button type="button" className="shrink-0 rounded-md border border-border bg-card px-3 py-2 hover:bg-accent" onClick={() => { setTopic("axes"); setSelected(2); setSpacing(1.2); setWidth(1); setAmount(85); setLastTime(11); setPressure(2300); }}>Reset example</button>
      </div>
    </section>
  );
}

function Slider({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void }) {
  const id = useId();
  return <div><label htmlFor={id} className="flex justify-between gap-2 text-sm font-medium"><span>{label}</span><span>{Number.isInteger(value) ? value : value.toFixed(2)} {unit}</span></label><input id={id} type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} className="mt-3 w-full accent-[#0f6b56]" /></div>;
}
function Check({ label, value, rule, met }: { label: string; value: string; rule: string; met: boolean }) {
  return <div className={`rounded-xl border p-4 ${met ? "border-[#b5d6c9] bg-[#edf6f1]" : "border-amber-300 bg-amber-50"}`}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p><p className="mt-2 text-xs">{rule} · {met ? "met" : "not met"}</p></div>;
}
