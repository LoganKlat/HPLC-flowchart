"use client";

import { useState } from "react";
import { Activity, Calculator, LayoutGrid, Table as TableIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ParameterItem {
  id: string;
  name: string;
  symbol: string;
  category: "direct" | "calculated";
  sourceOrFormula: string;
  units: string;
  description: string;
}

export const DIRECT_RESPONSES: ParameterItem[] = [
  {
    id: "tr",
    name: "Retention Time",
    symbol: "tR",
    category: "direct",
    sourceOrFormula: "Chromatogram x-axis (injection to peak apex)",
    units: "min",
    description: "Time an analyte takes to migrate through the column and reach the detector.",
  },
  {
    id: "peaks",
    name: "Peak Count",
    symbol: "n",
    category: "direct",
    sourceOrFormula: "Number of resolved signals above baseline",
    units: "integer",
    description: "Count of distinct peaks detected. If fewer than expected (e.g. < 7), peaks are co-eluting.",
  },
  {
    id: "peak-size",
    name: "Peak Height & Area",
    symbol: "h, Area",
    category: "direct",
    sourceOrFormula: "Chromatogram y-axis (absorbance signal / integration)",
    units: "mAU, mAU·s",
    description: "Raw signal intensity and peak integration, directly proportional to analyte concentration.",
  },
  {
    id: "pressure",
    name: "Pump Pressure",
    symbol: "ΔP",
    category: "direct",
    sourceOrFormula: "In-line pump pressure sensor",
    units: "psi or bar",
    description: "Hydraulic resistance from solvent flow through the column bed. Independent of UV absorbance.",
  },
];

export const CALCULATED_PARAMETERS: ParameterItem[] = [
  {
    id: "k",
    name: "Retention Factor",
    symbol: "k",
    category: "calculated",
    sourceOrFormula: "k = (tR - t₀) / t₀",
    units: "unitless (k ≥ 0)",
    description: "Normalized retention relative to void marker t₀. Independent of flow rate and column dimensions.",
  },
  {
    id: "rs",
    name: "Resolution",
    symbol: "Rs",
    category: "calculated",
    sourceOrFormula: "Rs = 2(tR₂ - tR₁) / (W₁ + W₂)",
    units: "unitless (Rs ≥ 0)",
    description: "Separation between adjacent peaks. Rs ≥ 1.5 indicates baseline separation (99.7% purity).",
  },
  {
    id: "n",
    name: "Column Efficiency",
    symbol: "N",
    category: "calculated",
    sourceOrFormula: "N = 16(tR / W)² = 5.54(tR / W₀.₅)²",
    units: "theoretical plates",
    description: "Quantifies band broadening in the column. Higher plate counts produce narrower peaks.",
  },
  {
    id: "alpha",
    name: "Selectivity Factor",
    symbol: "α",
    category: "calculated",
    sourceOrFormula: "α = k₂ / k₁ = (tR₂ - t₀) / (tR₁ - t₀)",
    units: "unitless (α ≥ 1.0)",
    description: "Relative chemical separation between two peaks. If α = 1.0, peaks cannot be separated by efficiency alone.",
  },
];

export const ALL_PARAMETERS: ParameterItem[] = [...DIRECT_RESPONSES, ...CALCULATED_PARAMETERS];

export function ChromatogramAnalysisComparison({ className }: { className?: string }) {
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");

  return (
    <div
      id="chromatogram-analysis-guide"
      className={cn(
        "flex flex-col gap-5 rounded-xl border border-border/70 bg-card p-4 sm:p-6 shadow-2xs",
        className
      )}
    >
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border/60 pb-4">
        <div>
          <h3 className="text-base sm:text-lg font-semibold tracking-tight text-foreground">
            Direct vs. Calculated Chromatographic Parameters
          </h3>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Direct responses are measured by instrument sensors along the time and signal axes. Calculated parameters are derived using mathematical formulas.
          </p>
        </div>

        {/* View Toggle */}
        <div className="inline-flex shrink-0 items-center rounded-lg border border-border/70 bg-muted/40 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setViewMode("cards")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors cursor-pointer",
              viewMode === "cards"
                ? "bg-background text-foreground shadow-2xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
            title="Side-by-side view"
          >
            <LayoutGrid className="size-3.5" />
            <span>Side-by-Side</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("table")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors cursor-pointer",
              viewMode === "table"
                ? "bg-background text-foreground shadow-2xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
            title="Summary table view"
          >
            <TableIcon className="size-3.5" />
            <span>Table</span>
          </button>
        </div>
      </div>

      {viewMode === "cards" ? (
        /* Side-by-Side Clean Cards */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Direct Responses Column */}
          <div className="flex flex-col gap-3 rounded-xl border border-sky-200/70 dark:border-sky-900/40 bg-sky-50/20 dark:bg-sky-950/10 p-3.5 sm:p-4">
            <div className="flex items-center justify-between border-b border-sky-200/60 dark:border-sky-900/40 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-md bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300">
                  <Activity className="size-3.5" />
                </span>
                <div>
                  <h4 className="text-sm font-semibold text-foreground">Direct Responses</h4>
                  <p className="text-[11px] text-muted-foreground">Read directly from instrument axes and sensors</p>
                </div>
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-400 bg-sky-100/80 dark:bg-sky-900/40 px-2 py-0.5 rounded">
                Raw Sensor Data
              </span>
            </div>

            <div className="flex flex-col gap-2.5 pt-1">
              {DIRECT_RESPONSES.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-border/60 bg-background/80 p-3 transition-colors hover:border-border"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-semibold text-foreground">{item.name}</span>
                    <span className="font-mono text-[11px] font-bold text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/50 px-1.5 py-0.5 rounded border border-sky-200/50 dark:border-sky-900/50">
                      {item.symbol}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">{item.description}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground/80 border-t border-border/40 pt-1.5">
                    <span>
                      <strong className="text-foreground/70 font-medium">Source:</strong> {item.sourceOrFormula}
                    </span>
                    <span>
                      <strong className="text-foreground/70 font-medium">Units:</strong> {item.units}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Calculated Parameters Column */}
          <div className="flex flex-col gap-3 rounded-xl border border-purple-200/70 dark:border-purple-900/40 bg-purple-50/20 dark:bg-purple-950/10 p-3.5 sm:p-4">
            <div className="flex items-center justify-between border-b border-purple-200/60 dark:border-purple-900/40 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-md bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300">
                  <Calculator className="size-3.5" />
                </span>
                <div>
                  <h4 className="text-sm font-semibold text-foreground">Calculated Parameters</h4>
                  <p className="text-[11px] text-muted-foreground">Derived from peak retention times, widths, or void time</p>
                </div>
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-purple-700 dark:text-purple-400 bg-purple-100/80 dark:bg-purple-900/40 px-2 py-0.5 rounded">
                Mathematical Metrics
              </span>
            </div>

            <div className="flex flex-col gap-2.5 pt-1">
              {CALCULATED_PARAMETERS.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-border/60 bg-background/80 p-3 transition-colors hover:border-border"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-semibold text-foreground">{item.name}</span>
                    <span className="font-mono text-[11px] font-bold text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/50 px-1.5 py-0.5 rounded border border-purple-200/50 dark:border-purple-900/50">
                      {item.symbol}
                    </span>
                  </div>
                  <div className="mt-1 rounded bg-muted/50 px-2 py-1 font-mono text-[11px] text-foreground/90 select-all">
                    {item.sourceOrFormula}
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted-foreground leading-relaxed">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* Single Clean Comparative Table */
        <div className="overflow-x-auto rounded-lg border border-border/80 bg-background">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border/80 bg-muted/40 text-muted-foreground font-semibold">
                <th className="py-2.5 px-3">Parameter</th>
                <th className="py-2.5 px-2 font-mono">Symbol</th>
                <th className="py-2.5 px-3">Category</th>
                <th className="py-2.5 px-3">Source / Formula</th>
                <th className="py-2.5 px-3">Units</th>
                <th className="py-2.5 px-3">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {ALL_PARAMETERS.map((item) => (
                <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                  <td className="py-2.5 px-3 font-medium text-foreground whitespace-nowrap">{item.name}</td>
                  <td className="py-2.5 px-2 font-mono font-bold text-foreground/80">{item.symbol}</td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    {item.category === "direct" ? (
                      <span className="inline-flex items-center gap-1 rounded bg-sky-100 dark:bg-sky-950/60 px-1.5 py-0.5 text-[10px] font-medium text-sky-800 dark:text-sky-300">
                        <Activity className="size-2.5" />
                        Direct
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded bg-purple-100 dark:bg-purple-950/60 px-1.5 py-0.5 text-[10px] font-medium text-purple-800 dark:text-purple-300">
                        <Calculator className="size-2.5" />
                        Calculated
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[11px] text-foreground/85">{item.sourceOrFormula}</td>
                  <td className="py-2.5 px-3 text-muted-foreground whitespace-nowrap">{item.units}</td>
                  <td className="py-2.5 px-3 text-muted-foreground leading-relaxed min-w-[200px]">{item.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
