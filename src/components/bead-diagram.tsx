"use client";

import { useState, type CSSProperties } from "react";
import { ChoiceSelect } from "@/components/choice-select";
import { beadSurface } from "@/lib/bead-surface";
import { LIGANDS } from "@/lib/selectivity";

type BeadKind = "porous" | "shell";
type NoteId = "porous" | "shell" | "ligand" | "load" | "drawing";

const ligandSentences: Record<(typeof LIGANDS)[number], string> = {
  C18: "An 18-carbon chain. It holds oily compounds strongly.",
  C8: "An 8-carbon chain. It holds them less strongly than C18.",
  C18aq: "A C18 that still works when the mobile phase is mostly water.",
  PFPP: "A fluorinated ring. It holds some compounds that a plain C18 lets go.",
  biphenyl: "Two rings. Shape matters more than on a plain chain.",
  IBD: "A polar group built in. It holds bases and polar compounds differently from C18.",
};

const notes: Record<NoteId, { label: string; body: string }> = {
  porous: {
    label: "Fully porous",
    body: "Compounds travel through the whole bead. More surface means more retention. Peaks can be wider because compounds wander deep inside.",
  },
  shell: {
    label: "Core shell",
    body: "Compounds only travel a short way, so peaks are narrower. Less surface, so retention is often lower. You can often run faster.",
  },
  ligand: {
    label: "Ligand",
    body: "The ligand is the group bonded on the silica. The mark on each ligand spot changes with the ligand you pick. A C18 tail is longer than a C8 tail. Biphenyl uses a ring-like mark.",
  },
  load: {
    label: "Carbon load",
    body: "Carbon load is the percent of the surface spots that are ligands. The rest stay SiOH. At 10, the drawing shows 10 ligands and 90 SiOH.",
  },
  drawing: {
    label: "Bead",
    body: "The spots are the surface. Ligands replace SiOH in proportion to the carbon load.",
  },
};

function choiceStyle(selected: boolean, hovered: boolean): CSSProperties {
  if (selected && hovered) {
    return { backgroundColor: "#a9d4c4", borderColor: "#0a5644", color: "#144237", fontWeight: 600 };
  }
  if (selected) {
    return { backgroundColor: "#cfe8df", borderColor: "#0f6b56", color: "#144237", fontWeight: 600 };
  }
  if (hovered) {
    return { backgroundColor: "#efe6c4", borderColor: "#b0893e", color: "#3d3416", fontWeight: 600 };
  }
  return {
    backgroundColor: "var(--background)",
    borderColor: "var(--border)",
    color: "var(--foreground)",
    fontWeight: 500,
  };
}

type Pt = { x: number; y: number };

function normals(pts: Pt[]): Pt[] {
  return pts.map((_, index) => {
    const prev = pts[(index - 1 + pts.length) % pts.length];
    const next = pts[(index + 1) % pts.length];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: -dy / len, y: dx / len };
  });
}

function offset(pts: Pt[], distance: number): Pt[] {
  const dirs = normals(pts);
  return pts.map((pt, index) => ({
    x: pt.x + dirs[index].x * distance,
    y: pt.y + dirs[index].y * distance,
  }));
}

function ribbonPath(center: Pt[], distance: number, closed: boolean) {
  const upper = offset(center, distance);
  const lower = offset(center, -distance);
  const line = (pts: Pt[]) =>
    pts.map((pt, index) => `${index === 0 ? "M" : "L"}${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(" ");
  if (closed) return `${line(upper)} Z ${line(lower)} Z`;
  return `${line(upper)} ${lower
    .slice()
    .reverse()
    .map((pt) => `L${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
    .join(" ")} Z`;
}

function sampleWall(center: Pt[], count: number, distance: number, closed: boolean): Pt[] {
  const wall = offset(center, distance);
  const usable = closed ? wall.slice(0, -1) : wall;
  const spots: Pt[] = [];
  for (let index = 0; index < count; index++) {
    const at = Math.round((index * (usable.length - 1)) / Math.max(1, count - 1));
    spots.push(usable[Math.min(usable.length - 1, at)]);
  }
  return spots;
}

function porousChannels(): Pt[][] {
  const channels: Pt[][] = [];
  for (let channel = 0; channel < 5; channel++) {
    const yBase = 78 + channel * 66;
    const pts: Pt[] = [];
    for (let step = 0; step <= 28; step++) {
      const t = step / 28;
      const y = yBase + Math.sin(t * Math.PI * 2 + channel * 0.8) * 14;
      const dy = y - 220;
      const half = Math.sqrt(Math.max(0, 176 * 176 - dy * dy));
      const x = 220 - half + 16 + t * Math.max(20, half * 2 - 32);
      pts.push({ x, y });
    }
    channels.push(pts);
  }
  return channels;
}

function shellRings(): Pt[][] {
  const rings: Pt[][] = [];
  for (let ring = 0; ring < 4; ring++) {
    const radius = 118 + ring * 16;
    const pts: Pt[] = [];
    for (let step = 0; step <= 56; step++) {
      const angle = (step / 56) * Math.PI * 2;
      const wobble = Math.sin(angle * 5 + ring) * 3.5;
      pts.push({
        x: 220 + Math.cos(angle) * (radius + wobble),
        y: 220 + Math.sin(angle) * (radius + wobble),
      });
    }
    rings.push(pts);
  }
  return rings;
}

function spotAngle(spots: Pt[], index: number) {
  const prev = spots[Math.max(0, index - 1)];
  const next = spots[Math.min(spots.length - 1, index + 1)];
  return Math.atan2(next.y - prev.y, next.x - prev.x);
}

function LigandMark({ ligand, angle }: { ligand: string; angle: number }) {
  const turn = `rotate(${((angle * 180) / Math.PI).toFixed(1)})`;
  if (ligand === "C18" || ligand === "C18aq") {
    return (
      <g transform={turn}>
        <path d="M0 0 L12 0" stroke="#0f6b56" strokeWidth="1.7" strokeLinecap="round" />
        {ligand === "C18aq" ? <circle cx="12" cy="0" r="2.1" fill="#7eb9d4" stroke="#144237" strokeWidth="0.6" /> : null}
      </g>
    );
  }
  if (ligand === "C8") {
    return (
      <g transform={turn}>
        <path d="M0 0 L6 0" stroke="#0f6b56" strokeWidth="1.7" strokeLinecap="round" />
      </g>
    );
  }
  if (ligand === "biphenyl") {
    return (
      <g transform={turn}>
        <circle cx="2.2" cy="0" r="2.3" fill="none" stroke="#0f6b56" strokeWidth="1.3" />
        <circle cx="6.2" cy="0" r="2.3" fill="none" stroke="#0f6b56" strokeWidth="1.3" />
      </g>
    );
  }
  if (ligand === "PFPP") {
    return (
      <g transform={turn}>
        <circle cx="3" cy="0" r="2.6" fill="none" stroke="#0f6b56" strokeWidth="1.3" />
        <path d="M5.6 0 L8.2 0" stroke="#0f6b56" strokeWidth="1.3" strokeLinecap="round" />
      </g>
    );
  }
  if (ligand === "IBD") {
    return (
      <g transform={turn}>
        <path d="M0 0 L5 0" stroke="#0f6b56" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M5 -2.4 L8.2 0 L5 2.4 Z" fill="#0f6b56" />
      </g>
    );
  }
  return <circle r="2.2" fill="#0f6b56" />;
}

function BeadDrawing({
  kind,
  ligand,
  ligandAt,
}: {
  kind: BeadKind;
  ligand: string;
  ligandAt: boolean[];
}) {
  const channels = kind === "porous" ? porousChannels() : shellRings();
  const per = kind === "porous" ? 20 : 25;
  const closed = kind === "shell";
  const spots = channels.flatMap((channel) => sampleWall(channel, per, closed ? 6 : 7, closed));

  return (
    <svg
      id="bead-drawing"
      viewBox="0 0 440 440"
      className="mx-auto block h-auto w-full max-w-[28rem]"
      role="img"
      aria-label={kind === "porous" ? "Cut through a fully porous bead" : "Cut through a core shell bead"}
      data-kind={kind}
      data-ligands={ligandAt.filter(Boolean).length}
      data-silanols={ligandAt.length - ligandAt.filter(Boolean).length}
    >
      <defs>
        <radialGradient id="bead-silica" cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#f7fffb" />
          <stop offset="70%" stopColor="#e7f3ee" />
          <stop offset="100%" stopColor="#c5ddd2" />
        </radialGradient>
        <radialGradient id="bead-core" cx="42%" cy="38%" r="68%">
          <stop offset="0%" stopColor="#8d9893" />
          <stop offset="100%" stopColor="#3f4a45" />
        </radialGradient>
      </defs>
      <circle cx="220" cy="220" r="188" fill="url(#bead-silica)" stroke="#0f6b56" strokeWidth="3" />
      {kind === "shell" ? (
        <circle cx="220" cy="220" r="100" fill="url(#bead-core)" stroke="#144237" strokeWidth="2.5" />
      ) : null}
      {channels.map((channel, index) => (
        <path
          key={index}
          d={ribbonPath(channel, kind === "porous" ? 9 : 5.5, closed)}
          fill="#f4f1e4"
          fillRule="evenodd"
          stroke="#c4b48a"
          strokeWidth="1"
        />
      ))}
      {spots.map((spot, index) => {
        const ligandSpot = ligandAt[index] === true;
        return (
          <g key={index} transform={`translate(${spot.x.toFixed(1)} ${spot.y.toFixed(1)})`}>
            {ligandSpot ? (
              <LigandMark ligand={ligand} angle={spotAngle(spots, index) + Math.PI / 2} />
            ) : (
              <circle r="2.15" fill="#f4e2b0" stroke="#8a6a32" strokeWidth="0.8" />
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function BeadDiagram() {
  const [kind, setKind] = useState<BeadKind>("porous");
  const [ligand, setLigand] = useState("");
  const [carbonLoad, setCarbonLoad] = useState(10);
  const [hoveredChoice, setHoveredChoice] = useState<BeadKind | null>(null);
  const [openId, setOpenId] = useState<NoteId | null>(null);
  const [pinnedId, setPinnedId] = useState<NoteId | null>(null);
  const surface = beadSurface(carbonLoad);
  const open = openId ? notes[openId] : null;
  const sentence = LIGANDS.find((name) => name === ligand);

  function bind(id: NoteId) {
    return {
      onMouseEnter: () => setOpenId(id),
      onMouseLeave: () => setOpenId((current) => (current === id && pinnedId !== id ? null : current)),
      onClick: () => {
        setPinnedId((current) => {
          const next = current === id ? null : id;
          setOpenId(next);
          return next;
        });
      },
    };
  }

  return (
    <section id="bead-diagram" className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex min-w-0 flex-col gap-4 lg:col-start-1">
        <header>
          <p className="text-xs tracking-[0.16em] text-[#0f6b56] uppercase">Particle</p>
          <h2 className="mt-1 font-heading text-2xl text-[#144237]">One bead</h2>
          <p className="mt-2 max-w-2xl text-base text-muted-foreground">
            A cut through one bead. The channels are the pores. Pick fully porous or core shell, pick a
            ligand, and set the carbon load. The drawing changes.
          </p>
        </header>
        <div id="bead-kinds" className="flex flex-wrap gap-2">
          {(
            [
              ["porous", "Fully porous"],
              ["shell", "Core shell"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              id={id === "porous" ? "bead-fully-porous" : "bead-core-shell"}
              type="button"
              aria-pressed={kind === id}
              className="h-10 rounded-md border border-solid px-4 text-sm transition-none"
              style={choiceStyle(kind === id, hoveredChoice === id)}
              onMouseEnter={() => {
                setHoveredChoice(id);
                setOpenId(id);
              }}
              onMouseLeave={() => {
                setHoveredChoice((current) => (current === id ? null : current));
                setOpenId((current) => (current === id && pinnedId !== id ? null : current));
              }}
              onClick={() => {
                setKind(id);
                setPinnedId((current) => {
                  const next = current === id ? null : id;
                  setOpenId(next);
                  return next;
                });
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <p id="bead-standing" className="rounded-xl bg-[#e7f3ee] px-4 py-3 text-sm leading-relaxed text-[#144237]">
          {kind === "porous" ? notes.porous.body : notes.shell.body}
        </p>
        <figure
          className="rounded-xl bg-card px-3 py-3 ring-1 ring-foreground/10 sm:px-4"
          {...bind("drawing")}
        >
          <BeadDrawing kind={kind} ligand={ligand} ligandAt={surface.ligandAt} />
        </figure>
        <p id="bead-counts" className="px-1 font-heading text-xl text-[#144237]">
          {surface.ligands} ligands. {surface.silanols} SiOH.
        </p>
        <div className="flex flex-col gap-1.5" {...bind("ligand")}>
          <label htmlFor="bead-ligand" className="text-sm font-medium">
            Ligand
          </label>
          <ChoiceSelect
            id="bead-ligand"
            value={ligand}
            placeholder="select a ligand"
            options={LIGANDS.map((name) => ({ value: name, label: name }))}
            onChange={setLigand}
          />
          {sentence ? <p className="text-sm text-muted-foreground">{ligandSentences[sentence]}</p> : null}
        </div>
        <div className="rounded-lg px-1 py-2" {...bind("load")}>
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Carbon load</p>
              <p className="text-xs text-muted-foreground">Percent</p>
            </div>
            <p className="font-heading text-lg text-[#144237] tabular-nums">{carbonLoad}%</p>
          </div>
          <input
            id="bead-carbon-load"
            className="column-slider mt-1"
            type="range"
            min={0}
            max={100}
            step={1}
            value={carbonLoad}
            aria-valuetext={`${carbonLoad} percent`}
            onChange={(event) => setCarbonLoad(Number(event.target.value))}
          />
        </div>
      </div>
      <aside
        id="bead-note"
        className="rounded-xl bg-card px-4 py-4 text-sm leading-relaxed text-foreground ring-1 ring-foreground/10 lg:sticky lg:top-4 lg:col-start-2 lg:row-start-1"
      >
        {open ? (
          <>
            <p className="font-medium">{open.label}</p>
            <p className="mt-1">{open.body}</p>
          </>
        ) : (
          <p className="text-muted-foreground">Hover or tap a control, or the bead.</p>
        )}
      </aside>
    </section>
  );
}
