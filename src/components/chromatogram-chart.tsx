import type { ChromatogramPoint } from "@/lib/lab-file";

type ChromatogramChartProps = {
  points: ChromatogramPoint[];
  yLabel: string;
  peakTimesMin?: number[];
};

const LABEL_W = 64;
const LABEL_H = 16;
const LABEL_GAP = 6;

type PeakMark = {
  text: string;
  x: number;
  y: number;
};

export type PlacedPeakLabel = {
  text: string;
  x: number;
  y: number;
  anchorX: number;
  anchorY: number;
};

export function ChromatogramChart({ points, yLabel, peakTimesMin = [] }: ChromatogramChartProps) {
  const width = 720;
  const plotBottom = 44;
  const plotLeft = 72;
  const plotRight = 18;
  const times = points.map((point) => point.timeMin);
  const intensities = points.map((point) => point.intensity);
  const minTime = Math.min(...times);
  let maxTime = Math.max(...times);
  let minY = Math.min(...intensities);
  let maxY = Math.max(...intensities);
  if (minTime === maxTime) maxTime = minTime + 1;
  if (minY === maxY) {
    minY -= 1;
    maxY += 1;
  }
  const ySlack = (maxY - minY) * 0.08;
  minY -= ySlack;
  maxY += ySlack;

  const innerWidth = width - plotLeft - plotRight;
  const innerHeight = 260;
  const xOf = (time: number) => plotLeft + ((time - minTime) / (maxTime - minTime)) * innerWidth;
  const yOf = (intensity: number, plotTop: number) =>
    plotTop + ((maxY - intensity) / (maxY - minY)) * innerHeight;

  const marksAt = (plotTop: number): PeakMark[] =>
    peakTimesMin
      .filter((time) => Number.isFinite(time))
      .map((time) => ({
        text: formatPeakTime(time),
        x: xOf(time),
        y: yOf(intensityAt(points, time), plotTop),
      }));

  let plotTop = 28;
  let labels = layoutPeakLabels(marksAt(plotTop), {
    left: plotLeft,
    right: width - plotRight,
  });
  const minLabelTop = labels.reduce((min, label) => Math.min(min, label.y - LABEL_H / 2), plotTop);
  if (minLabelTop < 8) {
    plotTop += 8 - minLabelTop;
    labels = layoutPeakLabels(marksAt(plotTop), {
      left: plotLeft,
      right: width - plotRight,
    });
  }

  const height = plotTop + innerHeight + plotBottom;
  const path = points
    .map((point, index) => {
      const command = index === 0 ? "M" : "L";
      return `${command}${xOf(point.timeMin).toFixed(1)},${yOf(point.intensity, plotTop).toFixed(1)}`;
    })
    .join(" ");

  const xTicks = tickValues(minTime, maxTime, 5);
  const yTicks = tickValues(minY, maxY, 4);
  const peakList = labels.map((label) => label.text).join(", ");

  return (
    <figure className="overflow-hidden rounded-xl bg-[#f7fbf8] ring-1 ring-foreground/10">
      <figcaption className="flex items-baseline justify-between gap-3 px-4 pt-3">
        <span className="font-heading text-base text-foreground">Chromatogram</span>
        <span className="text-xs text-muted-foreground">Time in minutes</span>
      </figcaption>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={
          peakList
            ? `Chromatogram. Time in minutes across, ${yLabel} up and down. Peak times: ${peakList}.`
            : `Chromatogram. Time in minutes across, ${yLabel} up and down.`
        }
        className="h-auto w-full"
      >
        {yTicks.map((tick) => (
          <g key={`y-${tick}`}>
            <line
              x1={plotLeft}
              x2={width - plotRight}
              y1={yOf(tick, plotTop)}
              y2={yOf(tick, plotTop)}
              stroke="currentColor"
              className="text-foreground/10"
            />
            <text
              x={plotLeft - 8}
              y={yOf(tick, plotTop)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-muted-foreground text-[11px]"
            >
              {formatTick(tick)}
            </text>
          </g>
        ))}
        {xTicks.map((tick) => (
          <text
            key={`x-${tick}`}
            x={xOf(tick)}
            y={height - 16}
            textAnchor="middle"
            className="fill-muted-foreground text-[11px]"
          >
            {formatTick(tick)}
          </text>
        ))}
        <line
          x1={plotLeft}
          x2={plotLeft}
          y1={plotTop}
          y2={height - plotBottom}
          stroke="currentColor"
          className="text-foreground/30"
        />
        <line
          x1={plotLeft}
          x2={width - plotRight}
          y1={height - plotBottom}
          y2={height - plotBottom}
          stroke="currentColor"
          className="text-foreground/30"
        />
        <path d={path} fill="none" stroke="#0f6b56" strokeWidth="1.7" />
        {labels.map((label) => (
          <g key={`${label.text}-${label.anchorX.toFixed(1)}`}>
            <line
              x1={label.anchorX}
              y1={label.anchorY}
              x2={label.x}
              y2={label.y + LABEL_H / 2}
              stroke="#0f6b56"
              strokeWidth="1"
              opacity="0.45"
            />
            <circle cx={label.anchorX} cy={label.anchorY} r="2.6" fill="#0f6b56" />
            <rect
              x={label.x - LABEL_W / 2}
              y={label.y - LABEL_H / 2}
              width={LABEL_W}
              height={LABEL_H}
              rx="3"
              fill="#f7fbf8"
              stroke="#0f6b56"
              strokeOpacity="0.35"
            />
            <text
              x={label.x}
              y={label.y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-foreground text-[11px] font-medium"
            >
              {label.text}
            </text>
          </g>
        ))}
        <text
          x={16}
          y={plotTop + innerHeight / 2}
          transform={`rotate(-90 16 ${plotTop + innerHeight / 2})`}
          textAnchor="middle"
          className="fill-foreground text-[12px]"
        >
          {yLabel}
        </text>
      </svg>
    </figure>
  );
}

export function formatPeakTime(timeMin: number): string {
  return `${timeMin.toFixed(2)} min`;
}

/**
 * Puts each time just above its peak. Peaks that sit close together share a row of
 * labels spread wide enough to read, with the row lifted if it would cover another label.
 */
export function layoutPeakLabels(
  marks: PeakMark[],
  bounds: { left: number; right: number },
): PlacedPeakLabel[] {
  const sorted = [...marks].sort((a, b) => a.x - b.x);
  const clusters: PeakMark[][] = [];
  for (const mark of sorted) {
    const last = clusters[clusters.length - 1];
    if (!last || mark.x - last[last.length - 1].x >= LABEL_W) {
      clusters.push([mark]);
    } else {
      last.push(mark);
    }
  }

  const placed: PlacedPeakLabel[] = [];
  const available = Math.max(LABEL_W, bounds.right - bounds.left);
  const perRow = Math.max(1, Math.floor((available + LABEL_GAP) / (LABEL_W + LABEL_GAP)));

  for (const cluster of clusters) {
    for (let start = 0; start < cluster.length; start += perRow) {
      const rowMarks = cluster.slice(start, start + perRow);
      const span = rowMarks.length * LABEL_W + (rowMarks.length - 1) * LABEL_GAP;
      const mid = (rowMarks[0].x + rowMarks[rowMarks.length - 1].x) / 2;
      let origin = mid - span / 2;
      if (origin < bounds.left) origin = bounds.left;
      if (origin + span > bounds.right) origin = Math.max(bounds.left, bounds.right - span);

      const peakTop = Math.min(...rowMarks.map((mark) => mark.y));
      let y = peakTop - 28;
      const xs = rowMarks.map((_, index) => origin + LABEL_W / 2 + index * (LABEL_W + LABEL_GAP));
      while (xs.some((x) => overlaps(placed, x, y))) {
        y -= LABEL_H + LABEL_GAP;
      }
      rowMarks.forEach((mark, index) => {
        placed.push({
          text: mark.text,
          x: xs[index],
          y,
          anchorX: mark.x,
          anchorY: mark.y,
        });
      });
    }
  }
  return placed;
}

function overlaps(placed: PlacedPeakLabel[], x: number, y: number): boolean {
  return placed.some(
    (label) =>
      Math.abs(label.x - x) < LABEL_W + LABEL_GAP - 1 &&
      Math.abs(label.y - y) < LABEL_H + LABEL_GAP - 1,
  );
}

function intensityAt(points: ChromatogramPoint[], timeMin: number): number {
  if (points.length === 0) return 0;
  let best = points[0];
  let bestDistance = Math.abs(points[0].timeMin - timeMin);
  for (let i = 1; i < points.length; i++) {
    const distance = Math.abs(points[i].timeMin - timeMin);
    if (distance < bestDistance) {
      best = points[i];
      bestDistance = distance;
    }
  }
  return best.intensity;
}

function tickValues(min: number, max: number, count: number): number[] {
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, index) => min + step * index);
}

function formatTick(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 100) return value.toFixed(0);
  if (abs >= 10) return value.toFixed(1);
  return value.toFixed(2);
}
