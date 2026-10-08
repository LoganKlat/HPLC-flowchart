import { formatDecimal } from "@/lib/evaluate";
import type { LabFileRead } from "@/lib/lab-file";

export function MeasurementGroups({
  read,
  minimumPercentB,
}: {
  read: LabFileRead;
  minimumPercentB: number | null;
}) {
  const factors = lastPeakFactors(read.firstPeakTimeMin, read.lastPeakTimeMin);
  const resolution = read.minResolutionExcludingFirst;
  const calculated = [
    factors ? `k ${formatDecimal(factors.k, 3)}` : null,
    factors ? `logK ${formatDecimal(factors.logK, 3)}` : null,
    minimumPercentB != null ? `Minimum %B ${formatPercent(minimumPercentB)}` : null,
  ].filter((line): line is string => line != null);

  return (
    <div id="decision-measurements" className="grid gap-3 sm:grid-cols-2">
      <section id="read-from-file" className="rounded-xl bg-card px-4 py-4 ring-1 ring-foreground/10">
        <h2 className="font-heading text-base">Read from the file</h2>
        <ul className="mt-2 flex flex-col gap-1 text-sm leading-relaxed">
          <li>Peaks: {read.peakCount == null ? "not in the file" : formatCount(read.peakCount)}</li>
          <li>
            Last-peak time:{" "}
            {read.lastPeakTimeMin == null ? "not in the file" : `${formatDecimal(read.lastPeakTimeMin, 3)} min`}
          </li>
          <li>Worst resolution: {resolution == null ? "not in the file" : formatDecimal(resolution, 3)}</li>
          <li>
            Back-pressure:{" "}
            {read.maxBackPressurePsi == null ? "not in the file" : `${formatDecimal(read.maxBackPressurePsi, 1)} psi`}
          </li>
        </ul>
      </section>
      <section id="calculated-values" className="rounded-xl bg-card px-4 py-4 ring-1 ring-foreground/10">
        <h2 className="font-heading text-base">Calculated</h2>
        {calculated.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-1 text-sm leading-relaxed">
            {calculated.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            k, logK, and minimum %B are not calculated for this run.
          </p>
        )}
      </section>
    </div>
  );
}

function lastPeakFactors(t0: number | null, tR: number | null): { k: number; logK: number } | null {
  if (t0 == null || tR == null || !(t0 > 0) || !(tR > t0)) return null;
  const k = (tR - t0) / t0;
  if (!(k > 0)) return null;
  return { k, logK: Math.log10(k) };
}

function formatCount(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}

function formatPercent(value: number): string {
  return Number.isInteger(value) ? `${value}%` : `${value}%`;
}
