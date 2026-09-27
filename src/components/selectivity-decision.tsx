import { LIGANDS, SOLVENTS, chartX, findSolvent, type SelectivityPlan } from "@/lib/selectivity";

const fieldClass =
  "h-10 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function SelectivityDecisionView({
  plan,
  solventId,
  ligand,
  onSolvent,
  onLigand,
}: {
  plan: SelectivityPlan;
  solventId: string;
  ligand: string;
  onSolvent: (id: string) => void;
  onLigand: (name: string) => void;
}) {
  const ligandChoices = (LIGANDS as readonly string[]).includes(ligand)
    ? [...LIGANDS]
    : ligand.trim()
      ? [ligand, ...LIGANDS]
      : [...LIGANDS];

  return (
    <div className="flex flex-col gap-4" id="selectivity-decision">
      <section id="next-change" className="scroll-mt-16 rounded-xl bg-[#e7f3ee] px-4 py-4 text-[#144237]">
        <h2 className="font-heading text-base">Next change</h2>
        <p className="mt-1 text-sm leading-relaxed">{plan.nextChange}</p>
      </section>
      <section className="rounded-xl bg-card px-4 py-4 ring-1 ring-foreground/10">
        <h2 className="font-heading text-base">Why</h2>
        <p className="mt-1 text-sm leading-relaxed text-foreground">{plan.why}</p>
        {plan.nomograph ? (
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
        {plan.showSolventChoices ? (
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
        {plan.showLigandChoices ? (
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
