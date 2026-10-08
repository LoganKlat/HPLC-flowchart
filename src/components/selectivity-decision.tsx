import { decisionBesideClass, decisionUnderClass } from "@/components/decision-layout";
import { Button } from "@/components/ui/button";
import { selectivityChangeLabel } from "@/lib/change-label";
import { LIGANDS, SOLVENTS, chartX, findSolvent, type SelectivityPlan, type TempPath } from "@/lib/selectivity";
import { PERCENT_B_SENTENCE, SELECTIVITY_ORDER } from "@/lib/setting-kind";

const fieldClass =
  "h-10 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function SelectivityDecisionView({
  plan,
  solventId,
  ligand,
  onSolvent,
  onLigand,
  tempPath,
  onTempPath,
}: {
  plan: SelectivityPlan;
  solventId: string;
  ligand: string;
  onSolvent: (id: string) => void;
  onLigand: (name: string) => void;
  tempPath: TempPath | null;
  onTempPath: (path: TempPath) => void;
}) {
  const ligandChoices = (LIGANDS as readonly string[]).includes(ligand)
    ? [...LIGANDS]
    : ligand.trim()
      ? [ligand, ...LIGANDS]
      : [...LIGANDS];
  const choice = plan.tempChoice;
  const recommendedPath = choice?.other ?? "solvent";
  const showSolvent = plan.showSolventChoices || (choice != null && tempPath === "solvent");
  const showLigand = plan.showLigandChoices || (choice != null && tempPath === "ligand");
  const solventName = findSolvent(solventId)?.label ?? "";
  const label = selectivityChangeLabel(plan, { tempPath, solvent: solventName, ligand });

  return (
    <div className="contents" id="selectivity-decision">
      <section id="next-change" className={`scroll-mt-16 rounded-xl bg-[#e7f3ee] px-4 py-4 text-[#144237] ${decisionBesideClass}`}>
        <h2 className="font-heading text-base">Next change</h2>
        <p className="mt-1 text-base font-semibold">{label}</p>
        {choice ? (
          <div id="temp-choice" className="mt-3 flex flex-col gap-2">
            <Button
              type="button"
              id={recommendedPath === "ligand" ? "choose-ligand" : "choose-solvent"}
              aria-pressed={tempPath === recommendedPath}
              className="h-auto w-full flex-col items-start gap-1 whitespace-normal px-4 py-3 text-left"
              style={{
                height: "auto",
                whiteSpace: "normal",
                ...(tempPath === recommendedPath
                  ? { backgroundColor: "#0a5644", color: "#f7fffb", borderColor: "#144237" }
                  : { backgroundColor: "#0f6b56", color: "#f7fffb", borderColor: "#0f6b56" }),
              }}
              onClick={() => onTempPath(recommendedPath)}
            >
              <span className="text-xs tracking-[0.14em] uppercase">Recommended</span>
              <span>{recommendedPath === "ligand" ? "Ligand" : "Solvent"}</span>
            </Button>
            <Button
              type="button"
              id="choose-60"
              variant="outline"
              aria-pressed={tempPath === "heat"}
              className="h-auto w-full whitespace-normal px-4 py-3 text-left"
              style={{
                height: "auto",
                whiteSpace: "normal",
                ...(tempPath === "heat"
                  ? { backgroundColor: "#efe6c4", borderColor: "#b0893e", color: "#3d3416" }
                  : {}),
              }}
              onClick={() => onTempPath("heat")}
            >
              Temperature 60°C
            </Button>
          </div>
        ) : null}
      </section>
      <section className={`rounded-xl bg-card px-4 py-4 ring-1 ring-foreground/10 ${decisionUnderClass}`}>
        <h2 className="font-heading text-base">Why</h2>
        <div className="mt-1 flex flex-col gap-2 text-sm leading-relaxed text-foreground">
          {stepParagraphs(plan.why).map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
        {plan.nomograph && (plan.step !== "temp-choice" || tempPath === "solvent") ? (
          <div id="solvent-nomograph" className="mt-4 flex flex-col gap-3">
            {plan.oldSolvent && plan.anchorPercentB != null ? (
              <NomographSketch oldSolvent={plan.oldSolvent} percentB={plan.anchorPercentB} />
            ) : null}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {plan.nomograph.map((entry) => (
                <div key={entry.id} className="rounded-lg bg-[#e7f3ee] px-3 py-3 text-[#144237]">
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
        {showSolvent ? (
          <label className="mt-4 flex flex-col gap-1.5 text-sm" htmlFor="solvent-choice">
            New solvent
            <select
              id="solvent-choice"
              className={fieldClass}
              value={solventId}
              onChange={(event) => onSolvent(event.target.value)}
            >
              <option value="">Choose a solvent</option>
              {SOLVENTS.map((solvent) => (
                <option key={solvent.id} value={solvent.id}>
                  {solvent.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {showLigand ? (
          <label className="mt-4 flex flex-col gap-1.5 text-sm" htmlFor="ligand-choice">
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
      </section>
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
  const origin = 26;
  const chartEnd = 991.5;
  const left = 48;
  const width = 276;
  const mapX = (value: number) => left + ((value - origin) / (chartEnd - origin)) * width;
  const lineX = mapX(Math.min(chartEnd, Math.max(origin, x)));
  const rows = [
    { name: "MeOH", end: 713.5, y: 18 },
    { name: "ACN", end: 713.5, y: 42 },
    { name: "THF", end: 991.5, y: 66 },
  ];
  return (
    <figure>
      <svg viewBox="0 0 340 84" className="h-24 w-full max-w-md" role="img" aria-label="Three solvent scales crossed by one vertical line">
        {rows.map((row) => (
          <g key={row.name}>
            <text x="0" y={row.y + 4} fill="#144237" fontSize="11">
              {row.name}
            </text>
            <line
              x1={left}
              y1={row.y}
              x2={mapX(row.end)}
              y2={row.y}
              stroke="#144237"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </g>
        ))}
        <line x1={lineX} y1={6} x2={lineX} y2={78} stroke="#c2410c" strokeWidth="1.5" />
      </svg>
    </figure>
  );
}
