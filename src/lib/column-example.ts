import example from "@/lib/column-example.json";
import type { ChromatogramPoint, PressurePoint } from "@/lib/lab-file";

type Pair = [number, number];

type ColumnExampleFile = {
  yLabel: string;
  peakTimesMin: number[];
  points: Pair[];
  pressurePoints: Pair[];
  pressureUnit: string | null;
};

const file = example as ColumnExampleFile;

function points(rows: Pair[]): ChromatogramPoint[] {
  return rows.map(([timeMin, intensity]) => ({ timeMin, intensity }));
}

function pressure(rows: Pair[]): PressurePoint[] {
  return rows.map(([timeMin, value]) => ({ timeMin, pressure: value }));
}

/** Parsed once. The Column tab used to re-read the 3 MB workbook on every visit. */
const cached = {
  yLabel: file.yLabel,
  peakTimesMin: file.peakTimesMin,
  points: points(file.points),
  pressurePoints: pressure(file.pressurePoints),
  pressureUnit: file.pressureUnit,
};

export function columnExampleTrace(): typeof cached {
  return cached;
}
