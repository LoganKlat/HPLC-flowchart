import type { RetentionDecision, RetentionFit } from "@/lib/retention";
import { formatPercentB, formatSlope } from "@/lib/retention";

export function RetentionDecisionView({ decision }: { decision: RetentionDecision }) {
  return (
    <div className="flex flex-col gap-4" id="retention-decision">
      <section
        id="next-change"
        className="scroll-mt-16 rounded-xl bg-card px-4 py-4 ring-1 ring-foreground/10"
      >
        <h2 className="font-heading text-base">Next change</h2>
        <p className="mt-1 text-sm leading-relaxed text-foreground">{decision.nextChange}</p>
      </section>
      <section className="rounded-xl bg-card px-4 py-4 ring-1 ring-foreground/10">
        <h2 className="font-heading text-base">Why</h2>
        <div className="mt-1 flex flex-col gap-2 text-sm leading-relaxed text-foreground">
          {decision.why.split("\n\n").map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
        {decision.fit ? <FitWorking fit={decision.fit} /> : null}
      </section>
    </div>
  );
}

export function StartHighBNote({ lastPeakTimeMin }: { lastPeakTimeMin: number | null }) {
  const under =
    lastPeakTimeMin == null
      ? "66% of the last-peak time you type"
      : `66% of the ${trimNumber(lastPeakTimeMin)} min you typed`;
  const full =
    lastPeakTimeMin == null
      ? "the full time you type"
      : `the full ${trimNumber(lastPeakTimeMin)} min you typed`;

  return (
    <div className="flex flex-col gap-4" id="start-high-b">
      <section
        id="next-change"
        className="scroll-mt-16 rounded-xl bg-[#e7f3ee] px-4 py-4 text-[#144237]"
      >
        <h2 className="font-heading text-base">Next change</h2>
        <p className="mt-1 text-sm leading-relaxed">
          Start the first run at a high %B, from 90% to 100% B.
        </p>
      </section>
      <section className="rounded-xl bg-card px-4 py-4 ring-1 ring-foreground/10">
        <h2 className="font-heading text-base">Why</h2>
        <p className="mt-1 text-sm leading-relaxed text-foreground">
          At that high %B the peaks will probably sit on top of each other, and the last peak will
          come out early. Then %B is lowered by 10 points while the last peak is still under {under}.
          After that, the page calculates the %B that should land the last peak on {full}.
        </p>
      </section>
    </div>
  );
}

function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}

export function LaterChangeNote({ decision }: { decision: RetentionDecision | null }) {
  return (
    <div className="flex flex-col gap-4">
      <section
        id="next-change"
        className="scroll-mt-16 rounded-xl bg-[#e7f3ee] px-4 py-4 text-[#144237]"
      >
        <h2 className="font-heading text-base">Next change</h2>
        <p className="mt-1 text-sm leading-relaxed">
          {decision?.nextChange ??
            "Retention is finished. The next kind of change is not built yet."}
        </p>
      </section>
      <section className="rounded-xl bg-card px-4 py-4 ring-1 ring-foreground/10">
        <h2 className="font-heading text-base">Why</h2>
        <div className="mt-1 flex flex-col gap-2 text-sm leading-relaxed text-foreground">
          {(
            decision?.why ??
            "Retention is finished. The next kind of change is not built yet."
          )
            .split("\n\n")
            .map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
        </div>
      </section>
    </div>
  );
}

function FitWorking({ fit }: { fit: RetentionFit }) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
        <caption className="pb-2 text-left font-medium text-foreground">
          Runs used to calculate %B. t0 is the first peak time. tR is the last peak time. k = (tR −
          t0) / t0. logK is the base-10 log of k.
        </caption>
        <thead>
          <tr className="border-t border-border text-xs tracking-wide text-muted-foreground uppercase">
            <th className="px-2 py-2 font-medium">Run</th>
            <th className="px-2 py-2 font-medium">%B</th>
            <th className="px-2 py-2 font-medium">t0 (min)</th>
            <th className="px-2 py-2 font-medium">tR (min)</th>
            <th className="px-2 py-2 font-medium">k</th>
            <th className="px-2 py-2 font-medium">logK</th>
          </tr>
        </thead>
        <tbody>
          {fit.rows.map((row) => (
            <tr key={row.runNumber} className="border-t border-border">
              <th className="px-2 py-2 font-medium" scope="row">
                Run {row.runNumber}
              </th>
              <td className="px-2 py-2">{formatPercentB(row.percentB)}</td>
              <td className="px-2 py-2">{row.t0.toFixed(3)}</td>
              <td className="px-2 py-2">{row.tR.toFixed(3)}</td>
              <td className="px-2 py-2">{row.k.toFixed(3)}</td>
              <td className="px-2 py-2">{row.logK.toFixed(4)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
        <Item term="m" value={formatSlope(fit.m)} />
        <Item term="c" value={formatSlope(fit.c)} />
        <Item term="Average t0" value={`${fit.t0Average.toFixed(3)} min`} />
        <Item term="Next %B" value={`${formatPercentB(fit.nextPercentB)}%`} />
      </dl>
    </div>
  );
}

function Item({ term, value }: { term: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{term}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
