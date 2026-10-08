import type { ChromatogramPoint, PressurePoint } from "@/lib/lab-file";

export type ColumnScale = {
  /** New length divided by the column that produced the run. */
  lengthRatio: number;
  /** New width divided by the column that produced the run. */
  widthRatio: number;
  /** √XL. Width does not change resolution. */
  resolution: number;
  /** XL × (XW)². Peak positions move by this. */
  retentionTime: number;
  /** √XL × (XW)². */
  peakWidth: number;
  /** 1 / √(XL × (XW)²). */
  peakHeight: number;
  /** XL / (XW)². Pressure rises with length and falls with 1/ID². */
  pressure: number;
};

export function columnScale(
  lengthMm: number,
  widthMm: number,
  baselineLengthMm: number,
  baselineWidthMm: number,
): ColumnScale {
  const lengthRatio = lengthMm / baselineLengthMm;
  const widthRatio = widthMm / baselineWidthMm;
  const widthSq = widthRatio * widthRatio;
  return {
    lengthRatio,
    widthRatio,
    resolution: Math.sqrt(lengthRatio),
    retentionTime: lengthRatio * widthSq,
    peakWidth: Math.sqrt(lengthRatio) * widthSq,
    peakHeight: 1 / Math.sqrt(lengthRatio * widthSq),
    pressure: lengthRatio / widthSq,
  };
}

export function formatColumnMultiple(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value - 1) < 0.0005) return "1×";
  return `${value.toFixed(2)}×`;
}

export function scaledPeakTimes(peakTimesMin: readonly number[], retentionTime: number): number[] {
  return peakTimesMin.map((time) => time * retentionTime);
}

/**
 * Keeps the pump trace on the same time warp as the chromatogram.
 * Pressure rises with the column pressure multiplier. At 1× the points are unchanged.
 */
export function scalePressureTrace(
  points: readonly PressurePoint[],
  peakTimesMin: readonly number[],
  scale: ColumnScale,
): PressurePoint[] {
  if (points.length === 0) return [];
  const unchanged =
    Math.abs(scale.retentionTime - 1) < 1e-12 &&
    Math.abs(scale.peakWidth - 1) < 1e-12 &&
    Math.abs(scale.pressure - 1) < 1e-12;
  if (unchanged) return points.map((point) => ({ timeMin: point.timeMin, pressure: point.pressure }));

  const peaks = peakTimesMin.filter((time) => Number.isFinite(time)).slice().sort((a, b) => a - b);
  return points.map((point) => ({
    timeMin: warpTraceTime(point.timeMin, peaks, scale),
    pressure: point.pressure * scale.pressure,
  }));
}

function warpTraceTime(time: number, peaks: readonly number[], scale: ColumnScale): number {
  if (peaks.length === 0) return time * scale.retentionTime;
  let nearest = peaks[0];
  let best = Math.abs(time - peaks[0]);
  for (let index = 1; index < peaks.length; index++) {
    const distance = Math.abs(time - peaks[index]);
    if (distance < best) {
      best = distance;
      nearest = peaks[index];
    }
  }
  return nearest * scale.retentionTime + (time - nearest) * scale.peakWidth;
}

/**
 * Moves a measured trace with the column multipliers.
 * Peak centers follow retention time. The width of each peak follows peak width.
 * Height above the trace floor follows peak height. At 1× the points are unchanged.
 */
export function scaleChromatogram(
  points: readonly ChromatogramPoint[],
  peakTimesMin: readonly number[],
  scale: ColumnScale,
): ChromatogramPoint[] {
  if (points.length === 0) return [];
  const unchanged =
    Math.abs(scale.retentionTime - 1) < 1e-12 &&
    Math.abs(scale.peakWidth - 1) < 1e-12 &&
    Math.abs(scale.peakHeight - 1) < 1e-12;
  if (unchanged) return points.map((point) => ({ timeMin: point.timeMin, intensity: point.intensity }));

  const floor = points.reduce((min, point) => Math.min(min, point.intensity), Infinity);
  const peaks = peakTimesMin.filter((time) => Number.isFinite(time)).slice().sort((a, b) => a - b);
  const retention = scale.retentionTime;
  const width = scale.peakWidth;
  const height = scale.peakHeight;

  if (peaks.length === 0) {
    return points.map((point) => ({
      timeMin: point.timeMin * retention,
      intensity: floor + (point.intensity - floor) * height,
    }));
  }

  const groups: ChromatogramPoint[][] = peaks.map(() => []);
  for (const point of points) {
    let nearest = 0;
    let best = Math.abs(point.timeMin - peaks[0]);
    for (let index = 1; index < peaks.length; index++) {
      const distance = Math.abs(point.timeMin - peaks[index]);
      if (distance < best) {
        best = distance;
        nearest = index;
      }
    }
    groups[nearest].push({
      timeMin: peaks[nearest] * retention + (point.timeMin - peaks[nearest]) * width,
      intensity: floor + (point.intensity - floor) * height,
    });
  }
  for (const group of groups) group.sort((a, b) => a.timeMin - b.timeMin);

  let tMin = Infinity;
  let tMax = -Infinity;
  for (const group of groups) {
    for (const point of group) {
      if (point.timeMin < tMin) tMin = point.timeMin;
      if (point.timeMin > tMax) tMax = point.timeMin;
    }
  }
  if (!(tMax > tMin)) return points.map((point) => ({ timeMin: point.timeMin, intensity: point.intensity }));

  const count = Math.min(4000, Math.max(points.length, 2));
  const step = (tMax - tMin) / (count - 1);
  const out: ChromatogramPoint[] = [];
  for (let index = 0; index < count; index++) {
    const timeMin = tMin + step * index;
    let intensity = floor;
    for (const group of groups) {
      const sample = sampleGroup(group, timeMin);
      if (sample != null && sample > intensity) intensity = sample;
    }
    out.push({ timeMin, intensity });
  }
  return out;
}

function sampleGroup(group: readonly ChromatogramPoint[], time: number): number | null {
  if (group.length === 0) return null;
  if (time < group[0].timeMin || time > group[group.length - 1].timeMin) return null;
  let lo = 0;
  let hi = group.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (group[mid].timeMin <= time) lo = mid;
    else hi = mid;
  }
  const left = group[lo];
  const right = group[hi];
  const span = right.timeMin - left.timeMin;
  if (span <= 0) return Math.max(left.intensity, right.intensity);
  const fraction = (time - left.timeMin) / span;
  return left.intensity + (right.intensity - left.intensity) * fraction;
}
