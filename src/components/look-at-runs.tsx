import { formatPercentB, type LookRun, type LookStep } from "@/lib/retention";

const choiceClass =
  "flex h-10 min-w-0 cursor-pointer items-center justify-center rounded-lg border px-3 text-sm font-medium";

function markWord(mark: LookRun["peaks"]): string {
  if (mark === "met") return "Met";
  if (mark === "not-met") return "Not met";
  return "Blank";
}

export function LookAtRuns({
  look,
  betweenAnswer,
  betweenText,
  betweenError,
  onAnswer,
  onBetweenText,
  onUseBetween,
  onPickRun,
}: {
  look: LookStep;
  betweenAnswer: "yes" | "no" | null;
  betweenText: string;
  betweenError: string | null;
  onAnswer: (answer: "yes" | "no") => void;
  onBetweenText: (value: string) => void;
  onUseBetween: () => void;
  onPickRun: (index: number) => void;
}) {
  const showPicker = look.mode === "picker" || (look.mode === "between-then-heat" && betweenAnswer === "no");
  const showBetween = look.mode !== "picker";

  return (
    <div className="flex flex-col gap-4" id="look-at-runs">
      <section id="next-change" className="scroll-mt-16 rounded-xl bg-[#e7f3ee] px-4 py-4 text-[#144237]">
        <h2 className="font-heading text-base">Look at the runs.</h2>
        <p className="mt-1 text-sm leading-relaxed">
          Each row is one uploaded run. Met means that rule passed. Not met means it did not.
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
      {showBetween ? (
        <section className="rounded-xl bg-card px-4 py-4 ring-1 ring-foreground/10">
          <h2 className="font-heading text-base">In-between %B</h2>
          <p className="mt-1 text-sm leading-relaxed text-foreground">Do you want an in-between %B?</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              aria-pressed={betweenAnswer === "yes"}
              className={`${choiceClass} ${betweenAnswer === "yes" ? "border-primary bg-accent text-foreground" : "border-input bg-background text-foreground"}`}
              onClick={() => onAnswer("yes")}
            >
              Yes
            </button>
            <button
              type="button"
              aria-pressed={betweenAnswer === "no"}
              className={`${choiceClass} ${betweenAnswer === "no" ? "border-primary bg-accent text-foreground" : "border-input bg-background text-foreground"}`}
              onClick={() => onAnswer("no")}
            >
              No
            </button>
          </div>
          {betweenAnswer === "yes" ? (
            <div className="mt-3 flex flex-col gap-2">
              <label htmlFor="in-between-percent" className="text-sm text-foreground">
                Type the %B. Use a number from 0 to 100.
              </label>
              <input
                id="in-between-percent"
                value={betweenText}
                inputMode="decimal"
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
                onChange={(event) => onBetweenText(event.target.value)}
              />
              {betweenError ? (
                <p className="text-sm text-orange-950" role="status">
                  {betweenError}
                </p>
              ) : null}
              <button
                type="button"
                className={`${choiceClass} border-primary bg-primary text-primary-foreground`}
                onClick={onUseBetween}
              >
                Use this %B
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
      {showPicker ? (
        <section id="pick-run" className="rounded-xl bg-card px-4 py-4 ring-1 ring-foreground/10">
          <h2 className="font-heading text-base">Which run to heat</h2>
          <p className="mt-1 text-sm leading-relaxed text-foreground">
            Pick one uploaded run. It goes to 40°C. A late run can be picked. Not met on time means the last peak is late.
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
