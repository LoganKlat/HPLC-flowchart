import { KnowMoreToggle } from "@/components/know-more";
import { Button } from "@/components/ui/button";
import { SOLVENTS, chartX, findSolvent, type SelectivityPlan, type TempPath } from "@/lib/selectivity";
import { CHART_SOLVENT_NOTE } from "@/lib/solvent-menu";
import { PERCENT_B_SENTENCE, SELECTIVITY_ORDER } from "@/lib/setting-kind";

const fieldClass =
  "h-8 w-full rounded-lg border border-input bg-card px-2.5 text-xs font-medium text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50";

export function SelectivityDecisionView({
  plan,
  tempPath,
}: {
  plan: SelectivityPlan;
  tempPath: TempPath | null;
}) {
  const paragraphs = stepParagraphs(plan.why);
  const { lead: fallbackLead, details: fallbackDetails } = splitSelectivitySummary(paragraphs, plan.nextChange);
  const lead = plan.leadWhy ?? fallbackLead;
  const details = plan.moreWhy ?? fallbackDetails;

  return (
    <div className="contents" id="selectivity-decision">
      <section className="rounded-xl bg-card px-4 py-4 ring-1 ring-foreground/10">
        <h2 className="font-heading text-base">Why</h2>
        <div className="mt-1 flex flex-col gap-2 text-sm leading-relaxed text-foreground">
          {lead.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
          {details.length > 0 ? (
            <KnowMoreToggle>
              {details.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </KnowMoreToggle>
          ) : null}
        </div>
        {plan.nomograph && (plan.step !== "temp-choice" || tempPath === "solvent") ? (
          <div id="solvent-nomograph" className="mt-4 flex flex-col gap-3">
            {plan.oldSolvent && plan.anchorPercentB != null ? (
              <NomographSketch oldSolvent={plan.oldSolvent} percentB={plan.anchorPercentB} />
            ) : null}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {plan.nomograph.map((entry) => (
                <div key={entry.id} className="rounded-lg bg-[var(--hp-soft)] px-3 py-3 text-[var(--hp-ink)]">
                  <p className="text-xs tracking-wide">{entry.label}</p>
                  <p className="mt-1 font-heading text-2xl">{entry.percentText}% B</p>
                  {entry.capped ? (
                    <p className="mt-1 text-xs leading-snug">Held at 100. That is the strongest the pump can mix.</p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function splitSelectivitySummary(
  paragraphs: string[],
  nextChange: string,
): { lead: string[]; details: string[] } {
  if (paragraphs.length > 1) {
    return {
      lead: [paragraphs[0]],
      details: paragraphs.slice(1),
    };
  }
  const single = paragraphs[0] ?? nextChange;
  const sentences = single
    .split(/(?<=\.)\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length <= 2) {
    return { lead: [single], details: [] };
  }
  return {
    lead: [sentences.slice(0, 2).join(" ")],
    details: [sentences.slice(2).join(" ")],
  };
}

/** True when Next run should show a solvent, coating, or temperature-path picker. */
export function selectivityShowsChoices(plan: SelectivityPlan, tempPath: TempPath | null): boolean {
  const choice = plan.tempChoice;
  const showSolvent = plan.showSolventChoices || (choice != null && tempPath === "solvent");
  const showLigand = plan.showLigandChoices || (choice != null && tempPath === "ligand");
  return Boolean(choice || showSolvent || showLigand);
}

/** Solvent, coating, and temperature-path choices. These sit with Next run, not in Why. */
export function SelectivityNextControls({
  plan,
  solventId,
  ligand,
  solvents,
  ligands,
  onSolvent,
  onLigand,
  tempPath,
  onTempPath,
}: {
  plan: SelectivityPlan;
  solventId: string;
  ligand: string;
  solvents: readonly string[];
  ligands: readonly string[];
  onSolvent: (id: string) => void;
  onLigand: (name: string) => void;
  tempPath: TempPath | null;
  onTempPath: (path: TempPath) => void;
}) {
  const ligandChoices = [...ligands];
  const oldSolventId = plan.oldSolvent ? findSolvent(plan.oldSolvent)?.id ?? null : null;
  const solventChoices =
    plan.step === "solvent"
      ? solvents.filter((name) => {
          const match = findSolvent(name);
          return match != null && (oldSolventId == null || match.id !== oldSolventId);
        })
      : [...solvents];
  const choice = plan.tempChoice;
  const recommendedPath = choice?.other ?? "solvent";
  const showSolvent = plan.showSolventChoices || (choice != null && tempPath === "solvent");
  const showLigand = plan.showLigandChoices || (choice != null && tempPath === "ligand");
  const chartSolvent = findSolvent(solventId);
  if (!selectivityShowsChoices(plan, tempPath)) return null;

  return (
    <div id="selectivity-next-controls" className="flex flex-col gap-1.5">
      {choice ? (
        <div id="temp-choice" className="grid grid-cols-2 gap-1.5">
          <Button
            type="button"
            id={recommendedPath === "ligand" ? "choose-ligand" : "choose-solvent"}
            aria-pressed={tempPath === recommendedPath}
            className="h-8 cursor-pointer items-center justify-between gap-1.5 px-2.5 text-xs font-bold transition-all duration-150 hover:brightness-105 hover:shadow-xs active:translate-y-0.5 active:scale-[0.99]"
            style={
              tempPath === recommendedPath
                ? { backgroundColor: "var(--hp-brand-strong)", color: "var(--hp-on-brand)", borderColor: "var(--hp-ink)" }
                : { backgroundColor: "var(--hp-brand)", color: "var(--hp-on-brand)", borderColor: "var(--hp-brand)" }
            }
            onClick={() => onTempPath(recommendedPath)}
          >
            <span>{recommendedPath === "ligand" ? "Ligand" : "Solvent"}</span>
            <span className="rounded bg-black/20 dark:bg-white/20 px-1 py-0.5 text-[9px] font-bold tracking-wider uppercase">Rec</span>
          </Button>
          <Button
            type="button"
            id="choose-60"
            variant="outline"
            aria-pressed={tempPath === "heat"}
            className="h-8 cursor-pointer items-center justify-center border-border bg-card px-2.5 text-xs font-bold text-foreground transition-all duration-150 hover:border-[var(--hp-brand)] hover:bg-[var(--hp-soft)] hover:text-[var(--hp-brand)] hover:shadow-xs active:translate-y-0.5 active:scale-[0.99]"
            style={
              tempPath === "heat" ? { backgroundColor: "var(--hp-gold-soft)", borderColor: "var(--hp-gold)", color: "var(--hp-gold-ink)" } : {}
            }
            onClick={() => onTempPath("heat")}
          >
            Temp 60°C
          </Button>
        </div>
      ) : null}
      {showSolvent ? (
        <label className="flex flex-col gap-1 text-xs font-medium" htmlFor="solvent-choice">
          New solvent
          <select
            id="solvent-choice"
            className={fieldClass}
            value={solventChoices.includes(solventId) ? solventId : ""}
            onChange={(event) => onSolvent(event.target.value)}
          >
            <option value="">Choose a solvent</option>
            {solventChoices.map((solvent) => (
              <option key={solvent} value={solvent}>
                {solvent}
              </option>
            ))}
          </select>
          {solventId.trim() && !chartSolvent ? (
            <p id="solvent-chart-note" className="text-xs leading-snug text-[var(--hp-ink)]">
              {CHART_SOLVENT_NOTE}
            </p>
          ) : null}
        </label>
      ) : null}
      {showLigand ? (
        <label className="flex flex-col gap-1 text-xs font-medium" htmlFor="ligand-choice">
          Column coating
          <select
            id="ligand-choice"
            className={fieldClass}
            value={ligandChoices.includes(ligand) ? ligand : ""}
            onChange={(event) => onLigand(event.target.value)}
          >
            <option value="">select a ligand</option>
            {ligandChoices.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}

function stepParagraphs(why: string): string[] {
  const parts = why
    .split("\n\n")
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => {
      if (!paragraph) return false;
      if (paragraph.includes(SELECTIVITY_ORDER)) return false;
      if (paragraph.includes(PERCENT_B_SENTENCE)) return false;
      if (paragraph.startsWith("The order is")) return false;
      if (paragraph.startsWith("After 40°C") || paragraph.startsWith("After 60°C") || paragraph.startsWith("After the solvent")) {
        return false;
      }
      return true;
    });
  return parts.length > 0 ? parts : [why.trim()];
}

function NomographSketch({ oldSolvent, percentB }: { oldSolvent: string; percentB: number }) {
  const solvent = findSolvent(oldSolvent);
  const x = solvent ? chartX(solvent.id, percentB) : null;
  if (x == null) return null;
  const starts = SOLVENTS.map((entry) => chartX(entry.id, 0) ?? 0);
  const ends = SOLVENTS.map((entry) => chartX(entry.id, 100) ?? 0);
  const minX = Math.min(x, ...starts, ...ends);
  const maxX = Math.max(x, ...starts, ...ends);
  if (!(maxX > minX)) return null;
  const left = 72;
  const width = 256;
  const rowH = 22;
  const top = 16;
  const height = top + SOLVENTS.length * rowH;
  const mapX = (value: number) => left + ((value - minX) / (maxX - minX)) * width;
  const lineX = mapX(x);
  return (
    <figure>
      <svg
        viewBox={`0 0 340 ${height}`}
        className="h-auto w-full max-w-md"
        role="img"
        aria-label="Eight solvent scales crossed by one vertical line"
      >
        {SOLVENTS.map((entry, index) => {
          const y = top + index * rowH;
          return (
            <g key={entry.id}>
              <text x="0" y={y + 4} fill="var(--hp-ink)" fontSize="11">
                {entry.label}
              </text>
              <line
                x1={mapX(starts[index])}
                y1={y}
                x2={mapX(ends[index])}
                y2={y}
                stroke="var(--hp-ink)"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </g>
          );
        })}
        <line x1={lineX} y1={8} x2={lineX} y2={height - 8} stroke="var(--hp-warn)" strokeWidth="1.5" />
      </svg>
    </figure>
  );
}
