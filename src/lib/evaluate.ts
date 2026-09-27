import type { LabFileRead } from "@/lib/lab-file";

export type RuleNumbers = {
  requiredPeaks: number | null;
  lastPeakTimeMin: number | null;
  minResolution: number | null;
  maxBackPressurePsi: number | null;
};

export type CheckStatus = "met" | "not-met" | "not-set";

export type ResultRow = {
  id: "peaks" | "resolution" | "last-peak" | "back-pressure";
  label: string;
  measured: string;
  rule: string;
  status: CheckStatus;
  note: string | null;
};

/**
 * Minimum resolution used for decisions and the results table.
 * A peak count below the number asked for means a peak was missed. That miss is
 * an overlap, so the minimum is 0 rather than the smallest Resolution among the
 * peaks that were integrated.
 */
export function resolutionForDecision(
  peakCount: number | null,
  foundMinResolution: number | null,
  requiredPeaks: number | null,
): number | null {
  if (requiredPeaks != null && peakCount != null && peakCount < requiredPeaks) return 0;
  if (foundMinResolution == null || !Number.isFinite(foundMinResolution)) return null;
  return foundMinResolution;
}

export function evaluateRun(read: LabFileRead, rules: RuleNumbers): ResultRow[] {
  const peaksShort =
    rules.requiredPeaks != null &&
    read.peakCount != null &&
    read.peakCount < rules.requiredPeaks;
  const decisionResolution = resolutionForDecision(
    read.peakCount,
    read.minResolutionExcludingFirst,
    rules.requiredPeaks,
  );

  const resolutionMeasured =
    decisionResolution == null ? "not in the file" : formatDecimal(decisionResolution, 3);

  let resolutionNote: string | null = null;
  if (peaksShort) {
    resolutionNote = "Missing peaks are overlaps, so the minimum resolution is 0.";
  } else if (!read.resolutionColumnFound) {
    resolutionNote = "The peak table is missing the Resolution column.";
  } else if (read.peakCount != null && read.minResolutionExcludingFirst == null) {
    resolutionNote = "There is no resolution after the first peak.";
  }

  const resolutionMet =
    decisionResolution != null &&
    rules.minResolution != null &&
    decisionResolution >= rules.minResolution;

  const pressureMeasured =
    read.maxBackPressurePsi == null ? "not in the file" : `${formatDecimal(read.maxBackPressurePsi, 1)} psi`;

  let pressureNote: string | null = null;
  if (!read.pressureFound) {
    pressureNote =
      "The pressure trace (Pump A) is not in this file, so max back-pressure is not available.";
  } else if (read.pressureUnits && read.pressureUnits.trim().toLowerCase() !== "psi") {
    pressureNote = `The pressure trace says its units are “${read.pressureUnits.trim()}”, not psi.`;
  } else if (read.maxBackPressurePsi == null) {
    pressureNote =
      read.notes.find((note) => note.toLowerCase().includes("pressure")) ??
      "Back-pressure could not be worked out from the pressure trace.";
  }

  return [
    {
      id: "peaks",
      label: "Number of peaks",
      measured: read.peakCount == null ? "not in the file" : formatCount(read.peakCount),
      rule: rules.requiredPeaks == null ? "not set" : formatCount(rules.requiredPeaks),
      status: judge(
        rules.requiredPeaks,
        read.peakCount,
        read.peakCount != null &&
          rules.requiredPeaks != null &&
          read.peakCount >= rules.requiredPeaks,
      ),
      note:
        read.peakCount != null && read.peakRowCount !== read.peakCount
          ? `The file says ${formatCount(read.peakCount)} peaks, but the table lists ${formatCount(read.peakRowCount)} peak rows.`
          : null,
    },
    {
      id: "resolution",
      label: "Minimum resolution",
      measured: resolutionMeasured,
      rule: rules.minResolution == null ? "not set" : formatDecimal(rules.minResolution, 3),
      status: peaksShort
        ? rules.minResolution == null
          ? "not-set"
          : "not-met"
        : judge(rules.minResolution, read.minResolutionExcludingFirst, resolutionMet),
      note: resolutionNote,
    },
    {
      id: "last-peak",
      label: "Last peak time",
      measured:
        read.lastPeakTimeMin == null ? "not in the file" : `${formatDecimal(read.lastPeakTimeMin, 3)} min`,
      rule:
        rules.lastPeakTimeMin == null
          ? "not set"
          : `at or before ${formatDecimal(rules.lastPeakTimeMin, 3)} min`,
      status: judge(
        rules.lastPeakTimeMin,
        read.lastPeakTimeMin,
        read.lastPeakTimeMin != null &&
          rules.lastPeakTimeMin != null &&
          read.lastPeakTimeMin <= rules.lastPeakTimeMin,
      ),
      note:
        read.lastPeakTimeMin == null
          ? "The peak table has no retention times in the R.Time column."
          : rules.lastPeakTimeMin != null && read.lastPeakTimeMin > rules.lastPeakTimeMin
            ? "Later than the time you set. That time is the latest the last peak may come out."
            : null,
    },
    {
      id: "back-pressure",
      label: "Max back-pressure",
      measured: pressureMeasured,
      rule:
        rules.maxBackPressurePsi == null ? "not set" : `${formatDecimal(rules.maxBackPressurePsi, 1)} psi`,
      status: judge(
        rules.maxBackPressurePsi,
        read.maxBackPressurePsi,
        read.maxBackPressurePsi != null &&
          rules.maxBackPressurePsi != null &&
          read.maxBackPressurePsi <= rules.maxBackPressurePsi,
      ),
      note: pressureNote,
    },
  ];
}

function judge(rule: number | null, measured: number | null, met: boolean): CheckStatus {
  if (rule == null) return "not-set";
  if (measured == null) return "not-met";
  return met ? "met" : "not-met";
}

function formatCount(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}

export function formatDecimal(value: number, decimals: number): string {
  return value.toFixed(decimals);
}

export function parseUserNumber(raw: string): number | null {
  const text = raw.trim().replace(",", ".");
  if (!text) return null;
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

export function parseUserCount(raw: string): number | null {
  const value = parseUserNumber(raw);
  if (value == null || !Number.isInteger(value) || value < 0) return null;
  return value;
}
