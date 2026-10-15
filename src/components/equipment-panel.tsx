"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Activity, Cylinder, LineChart, Atom, Sliders, Info, Cpu, Layers } from "lucide-react";
import { ChromatogramExplorer } from "@/components/chromatogram-explorer";
import { ChromatogramAnalysisComparison } from "@/components/chromatogram-analysis-comparison";
import { BeadDiagram } from "@/components/bead-diagram";
import { ColumnDiagram, type ColumnRunTrace } from "@/components/column-diagram";
import { ColumnRetentionAnimation } from "@/components/column-retention-animation";
import { FunctionNoteView, type FunctionNote } from "@/components/function-note";
import { HplcSketch } from "@/components/hplc-drawing";
import { KindMark } from "@/components/setting-legend";
import type { SettingKind } from "@/lib/setting-kind";
import { cn } from "@/lib/utils";

type Box = { left: number; top: number; width: number; height: number };

type Part = {
  id: string;
  label: string;
  note: FunctionNote;
  box: Box;
};

type Setup = {
  id: string;
  label: string;
  tagline: string;
  badge: string;
  src: string;
  width: number;
  height: number;
  parts: Part[];
};

const solvents: FunctionNote = {
  controlType: "Chemical",
  controlledParameters:
    "Mobile phase chemical identity (Solvent A aqueous buffer, Solvent B organic modifier e.g. ACN, MeOH), buffer pH, ionic strength.",
  does: "Solvent reservoirs containing high-purity mobile phase components. In reversed-phase HPLC, Bottle A is aqueous (water, often buffered to control analyte ionization), while Bottle B is organic modifier (ACN, MeOH, THF). Solvents govern analyte partition thermodynamics.",
  sets: "Mobile phase liquids. The pump blends them to deliver programmed %B. Chart solvents include ACN, MeOH, THF, Ethanol, IPA, Acetone, Propanol, and Butanol.",
  range: "%B is a percent of organic modifier from 0% to 100%. Buffer pH is typically 2.0 to 8.0.",
  changes:
    "Directly dictates retention factor (k) via elution strength (%B). Higher %B lowers k (faster elution); lower %B raises k. Switching organic modifier (e.g. ACN vs MeOH) changes chemical selectivity (α), pulling peak pairs apart or inverting elution order. Mobile phase bottles do not directly alter column efficiency N.",
};

const degasser: FunctionNote = {
  controlType: "Mechanical",
  controlledParameters: "Chamber vacuum level (< 100 mbar), in-line vacuum degassing rate.",
  does: "In-line vacuum degasser that continuously extracts dissolved gases (oxygen, nitrogen) from mobile phase solvents through semi-permeable membranes before entering the pump heads.",
  sets: "Operates continuously with instrument power. Sits in-line between the solvent bottles and the pump intake manifold.",
  range: "Self-regulating automated vacuum chamber. No user-typed parameter.",
  changes:
    "Prevents cavitation, micro-bubble formation in check valves, flow rate pulsations, baseline drift, and optical detector noise. Does not alter retention factor (k), selectivity (α), or column efficiency (N).",
};

const pumpChanges =
  "Flow rate governs total runtime, linear velocity (u), and column back-pressure (ΔP). Operating near optimal linear velocity optimizes theoretical plate efficiency (N) via the van Deemter equation. %B directly dictates retention factor (k). Selectivity (α) does not change from pump flow alone.";
const pumpRange =
  "Flow is in mL/min (typically 0.2–2.0 mL/min on 4.6 mm ID columns; 0.1–0.5 mL/min on 2.1 mm ID columns). %B is 0–100%. Max pressure: up to 400 bar (5800 psi).";

const pumpQuaternary: FunctionNote = {
  controlType: "Both",
  controlledParameters:
    "Volumetric flow rate (mL/min), mobile phase composition (%B), gradient elution program, max/min system pressure shutdown limits.",
  does: "Quaternary low-pressure gradient proportioning pump blending up to four solvent channels prior to a single high-pressure drive. Delivers precise flow rate and dynamic or isocratic %B blends.",
  sets: "Pump volumetric flow rate (mL/min) and %B mobile phase composition.",
  range: pumpRange,
  changes: pumpChanges,
};

const pumps12: FunctionNote = {
  controlType: "Both",
  controlledParameters:
    "Independent flow rates of Pump 1 and Pump 2 (mL/min), proportioned %B, min/max system pressure limits.",
  does: "Dual-pump high-pressure binary gradient system. Pump A (aqueous) and Pump B (organic) meter solvent under high pressure into an in-line mixer, minimizing system gradient dwell volume.",
  sets: "Independent delivery speeds of Pump 1 (aqueous) and Pump 2 (organic modifier).",
  range: pumpRange,
  changes: pumpChanges,
};

const detectorChanges =
  "Detection wavelength determines analyte molar absorptivity (ε) and peak visibility/sensitivity. Faster sampling rates prevent peak distortion. Detector settings do NOT alter retention time (tR), retention factor (k), selectivity (α), or back-pressure.";
const detectorRange =
  "Wavelength is in nm (typically 190–400 nm; e.g. 254 nm for aromatic compounds). Sampling rate: 1–100 Hz.";

const uvDetector: FunctionNote = {
  controlType: "Mechanical",
  controlledParameters:
    "Detection wavelength (λ in nm), optical bandwidth, response time constant (s), data sampling rate (Hz).",
  does: "Single or dual-wavelength UV-Vis spectrophotometric detector measuring analyte optical absorbance through a quartz flow cell over time, generating the chromatographic signal trace (mAU).",
  sets: "Monochromator detection wavelength (nm) and sampling frequency.",
  range: detectorRange,
  changes: detectorChanges,
};

const uvOrPda: FunctionNote = {
  controlType: "Mechanical",
  controlledParameters:
    "Monitored wavelength channel(s), spectral bandwidth, full UV-Vis spectrum collection (190–800 nm), sampling rate.",
  does: "Photodiode Array (PDA / DAD) detector recording multi-wavelength absorbance spectra simultaneously across 190–800 nm, enabling spectral peak purity verification and compound library identification.",
  sets: "Monitored wavelength channel(s), spectral range, and acquisition frequency.",
  range: "190–800 nm spectral range. Sampling rate: 1–100 Hz.",
  changes: detectorChanges,
};

const oven: FunctionNote = {
  controlType: "Both",
  controlledParameters: "Column compartment temperature (T in °C).",
  does: "Thermostatted forced-air or aluminium-block column compartment maintaining the separation column at a precise, stable operating temperature.",
  sets: "Column compartment temperature (°C).",
  range: "Ambient (~20°C) to 60°C (standard method development range; up to 80°C).",
  changes:
    "Elevating temperature lowers mobile phase viscosity, reducing hydraulic back-pressure. Crucially, temperature alters chromatographic selectivity (α) and retention (k) via the van 't Hoff relationship (ln k = -ΔH°/RT + ΔS°/R + ln Φ); differing analyte transfer enthalpies shift relative peak spacing.",
};

const column: FunctionNote = {
  controlType: "Both",
  controlledParameters:
    "Stationary phase bonded ligand (C18, C8, Phenyl-Hexyl, Biphenyl), column length (L in mm), internal diameter (dc in mm), particle size (dp in μm), particle morphology (SPP core-shell vs FPP fully porous), pore size (Å), carbon loading (%C).",
  does: "The physical heart of the HPLC separation where differential partitioning between stationary phase and mobile phase occurs.",
  sets: "Stationary phase ligand chemistry, column dimensions, and packed particle morphology.",
  range: "Length: 50–250 mm; ID: 2.1–4.6 mm; Particle diameter: 1.8–5.0 μm; Pore diameter: 90–300 Å.",
  changes:
    "Stationary phase ligand is the primary determinant of chemical selectivity (α). Column length (L) and particle size (dp) dictate column efficiency (N = L / H) and back-pressure (ΔP ∝ L / dp²). Internal diameter (dc) dictates required volumetric flow rate.",
};

const injectionChanges =
  "Sample injection volume directly determines peak area, apex height, and signal-to-noise ratio. Excessive injection volume or injecting sample in a solvent stronger than the mobile phase causes extra-column band broadening and mass overload, degrading column efficiency (N) and resolution (Rs). Standard analytical volumes do not alter retention factor (k) or selectivity (α).";
const injectionRange =
  "Typically 5–50 µL calibrated loop volume (e.g. 10 or 20 µL loop).";

const manualInjector: FunctionNote = {
  controlType: "Mechanical",
  controlledParameters: "Sample injection loop volume (μL), LOAD / INJECT valve position.",
  does: "Rheodyne 6-port manual injection valve with an external calibrated sample loop. The sample is introduced with a microsyringe in the LOAD position and swept into the high-pressure column flow path in the INJECT position.",
  sets: "Manual sample introduction. The calibrated sample loop volume sets the injection volume.",
  range: injectionRange,
  changes: injectionChanges,
};

const autosampler: FunctionNote = {
  controlType: "Mechanical",
  controlledParameters:
    "Programmable injection volume (μL), sample vial tray position, needle draw speed, needle wash routine.",
  does: "Automated robotic autosampler providing high-precision sample injections from microvials with programmable injection volume, needle wash routines, and optional sample chilling.",
  sets: "Injection volume (μL) and automated vial injection sequence.",
  range: "0.1–100 µL programmable range.",
  changes: injectionChanges,
};

const software: FunctionNote = {
  controlType: "Mechanical",
  controlledParameters:
    "Data acquisition frequency (Hz), integration slope sensitivity (μV/min), peak width threshold, baseline drift correction, minimum area/height reject, calibration curves, automated report generation.",
  does: "Chromatography Data System (CDS - LabSolutions) controlling instrument modules, recording digitized detector signals, integrating peak baselines, and calculating chromatographic parameters (k, Rs, N, peak area, S/N).",
  sets: "Automated sequence timing, peak detection algorithms, system suitability metrics, and chromatographic reports.",
  range: "Integration slope: 0–1000 μV/min; peak width: 1–60 s; data rate: 1–100 Hz.",
  changes:
    "Integration settings determine whether co-eluting peaks or tailing shoulders are integrated as separate peaks or a single peak. Setting appropriate thresholds ensures all compounds are detected without integrating baseline noise. Does not alter the physical chemical separation inside the column.",
};

function box(x: number, y: number, w: number, h: number, imgW: number, imgH: number, pad = 2): Box {
  const left = Math.max(0, x - pad);
  const top = Math.max(0, y - pad);
  const right = Math.min(imgW, x + w + pad);
  const bottom = Math.min(imgH, y + h + pad);
  return {
    left: (left / imgW) * 100,
    top: (top / imgH) * 100,
    width: ((right - left) / imgW) * 100,
    height: ((bottom - top) / imgH) * 100,
  };
}

const setups: Setup[] = [
  {
    id: "hplc-1-2-5",
    label: "HPLC 1, 2, and 5",
    tagline: "Quaternary Low-Pressure Proportioning",
    badge: "Manual Injector · UV",
    src: "/equipment/hplc-1-2-5.png",
    width: 387,
    height: 422,
    parts: [
      { id: "solvents", label: "Solvents", note: solvents, box: box(21, 20, 171, 111, 387, 422) },
      { id: "degasser", label: "Degasser", note: degasser, box: box(29, 141, 161, 47, 387, 422) },
      { id: "uv", label: "UV detector", note: uvDetector, box: box(30, 201, 162, 89, 387, 422) },
      {
        id: "pump",
        label: "Pump with quaternary valve",
        note: pumpQuaternary,
        box: box(20, 307, 169, 93, 387, 422),
      },
      {
        id: "software",
        label: "LabSolutions CDS & Controller",
        note: software,
        box: box(205, 127, 162, 92, 387, 422),
      },
      {
        id: "oven",
        label: "Column oven",
        note: oven,
        box: box(205, 219, 162, 54, 387, 422),
      },
      {
        id: "column",
        label: "HPLC column",
        note: column,
        box: box(205, 277, 162, 56, 387, 422),
      },
      {
        id: "injector",
        label: "Manual injector",
        note: manualInjector,
        box: box(205, 337, 162, 65, 387, 422),
      },
    ],
  },
  {
    id: "hplc-3",
    label: "HPLC 3",
    tagline: "Binary High-Pressure Mixing",
    badge: "Autosampler · UV/PDA",
    src: "/equipment/hplc-3.png",
    width: 399,
    height: 655,
    parts: [
      { id: "solvents", label: "Solvents", note: solvents, box: box(20, 20, 164, 114, 399, 655) },
      { id: "degasser", label: "Degasser", note: degasser, box: box(20, 134, 164, 49, 399, 655) },
      { id: "pump-1", label: "Pump 1", note: pumps12, box: box(23, 183, 158, 89, 399, 655) },
      { id: "pump-2", label: "Pump 2", note: pumps12, box: box(23, 277, 158, 89, 399, 655) },
      {
        id: "software",
        label: "LabSolutions CDS & Controller",
        note: software,
        box: box(221, 187, 158, 87, 399, 655),
      },
      {
        id: "detector",
        label: "UV or PDA detector",
        note: uvOrPda,
        box: box(221, 277, 158, 93, 399, 655),
      },
      {
        id: "oven",
        label: "Column oven",
        note: oven,
        box: box(221, 370, 158, 130, 399, 655),
      },
      {
        id: "column",
        label: "HPLC column",
        note: column,
        box: box(221, 505, 158, 134, 399, 655),
      },
      { id: "autosampler", label: "Autosampler", note: autosampler, box: box(23, 369, 163, 270, 399, 655) },
    ],
  },
  {
    id: "hplc-6",
    label: "HPLC 6",
    tagline: "Quaternary Mixing with Automated Sampling",
    badge: "Autosampler · UV/PDA",
    src: "/equipment/hplc-6.png",
    width: 400,
    height: 565,
    parts: [
      { id: "solvents", label: "Solvents", note: solvents, box: box(21, 20, 164, 116, 400, 565) },
      { id: "degasser", label: "Degasser", note: degasser, box: box(21, 137, 164, 47, 400, 565) },
      {
        id: "pump",
        label: "Pump with quaternary valve",
        note: pumpQuaternary,
        box: box(20, 184, 168, 90, 400, 565),
      },
      {
        id: "software",
        label: "LabSolutions CDS & Controller",
        note: software,
        box: box(222, 93, 158, 88, 400, 565),
      },
      {
        id: "detector",
        label: "UV or PDA detector",
        note: uvOrPda,
        box: box(222, 183, 158, 93, 400, 565),
      },
      {
        id: "oven",
        label: "Column oven",
        note: oven,
        box: box(222, 276, 158, 130, 400, 565),
      },
      {
        id: "column",
        label: "HPLC column",
        note: column,
        box: box(222, 410, 158, 134, 400, 565),
      },
      { id: "autosampler", label: "Autosampler", note: autosampler, box: box(24, 275, 164, 271, 400, 565) },
    ],
  },
];

function partKind(id: string): SettingKind | null {
  if (id === "solvents") return "chemical";
  if (id === "pump" || id.startsWith("pump") || id === "oven" || id === "column") return "both";
  if (
    id === "uv" ||
    id === "detector" ||
    id === "injector" ||
    id === "autosampler" ||
    id === "degasser" ||
    id === "software" ||
    id === "controller"
  )
    return "mechanical";
  return null;
}

function annotationName(part: Part): string {
  if (part.id === "controller" || part.id === "software") return "CDS & Controller";
  if (part.id === "pump") return "Pump";
  if (part.id === "oven") return "Column Oven";
  if (part.id === "column") return "HPLC Column";
  return part.label;
}

function partSide(part: Part): "left" | "right" {
  return part.box.left + part.box.width / 2 < 50 ? "left" : "right";
}

const equipmentTabs = [
  {
    id: "column",
    label: "Column",
    title: "Column Anatomy",
    description: "Physical dimensions, phase coatings, and retention animation",
    badge: "Dimensions",
    icon: Cylinder,
  },
  {
    id: "hplc",
    label: "HPLC",
    title: "HPLC Instruments",
    description: "Interactive instrument setups, pumps, valves, and UV/PDA detectors",
    badge: "Setups",
    icon: Activity,
  },
  {
    id: "beads",
    label: "Beads",
    title: "Silica Particles",
    description: "Pores, superficially porous (SPP) core-shell vs fully porous",
    badge: "Microstructure",
    icon: Atom,
  },
  {
    id: "chromatogram",
    label: "Chromatogram",
    title: "Chromatograms",
    description: "Signal resolution, peak integration, and retention time metrics",
    badge: "Traces",
    icon: LineChart,
  },
] as const;

function NameColumn({
  parts,
  side,
  setLabel,
}: {
  parts: Part[];
  side: "left" | "right";
  setLabel: (id: string, node: HTMLParagraphElement | null) => void;
}) {
  return (
    <div className={"flex h-full flex-col justify-evenly " + (side === "left" ? "items-end" : "items-start")}>
      {parts.map((part) => (
        <p
          key={part.id}
          ref={(node) => setLabel(part.id, node)}
          data-hplc-label={annotationName(part)}
          className="whitespace-nowrap text-xs leading-none font-semibold text-foreground/90 py-1"
        >
          {annotationName(part)}
        </p>
      ))}
    </div>
  );
}

function HplcDiagram({
  setup,
  openId,
  onEnter,
  onLeave,
  onPick,
}: {
  setup: Setup;
  openId: string | null;
  onEnter: (id: string) => void;
  onLeave: (id: string) => void;
  onPick: (id: string) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);
  const labels = useRef(new Map<string, HTMLParagraphElement>());
  const [frame, setFrame] = useState({ w: 0, h: 0 });
  const [callouts, setCallouts] = useState<{ id: string; points: string }[]>([]);
  const left = setup.parts.filter((part) => partSide(part) === "left");
  const right = setup.parts.filter((part) => partSide(part) === "right");

  useLayoutEffect(() => {
    const frameEl = frameRef.current;
    const imageEl = imageRef.current;
    if (!frameEl || !imageEl) return;

    const measure = () => {
      const root = frameEl.getBoundingClientRect();
      const img = imageEl.getBoundingClientRect();
      if (root.width < 2 || img.width < 2) return;
      const next: { id: string; points: string }[] = [];
      for (const part of setup.parts) {
        const node = labels.current.get(part.id);
        if (!node) continue;
        const label = node.getBoundingClientRect();
        const side = partSide(part);
        const yPart = img.top - root.top + ((part.box.top + part.box.height / 2) / 100) * img.height;
        const xPart =
          side === "left"
            ? img.left - root.left + (part.box.left / 100) * img.width
            : img.left - root.left + ((part.box.left + part.box.width) / 100) * img.width;
        const yStart = label.top - root.top + label.height / 2;
        const xStart = side === "left" ? label.right - root.left + 4 : label.left - root.left - 4;
        const xBend = side === "left" ? img.left - root.left - 1 : img.right - root.left + 1;
        const round = (value: number) => Math.round(value * 10) / 10;
        next.push({
          id: part.id,
          points: `${round(xStart)},${round(yStart)} ${round(xBend)},${round(yPart)} ${round(xPart)},${round(yPart)}`,
        });
      }
      setFrame({ w: root.width, h: root.height });
      setCallouts(next);
    };

    measure();
    const img = imageEl.querySelector("img");
    img?.addEventListener("load", measure);
    const observer = new ResizeObserver(measure);
    observer.observe(frameEl);
    observer.observe(imageEl);
    return () => {
      observer.disconnect();
      img?.removeEventListener("load", measure);
    };
  }, [setup]);

  return (
    <figure id="hplc-diagram" className="overflow-x-auto rounded-xl bg-card p-3 ring-1 ring-foreground/10 sm:p-5">
      <div
        ref={frameRef}
        className="relative grid min-w-[20rem] grid-cols-[max-content_minmax(8rem,1fr)_max-content] items-stretch gap-x-3 sm:gap-x-6"
      >
        <NameColumn
          parts={left}
          side="left"
          setLabel={(id, node) => {
            if (node) labels.current.set(id, node);
            else labels.current.delete(id);
          }}
        />
        <div ref={imageRef} className="relative min-w-0 flex items-center justify-center">
          <HplcSketch id={setup.id} width={setup.width} height={setup.height} />
          {setup.parts.map((part) => {
            const active = openId === part.id;
            return (
              <button
                key={part.id}
                type="button"
                aria-label={part.label}
                aria-expanded={active}
                className="absolute rounded-sm transition-all cursor-pointer"
                style={{
                  left: `${part.box.left}%`,
                  top: `${part.box.top}%`,
                  width: `${part.box.width}%`,
                  height: `${part.box.height}%`,
                  backgroundColor: active ? "color-mix(in oklab, var(--hp-brand) 25%, transparent)" : "transparent",
                  outline: active ? "2.5px solid var(--hp-brand)" : "2px solid transparent",
                }}
                onMouseEnter={() => onEnter(part.id)}
                onMouseLeave={() => onLeave(part.id)}
                onClick={() => onPick(part.id)}
              />
            );
          })}
        </div>
        <NameColumn
          parts={right}
          side="right"
          setLabel={(id, node) => {
            if (node) labels.current.set(id, node);
            else labels.current.delete(id);
          }}
        />
        {frame.w > 0 ? (
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox={`0 0 ${frame.w} ${frame.h}`}
            aria-hidden="true"
          >
            <defs>
              <marker
                id="hplc-arrow"
                markerWidth="6"
                markerHeight="6"
                refX="5.5"
                refY="3"
                orient="auto"
                markerUnits="userSpaceOnUse"
              >
                <path d="M0,0 L6,3 L0,6 Z" fill="var(--hp-brand)" />
              </marker>
            </defs>
            {callouts.map((callout) => (
              <polyline
                key={callout.id}
                points={callout.points}
                fill="none"
                stroke="var(--hp-brand)"
                strokeWidth="1.5"
                strokeLinejoin="round"
                markerEnd="url(#hplc-arrow)"
              />
            ))}
          </svg>
        ) : null}
      </div>
    </figure>
  );
}

export function EquipmentPanel({
  columnRuns,
  ligands,
}: {
  columnRuns: ColumnRunTrace[];
  ligands: readonly string[];
}) {
  const [view, setView] = useState<(typeof equipmentTabs)[number]["id"]>("hplc");
  const [setupId, setSetupId] = useState(setups[0].id);
  const [openId, setOpenId] = useState<string | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const setup = setups.find((item) => item.id === setupId) ?? setups[0];
  const open = setup.parts.find((part) => part.id === openId) ?? null;

  return (
    <div id="equipment" className="flex flex-col gap-6 pb-12">
      <header>
        <p className="text-xs tracking-[0.16em] text-[var(--hp-brand)] uppercase">Laboratory Instrumentation</p>
        <h1 className="mt-1 font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Equipment & Anatomy
        </h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">
          Explore interactive instruments, column geometries, silica bead microstructures, and chromatographic traces.
        </p>
      </header>

      {/* Hero Showcase Subheading Cards */}
      <div id="equipment-tabs" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {equipmentTabs.map((tab) => {
          const selected = tab.id === view;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              aria-pressed={selected}
              className={cn(
                "group relative flex flex-col justify-between gap-3.5 rounded-2xl border p-4 text-left transition-all duration-200 cursor-pointer select-none outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.98]",
                selected
                  ? "border-[var(--hp-brand)] bg-[var(--hp-soft)] shadow-md ring-2 ring-[var(--hp-brand)]/25 -translate-y-0.5"
                  : "border-border/80 bg-card hover:border-[var(--hp-brand)]/70 hover:bg-[var(--hp-soft)]/40 hover:-translate-y-1 hover:shadow-md"
              )}
              onClick={() => setView(tab.id)}
            >
              <div className="flex w-full items-start justify-between gap-2">
                <div
                  className={cn(
                    "flex size-11 items-center justify-center rounded-xl transition-all duration-200",
                    selected
                      ? "bg-[var(--hp-brand)] text-[var(--hp-on-brand)] shadow-sm ring-2 ring-[var(--hp-brand)]/30"
                      : "bg-muted text-muted-foreground group-hover:bg-[var(--hp-brand)]/15 group-hover:text-[var(--hp-brand)] group-hover:scale-105"
                  )}
                >
                  <Icon className="size-5.5 shrink-0" aria-hidden="true" />
                </div>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase transition-colors",
                    selected
                      ? "border border-[var(--hp-brand)]/30 bg-[var(--hp-brand)]/20 text-[var(--hp-brand)]"
                      : "border border-border/50 bg-muted/70 text-muted-foreground group-hover:border-[var(--hp-brand)]/30 group-hover:text-[var(--hp-brand)]"
                  )}
                >
                  {tab.badge}
                </span>
              </div>
              <div>
                <h2
                  className={cn(
                    "font-heading text-base font-bold transition-colors",
                    selected ? "text-[var(--hp-ink)]" : "text-foreground group-hover:text-[var(--hp-brand)]"
                  )}
                >
                  {tab.title}
                </h2>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  {tab.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Column Subtab */}
      {view === "column" ? (
        <div className="flex flex-col gap-6">
          <ColumnDiagram runs={columnRuns} />
          <ColumnRetentionAnimation />
        </div>
      ) : null}

      {/* Chromatogram Subtab */}
      {view === "chromatogram" ? (
        <div className="flex flex-col gap-6">
          <ChromatogramAnalysisComparison />
          <ChromatogramExplorer />
        </div>
      ) : null}

      {/* Beads Subtab */}
      {view === "beads" ? <BeadDiagram ligands={ligands} /> : null}

      {/* HPLC Instruments Subtab */}
      {view === "hplc" ? (
        <div className="flex flex-col gap-6">
          <div className="grid items-start gap-6 lg:grid-cols-12">
            {/* Main Instrument Stage (8 Cols) */}
            <div className="flex flex-col gap-5 lg:col-span-8">
              <header>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--hp-brand)]/30 bg-[var(--hp-brand)]/10 px-2.5 py-0.5 text-xs font-semibold tracking-wider text-[var(--hp-brand)] uppercase">
                    <Activity className="size-3.5" />
                    Instrument Architecture
                  </span>
                </div>
                <h2 className="mt-1.5 font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  HPLC System Configurations & Flow Path
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Select an HPLC instrument to examine its hardware modules. Hover or tap any component to inspect its
                  function, adjustable settings, and impact on chromatographic separation.
                </p>
              </header>

              {/* Instrument Setup Selector Cards */}
              <div id="equipment-choices" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {setups.map((item) => {
                  const selected = item.id === setup.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={selected}
                      className={cn(
                        "flex flex-col justify-between gap-2 rounded-xl border p-3.5 text-left transition-all cursor-pointer shadow-2xs select-none",
                        selected
                          ? "border-[var(--hp-brand)] bg-[var(--hp-soft)] ring-2 ring-[var(--hp-brand)]/20 shadow-xs"
                          : "border-border/80 bg-card hover:bg-muted/50 hover:border-border"
                      )}
                      onClick={() => {
                        setSetupId(item.id);
                        setOpenId(null);
                        setPinnedId(null);
                      }}
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="font-heading text-sm font-bold text-foreground">{item.label}</span>
                          <span className="rounded-full bg-muted border border-border/70 px-2 py-0.2 text-[10px] font-semibold text-muted-foreground">
                            {item.badge}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{item.tagline}</p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Interactive Schematic Diagram */}
              <div className="flex flex-col gap-2 rounded-2xl border border-border/80 bg-card p-4 sm:p-5 shadow-xs">
                <div className="flex items-center justify-between border-b border-border/60 pb-3">
                  <span className="font-heading text-sm font-bold text-foreground">
                    {setup.label} Schematic Diagram
                  </span>
                  <span className="text-xs text-muted-foreground">Hover or click any module box</span>
                </div>
                <HplcDiagram
                  setup={setup}
                  openId={open?.id ?? null}
                  onEnter={(id) => setOpenId(id)}
                  onLeave={(id) => setOpenId((current) => (current === id && pinnedId !== id ? null : current))}
                  onPick={(id) => {
                    setPinnedId((current) => {
                      const next = current === id ? null : id;
                      setOpenId(next);
                      return next;
                    });
                  }}
                />
              </div>
            </div>

            {/* Right Component Inspector Panel (4 Cols) */}
            <aside
              id="equipment-note"
              className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-card p-4 sm:p-5 shadow-xs lg:sticky lg:top-4 lg:col-span-4"
            >
              {open ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--hp-brand)]/30 bg-[var(--hp-brand)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--hp-brand)] uppercase">
                      Component Inspector
                    </span>
                    {partKind(open.id) ? <KindMark kind={partKind(open.id) as SettingKind} /> : null}
                  </div>
                  <FunctionNoteView title={open.label} note={open.note} />
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-2 border-b border-border/60 pb-3">
                    <Cpu className="size-4 text-[var(--hp-brand)]" />
                    <h3 className="font-heading text-sm font-bold text-foreground">8 Mandatory Hardware Modules</h3>
                  </div>

                  <div className="flex flex-col gap-2 text-xs text-muted-foreground">
                    <p className="leading-relaxed">
                      All 8 components mandated for the FC1 flowchart are integrated into the flow path. Select any module to inspect its function, control type, and parameters:
                    </p>

                    <div className="flex flex-col gap-1.5 mt-1">
                      {setup.parts.map((p, idx) => (
                        <button
                          key={p.id}
                          type="button"
                          className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/20 px-2.5 py-1.5 text-left text-xs font-medium text-foreground transition-all hover:border-[var(--hp-brand)] hover:bg-[var(--hp-soft)]/20 cursor-pointer"
                          onClick={() => {
                            setPinnedId(p.id);
                            setOpenId(p.id);
                          }}
                        >
                          <span className="flex items-center gap-2">
                            <span className="size-4 rounded-full bg-[var(--hp-brand)]/15 text-[var(--hp-brand)] text-[10px] font-bold flex items-center justify-center">
                              {idx + 1}
                            </span>
                            {p.label}
                          </span>
                          {partKind(p.id) ? (
                            <span className="text-[10px] font-semibold text-muted-foreground capitalize">
                              {partKind(p.id)}
                            </span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-[var(--hp-brand)]/30 bg-[var(--hp-soft)]/20 p-3 text-[11px] leading-relaxed text-muted-foreground dark:bg-[var(--hp-soft)]/10">
                    <strong className="text-foreground">Exam Tip:</strong> Ensure your FC1 flowchart includes all 8 components with explicit Chemical/Mechanical control types.
                  </div>
                </div>
              )}
            </aside>
          </div>

          {/* Direct vs Calculated Chromatogram Responses Section */}
          <ChromatogramAnalysisComparison />
        </div>
      ) : null}
    </div>
  );
}
