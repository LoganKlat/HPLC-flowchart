import type { ChromatogramPoint } from "@/lib/lab-file";

type ChromatogramChartProps = {
  points: ChromatogramPoint[];
  yLabel: string;
};

export function ChromatogramChart({ points, yLabel }: ChromatogramChartProps) {
  const width = 720;
  const height = 320;
  const pad = { left: 72, right: 18, top: 16, bottom: 44 };
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

  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const xOf = (time: number) => pad.left + ((time - minTime) / (maxTime - minTime)) * innerWidth;
  const yOf = (intensity: number) =>
    pad.top + ((maxY - intensity) / (maxY - minY)) * innerHeight;

  const path = points
    .map((point, index) => {
      const command = index === 0 ? "M" : "L";
      return `${command}${xOf(point.timeMin).toFixed(1)},${yOf(point.intensity).toFixed(1)}`;
    })
    .join(" ");

  const xTicks = tickValues(minTime, maxTime, 5);
  const yTicks = tickValues(minY, maxY, 4);

  return (
    <figure className="overflow-hidden rounded-xl bg-[#f7fbf8] ring-1 ring-foreground/10">
      <figcaption className="flex items-baseline justify-between gap-3 px-4 pt-3">
        <span className="font-heading text-base text-foreground">Chromatogram</span>
        <span className="text-xs text-muted-foreground">Time in minutes</span>
      </figcaption>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Chromatogram. Time in minutes across, ${yLabel} up and down.`}
        className="h-auto w-full"
      >
        {yTicks.map((tick) => (
          <g key={`y-${tick}`}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={yOf(tick)}
              y2={yOf(tick)}
              stroke="currentColor"
              className="text-foreground/10"
            />
            <text
              x={pad.left - 8}
              y={yOf(tick)}
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
          x1={pad.left}
          x2={pad.left}
          y1={pad.top}
          y2={height - pad.bottom}
          stroke="currentColor"
          className="text-foreground/30"
        />
        <line
          x1={pad.left}
          x2={width - pad.right}
          y1={height - pad.bottom}
          y2={height - pad.bottom}
          stroke="currentColor"
          className="text-foreground/30"
        />
        <path d={path} fill="none" stroke="#0f6b56" strokeWidth="1.7" />
        <text
          x={16}
          y={height / 2}
          transform={`rotate(-90 16 ${height / 2})`}
          textAnchor="middle"
          className="fill-foreground text-[12px]"
        >
          {yLabel}
        </text>
      </svg>
    </figure>
  );
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
