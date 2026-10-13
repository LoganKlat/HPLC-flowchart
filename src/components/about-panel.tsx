"use client";

import { type ReactNode } from "react";
import {
  FileText,
  Sliders,
  CheckCircle2,
  TrendingDown,
  Compass,
  Layers,
  Calculator,
  HelpCircle,
  ExternalLink,
  ChevronRight,
  BookOpen,
  Split,
  ArrowRight,
  Clock,
  Gauge,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";

const stages = [
  {
    step: "1",
    title: "Retention (k)",
    status: "Active",
    desc: "Isocratic %B adjustment until all peaks elute within acceptable runtime (k ≈ 1–10).",
  },
  {
    step: "2",
    title: "Selectivity (α)",
    status: "Active",
    desc: "Temperature (40°C, 60°C), organic modifier (Nomogram), and stationary phase ligand.",
  },
  {
    step: "3",
    title: "Efficiency (N)",
    status: "Planned",
    desc: "Column length, internal diameter, particle diameter (dp), and flow rate tuning.",
  },
  {
    step: "4",
    title: "Gradient (GRA)",
    status: "Planned",
    desc: "Programmed %B slopes for wide-polarity mixtures where isocratic elution is insufficient.",
  },
];

const filenameParts = [
  { text: "GR09-05-3", label: "Run ID", desc: "Group, injection & run numbers (ignored during auto-fill)" },
  { text: "ACN", label: "Solvent", desc: "Organic modifier (Acetonitrile)" },
  { text: "3", label: "pH", desc: "Aqueous phase pH" },
  { text: "ISO", label: "Method", desc: "Isocratic pump delivery (vs GRA for gradient)" },
  { text: "90", label: "%B", desc: "90% organic mobile phase" },
  { text: "1.5", label: "Flow", desc: "1.5 mL/min volumetric flow rate" },
  { text: "20", label: "Injection", desc: "20 µL sample loop volume" },
  { text: "CP", label: "Sample", desc: "Test sample (CP vs BLANK)" },
  { text: "0.1", label: "Conc", desc: "0.1 mg/mL concentration" },
  { text: "C18aqP", label: "Ligand", desc: "C18aq stationary phase" },
  { text: "150x4.6x5", label: "Column Dimensions", desc: "150 mm length × 4.6 mm ID × 5 µm particle" },
  { text: "amb", label: "Temperature", desc: "Ambient oven temperature (~25°C)" },
  { text: "254", label: "Wavelength", desc: "254 nm UV detection" },
];

export function AboutPanel() {
  return (
    <div id="about-page" className="flex flex-col gap-8 pb-16 max-w-7xl mx-auto">
      {/* Header */}
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--hp-brand)]/30 bg-[var(--hp-brand)]/10 px-2.5 py-0.5 text-xs font-semibold tracking-wider text-[var(--hp-brand)] uppercase">
            <BookOpen className="size-3.5" />
            User Guide & Protocol Reference
          </span>
        </div>
        <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl">
          HPLC Method Development System
        </h1>
        <p className="max-w-4xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Upload chromatographic runs exported from Shimadzu LabSolutions. The engine validates peak integration tables
          against your target specifications, identifies critical pairs, and algorithmically recommends the optimal next run
          to systematically develop a robust reversed-phase HPLC method.
        </p>
      </header>

      {/* 4-Stage Method Development Roadmap */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stages.map((stage) => (
          <div
            key={stage.step}
            className="flex flex-col justify-between rounded-xl border border-border/80 bg-card p-4 shadow-2xs transition-all hover:border-[var(--hp-brand)]/40 hover:bg-[var(--hp-soft)]/20"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="flex size-6 items-center justify-center rounded-full bg-[var(--hp-brand)]/15 font-mono text-xs font-bold text-[var(--hp-brand)]">
                  {stage.step}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                    stage.status === "Active"
                      ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                      : "border border-border/60 bg-muted text-muted-foreground"
                  )}
                >
                  {stage.status}
                </span>
              </div>
              <h3 className="mt-2.5 font-heading text-sm font-bold text-foreground">{stage.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{stage.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Widescreen 12-Column Layout */}
      <div className="grid items-start gap-8 lg:grid-cols-12">
        {/* Main Content Sections (8 Cols) */}
        <div className="flex flex-col gap-8 lg:col-span-8">
          {/* Section 1: Run 1 Setup & File Autofill */}
          <GuideSection id="about-setup" number="1" title="Set Up Run 1 & Filename Autofill">
            <p>
              Method development begins with establishing initial chromatographic conditions and defining your target quality
              specifications in the left sidebar:
            </p>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 my-1">
              <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                <strong className="text-foreground text-xs block mb-1">Target Quality Rules</strong>
                <p className="text-xs text-muted-foreground">
                  Specify minimum required peak count, minimum critical-pair resolution (typically Rs ≥ 1.5), maximum allowed runtime
                  (minutes), and system back-pressure limit (psi).
                </p>
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                <strong className="text-foreground text-xs block mb-1">Instrumental Conditions</strong>
                <p className="text-xs text-muted-foreground">
                  Record organic solvent, %B, flow rate, injection volume, sample concentration, column stationary phase, tube dimensions,
                  particle size, oven temperature, and wavelength.
                </p>
              </div>
            </div>

            <p className="text-sm font-semibold text-foreground pt-1">Automatic Condition Autofill via Filename</p>
            <p className="text-xs text-muted-foreground">
              You can instantly populate Run 1 conditions by structuring your exported filename according to the standard lab syntax:
            </p>

            {/* Interactive Filename Decoder */}
            <div className="rounded-xl border border-border/80 bg-muted/30 p-3 sm:p-4">
              <p className="font-mono text-xs font-bold text-foreground break-all mb-3 text-center sm:text-left">
                GR09-05-3-ACN-3-ISO-90-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254
              </p>
              <div className="flex flex-wrap gap-1.5">
                {filenameParts.map((part) => (
                  <div
                    key={part.label}
                    className="group relative flex flex-col rounded-md border border-border/70 bg-card px-2 py-1 text-center shadow-2xs hover:border-[var(--hp-brand)]"
                  >
                    <span className="font-mono text-xs font-bold text-[var(--hp-brand)]">{part.text}</span>
                    <span className="text-[9px] font-semibold uppercase text-muted-foreground">{part.label}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                <em>Note:</em> &ldquo;amb&rdquo; denotes ambient temperature (~25°C). Group, injection, and instrument indices are safely ignored during parsing.
              </p>
            </div>

            <p className="text-xs text-muted-foreground">
              Supported file types include CSV, ASCII TXT, and Excel (.xlsx) workbooks exported from Shimadzu LabSolutions.
              The parser searches dynamically for standard table headers (such as &ldquo;Peak Table&rdquo;) rather than hardcoded cell coordinates.
            </p>
          </GuideSection>

          {/* Section 2: How Results Are Assessed */}
          <GuideSection id="about-results" number="2" title="Chromatographic Assessment & Acceptance Criteria">
            <p>
              When a chromatogram is uploaded, detector absorbance (mAU) and pump pressure (psi) are extracted alongside the peak integration table.
              The run is evaluated against four strict pass/fail criteria:
            </p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 my-2">
              <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-card p-3 shadow-2xs">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[var(--hp-brand)]/15 text-[var(--hp-brand)]">
                  <Activity className="size-4" />
                </span>
                <div>
                  <h4 className="text-xs font-bold text-foreground">1. Peak Count</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Must equal the target specification. Fewer peaks indicates co-elution; extra peaks triggers an impurity investigation.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-card p-3 shadow-2xs">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[var(--hp-brand)]/15 text-[var(--hp-brand)]">
                  <Split className="size-4" />
                </span>
                <div>
                  <h4 className="text-xs font-bold text-foreground">2. Critical-Pair Resolution (Rs)</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Evaluated from the worst adjacent resolution after the marker. Rs ≥ 1.5 indicates baseline separation.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-card p-3 shadow-2xs">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[var(--hp-brand)]/15 text-[var(--hp-brand)]">
                  <Clock className="size-4" />
                </span>
                <div>
                  <h4 className="text-xs font-bold text-foreground">3. Maximum Runtime (tR)</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    The latest-eluting peak must elute at or before your maximum allowed runtime limit.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-card p-3 shadow-2xs">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[var(--hp-brand)]/15 text-[var(--hp-brand)]">
                  <Gauge className="size-4" />
                </span>
                <div>
                  <h4 className="text-xs font-bold text-foreground">4. System Back-Pressure (ΔP)</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Peak pump back-pressure must remain safely below the specified pressure rating of column and hardware.
                  </p>
                </div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              <strong>Void Volume Marker (t₀):</strong> The earliest reported peak is treated as the unretained void marker (uracil), establishing
              dead time t₀ and retention factor <code>k = (tR − t₀) / t₀</code>. Extra unexpected peaks require manual investigation rather than passing.
            </p>
          </GuideSection>

          {/* Section 3: Retention Stage */}
          <GuideSection id="about-retention" number="3" title="Stage 1: Retention Optimization (%B Ladder & Modeling)">
            <p>
              Reversed-phase method development initiates at high mobile phase strength (typically 90–100% B). Lowering %B increases
              stationary phase retention, spreading peaks across the chromatogram.
            </p>

            <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-muted/20 p-3.5 my-1 text-xs">
              <strong className="text-foreground">Systematic %B Stepping Algorithm:</strong>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>
                  <strong>10% Decrements:</strong> If too few peaks are resolved and the last peak elutes within half the allowed runtime limit,
                  the engine recommends dropping %B by 10 percentage points (e.g. 90% → 80% → 70%).
                </li>
                <li>
                  <strong>Linear Extrapolation Fit:</strong> As soon as the last peak elutes past half the allowed runtime, the engine switches
                  from fixed 10% steps to a linear fit of log k vs %B, extrapolating the exact minimum %B that utilizes the full target runtime.
                </li>
                <li>
                  <strong>Statistical Outlier Filtering (Dixon&apos;s Q-Test):</strong> Prior to regression fitting, void marker times (t₀) undergo
                  a 90% confidence Q-test to exclude anomalous runs caused by flow fluctuations or injection errors.
                </li>
                <li>
                  <strong>Second Minimum Confirmation:</strong> Once the calculated minimum %B run is uploaded, the line is re-fitted with the new
                  datapoint to fine-tune the final recommended retention %B.
                </li>
              </ol>
            </div>

            <p className="text-xs text-muted-foreground">
              Once peak count is fully satisfied within the runtime limit, the method transitions to Efficiency or Selectivity.
            </p>
          </GuideSection>

          {/* Section 4: Selectivity Stage */}
          <GuideSection id="about-selectivity" number="4" title="Stage 2: Selectivity Optimization (Temperature, Solvent & Ligand)">
            <p>
              When retention alone fails to separate critical overlapping pairs, the engine guides you through the chemical selectivity triad:
            </p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 my-2">
              <div className="rounded-xl border border-border/70 bg-card p-3 shadow-2xs">
                <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Step 1 · Thermal</span>
                <h4 className="font-bold text-xs text-foreground mt-1">Temperature Shift (40°C & 60°C)</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Run the optimized %B at 40°C. Temperature alters partition enthalpy, changing relative retention (α). If improved, test 60°C.
                </p>
              </div>

              <div className="rounded-xl border border-border/70 bg-card p-3 shadow-2xs">
                <span className="text-[10px] font-bold text-sky-600 dark:text-sky-400 uppercase tracking-wider">Step 2 · Mobile Phase</span>
                <h4 className="font-bold text-xs text-foreground mt-1">Organic Solvent (Nomogram)</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Switch organic modifier (ACN → MeOH, THF). The engine computes equivalent %B using the standard solvent nomogram equations to maintain matching retention times.
                </p>
              </div>

              <div className="rounded-xl border border-border/70 bg-card p-3 shadow-2xs">
                <span className="text-[10px] font-bold text-[var(--hp-brand)] uppercase tracking-wider">Step 3 · Stationary Phase</span>
                <h4 className="font-bold text-xs text-foreground mt-1">Column Ligand Coating</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Switch column coating (C18, C18aq, PFPP, C8, biphenyl, IBD). Restart retention at ~100% B to re-establish retention on the new chemistry.
                </p>
              </div>
            </div>
          </GuideSection>

          {/* Section 5: Other Features */}
          <GuideSection id="about-other" number="5" title="Run Management, Settings & Instrumental Tools">
            <p className="text-xs text-muted-foreground leading-relaxed">
              <strong>Workflow Progression:</strong> For each injection, upload the raw data export, inspect peak metrics and the automated
              recommendation, then select <em>Next Run</em> to advance. Deleting a run purges that run and subsequent dependent runs while preserving
              Run 1 setup conditions.
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              <strong>Equipment Tab:</strong> Interactive visual modules showing laboratory HPLC hardware setups (HPLCs 1/2/5, 3, and 6), column
              dimensional scaling physics, silica bead microstructures, and chromatogram measurement tutorials.
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              <strong>Settings Tab:</strong> Comprehensive database of physical columns with complete specifications (pore size, particle size,
              core-shell status, carbon load) and supported organic modifier solvents.
            </p>
          </GuideSection>
        </div>

        {/* Quick Reference & Cheat Sheet Sidebar (4 Cols) */}
        <aside className="flex flex-col gap-5 lg:col-span-4 lg:sticky lg:top-4">
          {/* Table of Contents */}
          <div className="rounded-2xl border border-border/80 bg-card p-4 sm:p-5 shadow-xs">
            <h3 className="font-heading text-sm font-bold text-foreground flex items-center gap-2 border-b border-border/60 pb-2.5">
              <Sliders className="size-4 text-[var(--hp-brand)]" />
              Quick Navigation
            </h3>
            <nav className="mt-3 flex flex-col gap-1.5 text-xs">
              <a
                href="#about-setup"
                className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
              >
                <span>1. Run 1 Setup & Autofill</span>
                <ChevronRight className="size-3.5 text-muted-foreground" />
              </a>
              <a
                href="#about-results"
                className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
              >
                <span>2. Acceptance Criteria</span>
                <ChevronRight className="size-3.5 text-muted-foreground" />
              </a>
              <a
                href="#about-retention"
                className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
              >
                <span>3. Retention Optimization</span>
                <ChevronRight className="size-3.5 text-muted-foreground" />
              </a>
              <a
                href="#about-selectivity"
                className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
              >
                <span>4. Selectivity Triad</span>
                <ChevronRight className="size-3.5 text-muted-foreground" />
              </a>
              <a
                href="#about-other"
                className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
              >
                <span>5. Run Management</span>
                <ChevronRight className="size-3.5 text-muted-foreground" />
              </a>
            </nav>
          </div>

          {/* Essential Equations Cheat Sheet */}
          <div className="rounded-2xl border border-border/80 bg-card p-4 sm:p-5 shadow-xs">
            <h3 className="font-heading text-sm font-bold text-foreground flex items-center gap-2 border-b border-border/60 pb-2.5">
              <Calculator className="size-4 text-[var(--hp-brand)]" />
              Fundamental HPLC Equations
            </h3>
            <div className="mt-3 flex flex-col gap-3 text-xs">
              <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
                <span className="font-semibold text-foreground block">Retention Factor (k):</span>
                <code className="font-mono text-[11px] text-[var(--hp-brand)] block mt-0.5">k = (tR − t₀) / t₀</code>
                <span className="text-[10px] text-muted-foreground mt-1 block">Relative time spent retained on stationary phase.</span>
              </div>

              <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
                <span className="font-semibold text-foreground block">Peak Resolution (Rs):</span>
                <code className="font-mono text-[11px] text-[var(--hp-brand)] block mt-0.5">Rs = 2(tR2 − tR1) / (W1 + W2)</code>
                <span className="text-[10px] text-muted-foreground mt-1 block">Baseline separation achieved when Rs ≥ 1.5.</span>
              </div>

              <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
                <span className="font-semibold text-foreground block">Purnell Master Equation:</span>
                <code className="font-mono text-[11px] text-[var(--hp-brand)] block mt-0.5">Rs = (√N / 4) · ((α−1)/α) · (k/(1+k))</code>
                <span className="text-[10px] text-muted-foreground mt-1 block">Efficiency (N), selectivity (α), and retention (k).</span>
              </div>
            </div>
          </div>

          {/* Solvent Nomogram Quick Guide */}
          <div className="rounded-2xl border border-border/80 bg-card p-4 sm:p-5 shadow-xs">
            <h3 className="font-heading text-sm font-bold text-foreground flex items-center gap-2 border-b border-border/60 pb-2.5">
              <Compass className="size-4 text-[var(--hp-brand)]" />
              Solvent Nomogram Equivalents
            </h3>
            <p className="mt-2 text-xs text-muted-foreground">
              Approximate organic modifier percentage yielding equivalent retention to Acetonitrile (ACN):
            </p>
            <div className="mt-2.5 flex flex-col gap-1.5 font-mono text-xs">
              <div className="flex justify-between items-center bg-muted/30 px-2 py-1 rounded">
                <span className="text-foreground">ACN 50%</span>
                <span className="text-[var(--hp-brand)] font-bold">1.00× (Base)</span>
              </div>
              <div className="flex justify-between items-center bg-muted/30 px-2 py-1 rounded">
                <span className="text-foreground">MeOH</span>
                <span className="text-sky-600 dark:text-sky-400 font-bold">~62% (+12%)</span>
              </div>
              <div className="flex justify-between items-center bg-muted/30 px-2 py-1 rounded">
                <span className="text-foreground">THF</span>
                <span className="text-amber-600 dark:text-amber-400 font-bold">~38% (−12%)</span>
              </div>
              <div className="flex justify-between items-center bg-muted/30 px-2 py-1 rounded">
                <span className="text-foreground">IPA</span>
                <span className="text-purple-600 dark:text-purple-400 font-bold">~35% (−15%)</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function GuideSection({
  id,
  number,
  title,
  children,
}: {
  id: string;
  number: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="rounded-2xl border border-border/80 bg-card p-5 sm:p-6 shadow-xs">
      <h2 className="font-heading text-xl sm:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[var(--hp-brand)]/15 font-mono text-xs font-bold text-[var(--hp-brand)]">
          {number}
        </span>
        {title}
      </h2>
      <div className="mt-4 flex flex-col gap-3.5 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}
