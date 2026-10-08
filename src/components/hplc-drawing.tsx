type Icon = "bottles" | "degasser" | "detector" | "pump" | "screen" | "oven" | "syringe" | "vials";

type Module = { x: number; y: number; w: number; h: number; icon: Icon };

const modules: Record<string, Module[]> = {
  "hplc-1-2-5": [
    { x: 21, y: 20, w: 171, h: 111, icon: "bottles" },
    { x: 29, y: 141, w: 161, h: 47, icon: "degasser" },
    { x: 30, y: 201, w: 162, h: 89, icon: "detector" },
    { x: 20, y: 307, w: 169, h: 93, icon: "pump" },
    { x: 205, y: 127, w: 162, h: 92, icon: "screen" },
    { x: 205, y: 219, w: 162, h: 118, icon: "oven" },
    { x: 205, y: 337, w: 162, h: 65, icon: "syringe" },
  ],
  "hplc-3": [
    { x: 20, y: 20, w: 164, h: 114, icon: "bottles" },
    { x: 20, y: 134, w: 164, h: 49, icon: "degasser" },
    { x: 23, y: 183, w: 158, h: 89, icon: "pump" },
    { x: 23, y: 277, w: 158, h: 89, icon: "pump" },
    { x: 221, y: 187, w: 158, h: 87, icon: "screen" },
    { x: 221, y: 277, w: 158, h: 93, icon: "detector" },
    { x: 221, y: 370, w: 158, h: 269, icon: "oven" },
    { x: 23, y: 369, w: 163, h: 270, icon: "vials" },
  ],
  "hplc-6": [
    { x: 21, y: 20, w: 164, h: 116, icon: "bottles" },
    { x: 21, y: 137, w: 164, h: 47, icon: "degasser" },
    { x: 20, y: 184, w: 168, h: 90, icon: "pump" },
    { x: 222, y: 93, w: 158, h: 88, icon: "screen" },
    { x: 222, y: 183, w: 158, h: 93, icon: "detector" },
    { x: 222, y: 276, w: 158, h: 268, icon: "oven" },
    { x: 24, y: 275, w: 164, h: 271, icon: "vials" },
  ],
};

const ink = "#0f6b56";
const inkDark = "#144237";
const cream = "#f4efe2";
const paper = "#f7f3ea";
const liquid = "#efe6c4";

export function HplcSketch({ id, width, height }: { id: string; width: number; height: number }) {
  const parts = modules[id] ?? [];
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="block h-auto w-full"
      role="img"
      aria-label=""
    >
      <rect width={width} height={height} fill={paper} />
      {parts.map((part) => (
        <g key={`${part.icon}-${part.x}-${part.y}`}>
          <rect x={part.x} y={part.y} width={part.w} height={part.h} rx={10} fill={cream} stroke={ink} strokeWidth={2} />
          <IconShape part={part} />
        </g>
      ))}
    </svg>
  );
}

function IconShape({ part }: { part: Module }) {
  const cx = part.x + part.w / 2;
  const cy = part.y + part.h / 2;
  if (part.icon === "bottles") return <Bottles part={part} />;
  if (part.icon === "degasser") return <Degasser cx={cx} cy={cy} w={part.w} />;
  if (part.icon === "detector") return <Detector part={part} />;
  if (part.icon === "pump") return <Pump cx={cx} cy={cy} />;
  if (part.icon === "screen") return <Screen part={part} />;
  if (part.icon === "oven") return <Oven part={part} />;
  if (part.icon === "syringe") return <Syringe cx={cx} cy={cy} />;
  return <Vials part={part} />;
}

function Bottles({ part }: { part: Module }) {
  const gap = part.w * 0.08;
  const bottleW = part.w * 0.28;
  const bottleH = part.h * 0.62;
  const y = part.y + part.h * 0.22;
  const left = part.x + part.w * 0.16;
  return (
    <g fill="none" stroke={inkDark} strokeWidth={1.75}>
      {[0, 1].map((index) => {
        const x = left + index * (bottleW + gap);
        return (
          <g key={index}>
            <rect x={x + bottleW * 0.32} y={y - bottleH * 0.18} width={bottleW * 0.36} height={bottleH * 0.2} rx={2} fill={cream} />
            <rect x={x} y={y} width={bottleW} height={bottleH} rx={6} fill={index === 0 ? "#d7ebe3" : liquid} />
          </g>
        );
      })}
    </g>
  );
}

function Degasser({ cx, cy, w }: { cx: number; cy: number; w: number }) {
  return (
    <g fill="none" stroke={ink} strokeWidth={1.75} strokeLinecap="round">
      <path d={`M ${cx - w * 0.32} ${cy} H ${cx + w * 0.32}`} />
      {[-0.18, 0, 0.18].map((shift) => (
        <circle key={shift} cx={cx + w * shift} cy={cy} r={5} fill={paper} />
      ))}
    </g>
  );
}

function Detector({ part }: { part: Module }) {
  const x = part.x + part.w * 0.18;
  const y = part.y + part.h * 0.28;
  const w = part.w * 0.64;
  const h = part.h * 0.44;
  return (
    <g fill="none" stroke={inkDark} strokeWidth={1.75}>
      <rect x={x} y={y} width={w} height={h} rx={4} fill="#e7f3ee" />
      <path d={`M ${x + 8} ${y + h * 0.7} Q ${x + w * 0.35} ${y + 6} ${x + w * 0.55} ${y + h * 0.55} T ${x + w - 8} ${y + h * 0.35}`} stroke={ink} />
    </g>
  );
}

function Pump({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g fill="none" stroke={inkDark} strokeWidth={1.75}>
      <circle cx={cx} cy={cy} r={18} fill="#e7f3ee" />
      <path d={`M ${cx - 8} ${cy} H ${cx + 6}`} strokeLinecap="round" />
      <path d={`M ${cx + 2} ${cy - 5} L ${cx + 8} ${cy} L ${cx + 2} ${cy + 5}`} />
    </g>
  );
}

function Screen({ part }: { part: Module }) {
  const x = part.x + part.w * 0.16;
  const y = part.y + part.h * 0.2;
  const w = part.w * 0.68;
  const h = part.h * 0.5;
  return (
    <g fill="none" stroke={inkDark} strokeWidth={1.75}>
      <rect x={x} y={y} width={w} height={h} rx={4} fill="#e7f3ee" />
      <path d={`M ${x + w * 0.2} ${y + h + 8} H ${x + w * 0.8}`} strokeLinecap="round" />
    </g>
  );
}

function Oven({ part }: { part: Module }) {
  const colW = Math.min(28, part.w * 0.18);
  const colH = part.h * 0.62;
  const x = part.x + part.w / 2 - colW / 2;
  const y = part.y + part.h * 0.19;
  return (
    <g fill="none" stroke={inkDark} strokeWidth={1.75}>
      <rect x={x} y={y} width={colW} height={colH} rx={colW / 2} fill="#d7ebe3" />
      <path d={`M ${x + 4} ${y + colH * 0.3} H ${x + colW - 4}`} stroke={ink} />
      <path d={`M ${x + 4} ${y + colH * 0.5} H ${x + colW - 4}`} stroke={ink} />
      <path d={`M ${x + 4} ${y + colH * 0.7} H ${x + colW - 4}`} stroke={ink} />
    </g>
  );
}

function Syringe({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g fill="none" stroke={inkDark} strokeWidth={1.75} strokeLinecap="round">
      <rect x={cx - 22} y={cy - 7} width={36} height={14} rx={3} fill={liquid} />
      <path d={`M ${cx + 14} ${cy} H ${cx + 28}`} />
      <path d={`M ${cx - 22} ${cy - 10} V ${cy + 10}`} />
    </g>
  );
}

function Vials({ part }: { part: Module }) {
  const cols = 3;
  const rows = 4;
  const cellW = part.w / (cols + 1);
  const cellH = part.h / (rows + 1);
  const dots = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      dots.push(
        <circle
          key={`${row}-${col}`}
          cx={part.x + cellW * (col + 1)}
          cy={part.y + cellH * (row + 1)}
          r={Math.min(9, cellW * 0.28)}
          fill={row % 2 === 0 ? liquid : "#d7ebe3"}
          stroke={inkDark}
          strokeWidth={1.5}
        />,
      );
    }
  }
  return <g>{dots}</g>;
}
