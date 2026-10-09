import { formatPercentB, type LookRun, type LookStep } from "@/lib/retention";

function markWord(mark: LookRun["peaks"]): string {
  if (mark === "met") return "Met";
  if (mark === "not-met") return "Not met";
  return "Blank";
}

export function LookAtRuns({
  look,
  onPickRun,
}: {
  look: LookStep;
  onPickRun: (index: number) => void;
}) {
  const showPicker = look.mode === "picker" || look.mode === "between-then-heat";

  return (
    <div className="contents" id="look-at-runs">
      <section className="rounded-xl bg-card px-4 py-4 ring-1 ring-foreground/10">
        <h2 className="font-heading text-base">Why</h2>
        <p className="mt-1 text-sm leading-relaxed text-foreground">
          Look at the runs. Each row is one uploaded run. Met means that measurement is inside the specification. Not
          met means it is not. Compare the peak count, the worst resolution, the last peak, and the back-pressure
          before choosing the next change.
        </p>
      </section>
      <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
        <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs tracking-wide text-muted-foreground uppercase">
              <th className="px-3 py-2 font-medium">Run</th>
              <th className="px-3 py-2 font-medium">%B</th>
              <th className="px-3 py-2 font-medium">Peaks</th>
              <th className="px-3 py-2 font-medium">Worst resolution</th>
              <th className="px-3 py-2 font-medium">Last peak</th>
              <th className="px-3 py-2 font-medium">Peaks</th>
              <th className="px-3 py-2 font-medium">Resolution</th>
              <th className="px-3 py-2 font-medium">Time</th>
              <th className="px-3 py-2 font-medium">Pressure</th>
            </tr>
          </thead>
          <tbody>
            {look.runs.map((run) => (
              <tr key={run.index} className="border-b border-border">
                <th className="px-3 py-2 font-medium" scope="row">
                  Run {run.index + 1}
                </th>
                <td className="px-3 py-2">{run.percentB == null ? "—" : formatPercentB(run.percentB)}</td>
                <td className="px-3 py-2">{run.peakCount ?? "—"}</td>
                <td className="px-3 py-2">{run.resolution == null ? "—" : run.resolution.toFixed(3)}</td>
                <td className="px-3 py-2">
                  {run.lastPeakTimeMin == null ? "—" : `${run.lastPeakTimeMin.toFixed(3)} min`}
                </td>
                <td className="px-3 py-2">{markWord(run.peaks)}</td>
                <td className="px-3 py-2">{markWord(run.resolutionMark)}</td>
                <td className="px-3 py-2">{markWord(run.time)}</td>
                <td className="px-3 py-2">{markWord(run.pressure)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showPicker ? (
        <section id="pick-run" className="rounded-xl bg-card px-4 py-4 ring-1 ring-foreground/10">
          <h2 className="font-heading text-base">Which run to heat</h2>
          <p className="mt-1 text-sm leading-relaxed text-foreground">
            Pick one uploaded run. The next change is heat, to 40°C, at that run’s %B. The goal is a selectivity change
            so the overlapping peaks separate. A higher temperature shortens retention. The %B stays the same. A late
            run can be picked. Not met on time means the last
            peak is later than the specification.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {look.runs.map((run) => (
              <button
                key={run.index}
                type="button"
                className="cursor-pointer rounded-lg border border-input bg-background px-3 py-2 text-left text-sm text-foreground"
                style={{ height: "auto", whiteSpace: "normal" }}
                onClick={() => onPickRun(run.index)}
              >
                Heat run {run.index + 1}
                {run.percentB == null ? "" : ` at ${formatPercentB(run.percentB)}% B`}
                {". Peaks "}
                {markWord(run.peaks)}
                {". Resolution "}
                {markWord(run.resolutionMark)}
                {". Time "}
                {markWord(run.time)}
                {"."}
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
