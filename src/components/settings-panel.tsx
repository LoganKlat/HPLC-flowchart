"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  Cylinder,
  Database,
  Filter,
  FlaskConical,
  Lock,
  Plus,
  Search,
  Layers,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseColumnSpec, specFrom, type ColumnSpec } from "@/lib/column-catalog";
import { cn } from "@/lib/utils";

export type ColumnEntry = Partial<ColumnSpec> & {
  label: string;
  locked?: boolean;
};

export function SettingsPanel({
  columns,
  solvents,
  onAddColumn,
  onRemoveColumn,
  onAddSolvent,
  onRemoveSolvent,
}: {
  columns: readonly ColumnEntry[];
  solvents: readonly string[];
  onAddColumn: (input: ColumnSpec | string) => boolean | "invalid";
  onRemoveColumn: (label: string) => void;
  onAddSolvent: (name: string) => boolean;
  onRemoveSolvent: (name: string) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [phaseFilter, setPhaseFilter] = useState<string>("all");
  const [structureFilter, setStructureFilter] = useState<"all" | "core-shell" | "fully-porous">("all");
  const [showAdvancedAdd, setShowAdvancedAdd] = useState(false);

  // Quick single-line draft
  const [quickDraft, setQuickDraft] = useState("");
  const [quickError, setQuickError] = useState<string | null>(null);

  // Advanced specification draft
  const [advCoating, setAdvCoating] = useState("C18");
  const [advProduct, setAdvProduct] = useState("Raptor");
  const [advLength, setAdvLength] = useState("150");
  const [advDiameter, setAdvDiameter] = useState("4.6");
  const [advParticle, setAdvParticle] = useState("2.7");
  const [advPore, setAdvPore] = useState("90");
  const [advCoreShell, setAdvCoreShell] = useState<"yes" | "no">("yes");
  const [advCarbon, setAdvCarbon] = useState("7");
  const [advError, setAdvError] = useState<string | null>(null);

  // Solvents draft
  const [solventDraft, setSolventDraft] = useState("");
  const [solventError, setSolventError] = useState<string | null>(null);

  // Statistics
  const coreShellCount = useMemo(
    () => columns.filter((c) => c.coreShell === "yes" || /raptor/i.test(c.product || c.label)).length,
    [columns],
  );
  const fullyPorousCount = columns.length - coreShellCount;

  const uniquePhases = useMemo(() => {
    const set = new Set<string>();
    columns.forEach((c) => {
      if (c.coating) set.add(c.coating);
    });
    return Array.from(set).sort();
  }, [columns]);

  // Filtered columns
  const filteredColumns = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return columns.filter((col) => {
      // Phase filter
      if (phaseFilter !== "all" && col.coating?.toLowerCase() !== phaseFilter.toLowerCase()) {
        return false;
      }
      // Structure filter
      if (structureFilter === "core-shell" && col.coreShell !== "yes") return false;
      if (structureFilter === "fully-porous" && col.coreShell === "yes") return false;

      // Text query
      if (!q) return true;
      const haystack = [
        col.product,
        col.coating,
        col.label,
        col.lengthMm != null ? `${col.lengthMm}mm` : "",
        col.diameterMm != null ? `${col.diameterMm}mm` : "",
        col.particleUm != null ? `${col.particleUm}um` : "",
        col.poreA != null ? `${col.poreA}A` : "",
        col.coreShell === "yes" ? "core shell spp" : "fully porous",
        col.carbonLoad != null ? `${col.carbonLoad}%` : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [columns, searchQuery, phaseFilter, structureFilter]);

  function submitQuickAdd(event: FormEvent) {
    event.preventDefault();
    if (!quickDraft.trim()) {
      setQuickError("Type a column specification first.");
      return;
    }
    const added = onAddColumn(quickDraft);
    if (added === "invalid") {
      setQuickError("Format example: Raptor C18, 150 × 4.6 mm, 2.7 µm, 90 Å");
      return;
    }
    if (!added) {
      setQuickError("That column already exists in the database.");
      return;
    }
    setQuickDraft("");
    setQuickError(null);
  }

  function submitAdvancedAdd(event: FormEvent) {
    event.preventDefault();
    const len = Number(advLength);
    const dia = Number(advDiameter);
    const part = Number(advParticle);
    const pore = advPore ? Number(advPore) : null;
    const carbon = advCarbon ? Number(advCarbon) : null;

    if (!len || !dia || !part) {
      setAdvError("Please enter valid positive numbers for length, diameter, and particle size.");
      return;
    }

    const spec = specFrom(advCoating, advProduct, len, dia, part, pore, advCoreShell, carbon);
    if (!spec) {
      setAdvError("Could not generate valid column specifications.");
      return;
    }

    const added = onAddColumn(spec);
    if (!added) {
      setAdvError("A column with this exact specification already exists.");
      return;
    }

    setAdvError(null);
    setShowAdvancedAdd(false);
  }

  function submitSolvent(event: FormEvent) {
    event.preventDefault();
    const trimmed = solventDraft.trim();
    if (!trimmed) {
      setSolventError("Type a solvent name first.");
      return;
    }
    const added = onAddSolvent(trimmed);
    if (!added) {
      setSolventError("That solvent is already in the list.");
      return;
    }
    setSolventDraft("");
    setSolventError(null);
  }

  return (
    <div id="settings-page" className="flex flex-col gap-6 pb-12">
      {/* Header */}
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--hp-brand)]/30 bg-[var(--hp-brand)]/10 px-2.5 py-0.5 text-xs font-semibold tracking-wider text-[var(--hp-brand)] uppercase">
            <Database className="size-3.5" />
            Column & Solvent Database
          </span>
        </div>
        <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Specifications & Settings
        </h1>
        <p className="max-w-4xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Every physical column is registered with full specifications (pore size, particle diameter, core-shell
          morphology, and carbon load). The decision engine and run dropdowns depend directly on this database.
        </p>
      </header>

      {/* Summary KPI Badges */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="flex flex-col rounded-xl border border-border/70 bg-card p-3 shadow-xs">
          <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Total Columns</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-heading text-2xl font-bold text-foreground">{columns.length}</span>
            <span className="text-xs text-muted-foreground">registered</span>
          </div>
        </div>
        <div className="flex flex-col rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 shadow-xs dark:bg-amber-500/10">
          <span className="text-[11px] font-semibold tracking-wider text-amber-700 uppercase dark:text-amber-400">
            Core-Shell (SPP)
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-heading text-2xl font-bold text-amber-900 dark:text-amber-200">{coreShellCount}</span>
            <span className="text-xs text-amber-700/80 dark:text-amber-400/80">90 Å Raptor</span>
          </div>
        </div>
        <div className="flex flex-col rounded-xl border border-sky-500/30 bg-sky-500/5 p-3 shadow-xs dark:bg-sky-500/10">
          <span className="text-[11px] font-semibold tracking-wider text-sky-700 uppercase dark:text-sky-400">
            Fully Porous
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-heading text-2xl font-bold text-sky-900 dark:text-sky-200">{fullyPorousCount}</span>
            <span className="text-xs text-sky-700/80 dark:text-sky-400/80">Force / Ultra / DB</span>
          </div>
        </div>
        <div className="flex flex-col rounded-xl border border-border/70 bg-card p-3 shadow-xs">
          <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Supported Solvents</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-heading text-2xl font-bold text-foreground">{solvents.length}</span>
            <span className="text-xs text-muted-foreground">in nomogram</span>
          </div>
        </div>
      </div>

      {/* Main Column Database Card */}
      <section
        id="settings-columns"
        className="flex flex-col rounded-2xl border border-border/80 bg-card shadow-xs overflow-hidden"
      >
        {/* Top bar with search and actions */}
        <div className="flex flex-col gap-3 border-b border-border/70 p-4 sm:p-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="font-heading text-xl font-bold text-foreground flex items-center gap-2">
                <Cylinder className="size-5 text-[var(--hp-brand)]" />
                Column Specifications Database
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
                Specific columns from the workbook and Restek catalog. Locked Ultra columns cannot be chosen in runs.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant={showAdvancedAdd ? "default" : "outline"}
                size="sm"
                className="h-8 gap-1.5 text-xs font-semibold cursor-pointer"
                onClick={() => setShowAdvancedAdd(!showAdvancedAdd)}
              >
                <Plus className="size-3.5" />
                {showAdvancedAdd ? "Close Specification Form" : "Add Custom Column"}
              </Button>
            </div>
          </div>

          {/* Advanced Specification Adder Accordion */}
          {showAdvancedAdd && (
            <form
              onSubmit={submitAdvancedAdd}
              className="mt-2 rounded-xl border border-[var(--hp-brand)]/40 bg-[var(--hp-soft)]/20 p-4 dark:bg-[var(--hp-soft)]/10"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-bold tracking-wider text-[var(--hp-brand)] uppercase">
                  Add New Column Specification
                </span>
                <span className="text-xs text-muted-foreground">Every field will populate the decision engine</span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground">Coating / Phase</label>
                  <Input
                    value={advCoating}
                    onChange={(e) => setAdvCoating(e.target.value)}
                    placeholder="e.g. C18"
                    className="mt-1 h-8 text-xs"
                    required
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground">Brand / Product</label>
                  <Input
                    value={advProduct}
                    onChange={(e) => setAdvProduct(e.target.value)}
                    placeholder="e.g. Raptor"
                    className="mt-1 h-8 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground">Length (mm)</label>
                  <Input
                    type="number"
                    step="any"
                    value={advLength}
                    onChange={(e) => setAdvLength(e.target.value)}
                    placeholder="150"
                    className="mt-1 h-8 text-xs font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground">Diameter (mm)</label>
                  <Input
                    type="number"
                    step="any"
                    value={advDiameter}
                    onChange={(e) => setAdvDiameter(e.target.value)}
                    placeholder="4.6"
                    className="mt-1 h-8 text-xs font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground">Particle (µm)</label>
                  <Input
                    type="number"
                    step="any"
                    value={advParticle}
                    onChange={(e) => setAdvParticle(e.target.value)}
                    placeholder="2.7"
                    className="mt-1 h-8 text-xs font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground">Pore Size (Å)</label>
                  <Input
                    type="number"
                    step="any"
                    value={advPore}
                    onChange={(e) => setAdvPore(e.target.value)}
                    placeholder="90"
                    className="mt-1 h-8 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground">Core-Shell?</label>
                  <select
                    value={advCoreShell}
                    onChange={(e) => setAdvCoreShell(e.target.value as "yes" | "no")}
                    className="mt-1 flex h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="yes">Yes (Core-shell)</option>
                    <option value="no">No (Fully porous)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground">Carbon Load (%)</label>
                  <Input
                    type="number"
                    step="any"
                    value={advCarbon}
                    onChange={(e) => setAdvCarbon(e.target.value)}
                    placeholder="7"
                    className="mt-1 h-8 text-xs font-mono"
                  />
                </div>
              </div>
              {advError && <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">{advError}</p>}
              <div className="mt-3 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setShowAdvancedAdd(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" className="h-7 text-xs font-semibold cursor-pointer">
                  Save Specification to Database
                </Button>
              </div>
            </form>
          )}

          {/* Quick single-line adder */}
          <form onSubmit={submitQuickAdd} className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Input
                id="add-column"
                value={quickDraft}
                placeholder="Quick add: e.g. Raptor C18, 150 × 4.6 mm, 2.7 µm, 90 Å"
                aria-label="Add a column"
                onChange={(e) => {
                  setQuickDraft(e.target.value);
                  setQuickError(null);
                }}
                className="h-9 text-xs sm:text-sm"
              />
            </div>
            <Button type="submit" className="h-9 shrink-0 gap-1.5 px-4 text-xs font-semibold cursor-pointer">
              <Plus className="size-3.5" />
              Add Column
            </Button>
          </form>
          {quickError && (
            <p className="text-xs text-red-600 dark:text-red-400" role="status">
              {quickError}
            </p>
          )}

          {/* Search and Filters toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by phase, brand, or dimensions..."
                className="h-8 pl-8 text-xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1 mr-1">
                <Filter className="size-3" /> Filter:
              </span>
              <button
                type="button"
                onClick={() => setStructureFilter("all")}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-medium cursor-pointer transition-colors border",
                  structureFilter === "all"
                    ? "bg-foreground text-background border-foreground font-semibold"
                    : "border-border/70 text-muted-foreground hover:bg-muted/70",
                )}
              >
                All types
              </button>
              <button
                type="button"
                onClick={() => setStructureFilter("core-shell")}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-medium cursor-pointer transition-colors border",
                  structureFilter === "core-shell"
                    ? "bg-amber-600 text-white border-amber-600 font-semibold dark:bg-amber-500"
                    : "border-amber-500/30 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400",
                )}
              >
                Core-Shell ({coreShellCount})
              </button>
              <button
                type="button"
                onClick={() => setStructureFilter("fully-porous")}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-medium cursor-pointer transition-colors border",
                  structureFilter === "fully-porous"
                    ? "bg-sky-600 text-white border-sky-600 font-semibold dark:bg-sky-500"
                    : "border-sky-500/30 text-sky-700 hover:bg-sky-500/10 dark:text-sky-400",
                )}
              >
                Fully Porous ({fullyPorousCount})
              </button>

              {/* Phase dropdown */}
              <select
                value={phaseFilter}
                onChange={(e) => setPhaseFilter(e.target.value)}
                className="h-7 rounded-full border border-border/80 bg-background px-2.5 text-xs font-medium text-foreground cursor-pointer outline-none hover:bg-muted/60"
              >
                <option value="all">All Phases</option>
                {uniquePhases.map((phase) => (
                  <option key={phase} value={phase}>
                    {phase}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Multi-Column Specification Table */}
        <div className="w-full overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-muted/50 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/70">
              <tr>
                <th className="py-2.5 px-4 font-bold">Brand / Product</th>
                <th className="py-2.5 px-3 font-bold">Phase</th>
                <th className="py-2.5 px-3 font-bold">Dimensions (L × ID)</th>
                <th className="py-2.5 px-3 font-bold">Particle Size</th>
                <th className="py-2.5 px-3 font-bold">Pore Size</th>
                <th className="py-2.5 px-3 font-bold">Morphology</th>
                <th className="py-2.5 px-3 font-bold">Carbon Load</th>
                <th className="py-2.5 px-4 text-right font-bold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filteredColumns.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                    No columns match your current filters or search query.
                  </td>
                </tr>
              ) : (
                filteredColumns.map((col) => {
                  const isCore = col.coreShell === "yes" || /raptor/i.test(col.product || col.label);
                  const productName = col.product || col.label.split(",")[0] || col.coating || "Column";
                  const lengthVal = col.lengthMm != null ? `${col.lengthMm} mm` : "—";
                  const diamVal = col.diameterMm != null ? `${col.diameterMm} mm` : "—";
                  const particleVal = col.particleUm != null ? `${col.particleUm} µm` : "—";
                  const poreVal = col.poreA != null ? `${col.poreA} Å` : "—";
                  const carbonVal = col.carbonLoad != null ? `${col.carbonLoad}%` : "—";

                  return (
                    <tr
                      key={col.label}
                      data-ultra={col.locked ? "true" : undefined}
                      className={cn(
                        "transition-colors",
                        col.locked
                          ? "bg-muted/20 opacity-75 dark:bg-muted/10"
                          : "hover:bg-[var(--hp-soft)]/40 dark:hover:bg-[var(--hp-soft)]/20",
                      )}
                    >
                      {/* Product Name */}
                      <td className="py-2 px-4 font-medium text-foreground">
                        <div className="flex items-center gap-1.5">
                          {col.locked && <Lock className="size-3 text-muted-foreground shrink-0" />}
                          <span className={cn(col.locked && "text-muted-foreground")}>{productName}</span>
                        </div>
                      </td>

                      {/* Phase / Ligand */}
                      <td className="py-2 px-3">
                        <span className="inline-flex rounded-md border border-[var(--hp-brand)]/20 bg-[var(--hp-brand)]/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[var(--hp-brand)]">
                          {col.coating || "—"}
                        </span>
                      </td>

                      {/* Dimensions */}
                      <td className="py-2 px-3 font-mono text-muted-foreground whitespace-nowrap">
                        {col.lengthMm != null && col.diameterMm != null ? `${col.lengthMm} × ${col.diameterMm} mm` : "—"}
                      </td>

                      {/* Particle Size */}
                      <td className="py-2 px-3 font-mono font-medium text-foreground whitespace-nowrap">
                        {particleVal}
                      </td>

                      {/* Pore Size */}
                      <td className="py-2 px-3 font-mono text-muted-foreground whitespace-nowrap">
                        {poreVal}
                      </td>

                      {/* Morphology Badge */}
                      <td className="py-2 px-3 whitespace-nowrap">
                        {isCore ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                            <Layers className="size-2.5" /> Core-Shell
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:text-sky-400">
                            Fully Porous
                          </span>
                        )}
                      </td>

                      {/* Carbon Load */}
                      <td className="py-2 px-3 font-mono text-muted-foreground whitespace-nowrap">
                        {carbonVal}
                      </td>

                      {/* Actions */}
                      <td className="py-2 px-4 text-right whitespace-nowrap">
                        {col.locked ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                            Locked (Ultra)
                          </span>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-6 gap-1 px-2 text-[11px] text-muted-foreground cursor-pointer hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 active:scale-95 transition-all"
                            aria-label={`Remove ${col.label}`}
                            onClick={() => onRemoveColumn(col.label)}
                          >
                            <Trash2 className="size-3" />
                            Remove
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-border/70 bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
          <span>
            Showing <strong className="text-foreground">{filteredColumns.length}</strong> of{" "}
            <strong className="text-foreground">{columns.length}</strong> columns in database
          </span>
          <span className="text-[11px]">Restek Raptor 90 Å · Force 100 Å · Ultra 100 Å · Pinnacle 140 Å</span>
        </div>
      </section>

      {/* Solvents Section */}
      <section
        id="settings-solvents"
        className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-card p-4 sm:p-5 shadow-xs"
      >
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-heading text-xl font-bold text-foreground flex items-center gap-2">
              <FlaskConical className="size-5 text-[var(--hp-brand)]" />
              Solvent Nomogram Database
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
              Equivalent %B uses the nomogram equations relative to acetonitrile, in either direction. The eight
              supported standard organic modifiers are listed below.
            </p>
          </div>
        </div>

        <form onSubmit={submitSolvent} className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="add-solvent"
            value={solventDraft}
            placeholder="Add solvent modifier (e.g. ACN, MeOH, THF, IPA)"
            aria-label="Add a solvent"
            onChange={(e) => {
              setSolventDraft(e.target.value);
              setSolventError(null);
            }}
            className="h-9 text-xs sm:text-sm max-w-md"
          />
          <Button type="submit" className="h-9 shrink-0 gap-1.5 px-4 text-xs font-semibold cursor-pointer">
            <Plus className="size-3.5" />
            Add Solvent
          </Button>
        </form>
        {solventError && (
          <p className="text-xs text-red-600 dark:text-red-400" role="status">
            {solventError}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {solvents.map((name) => (
            <div
              key={name}
              className="group flex items-center justify-between gap-1.5 rounded-lg border border-border/80 bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-[var(--hp-brand)]/50 hover:bg-[var(--hp-soft)]/20"
            >
              <span className="truncate">{name}</span>
              <button
                type="button"
                className="opacity-0 group-hover:opacity-100 rounded p-0.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 cursor-pointer transition-opacity"
                aria-label={`Remove ${name}`}
                onClick={() => onRemoveSolvent(name)}
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
