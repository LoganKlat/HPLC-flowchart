"use client";

import { useState, type CSSProperties } from "react";
import { ChoiceSelect } from "@/components/choice-select";
import { FunctionNoteView, type FunctionNote } from "@/components/function-note";
import { KindMark } from "@/components/setting-legend";
import { beadSurface } from "@/lib/bead-surface";
import { porousSpots, shellSpots } from "@/lib/bead-spots";
import { LIGANDS } from "@/lib/selectivity";

type BeadKind = "porous" | "shell";
type NoteId = "porous" | "shell" | "ligand" | "load" | "drawing" | "particle" | "pore";

const ligandSentences: Record<(typeof LIGANDS)[number], string> = {
  C18: "An 18-carbon chain. It holds oily compounds strongly.",
  C8: "An 8-carbon chain. It holds them less strongly than C18.",
  C18aq: "A C18 that still works when the mobile phase is mostly water.",
  PFPP: "A fluorinated ring. It holds some compounds that a plain C18 lets go.",
  biphenyl: "Two rings. Shape matters more than on a plain chain.",
  IBD: "A polar group built in. It holds bases and polar compounds differently from C18.",
};

const carbonLoadDoes =
  "Carbon load is the share of the bead that is carbon from the bonded ligands. A higher percent means more of the surface is coated and fewer free SiOH groups are left. On this picture, the percent is that share out of 100 spots. At 10%, 10 spots are ligands and 90 are still SiOH.";
const carbonLoadChanges =
  "A higher carbon load holds oily compounds longer on a coating such as C18, and bases tail less because fewer free silanols are left to grab them. A lower carbon load leaves more SiOH. Polar compounds and bases can stick to those silanols, so peaks can tail, and oily compounds are usually held less strongly. Holding longer is retention. Tailing is wider peaks, which is lower efficiency. Bases and polar compounds sticking to free SiOH, instead of the ligand, is a selectivity change.";

const notes: Record<Exclude<NoteId, "ligand">, { label: string; note: FunctionNote }> = {
  porous: {
    label: "Fully porous",
    note: {
      does: "Compounds travel through the whole bead. The particle is porous all the way through.",
      sets: "The column particle. The Fully porous button on this tab selects it. On Run 1, Core shell set to No is the same choice.",
      range: "A choice, not a number. Fully porous or core shell. No units.",
      changes:
        "Fully porous means more surface, so more retention. Peaks can be wider, which is lower efficiency, because compounds wander deep inside. Selectivity does not change from this choice. The ligand still decides which compounds stick.",
    },
  },
  shell: {
    label: "Core shell",
    note: {
      does: "A solid core with a thin porous layer. Compounds only travel a short way into the bead.",
      sets: "The column particle. The Core shell button on this tab selects it. On Run 1, Core shell set to Yes is the same choice.",
      range: "A choice, not a number. Fully porous or core shell. No units.",
      changes:
        "Core shell means a shorter path, narrower peaks, and often less retention. Narrower peaks are higher efficiency. Selectivity does not change from the shell alone. The ligand still decides which compounds stick.",
    },
  },
  load: {
    label: "Carbon load",
    note: {
      does: carbonLoadDoes,
      sets: "The column packing. The carbon-load slider on this tab sets the picture. The Carbon load field on Run 1 records the same percent.",
      range: "0–100% on this slider. It starts at 10%. The percent is the share of ligand spots out of 100.",
      changes: carbonLoadChanges,
    },
  },
  drawing: {
    label: "Bead",
    note: {
      does: "A cut through one bead. The spots are the surface. Ligands replace SiOH in proportion to the carbon load. The line across one pore is the pore width.",
      sets: "The drawing follows the controls on this tab: fully porous or core shell, ligand, carbon load, particle size, and pore size.",
      range: "Particle size is 1.5–10 µm. Pore size is 60–300 Å. Carbon load is 0–100%. The drawing uses those slider values. It is not a measured bead.",
      changes:
        "The drawing itself does not change a run. Fully porous means more retention, and peaks can be wider. Core shell means a shorter path, narrower peaks, and often less retention. The ligand is the selectivity change. Carbon load changes how many spots are ligands, which changes retention.",
    },
  },
  particle: {
    label: "Particle size",
    note: {
      does: "Particle size is the diameter of the bead.",
      sets: "The column packing. The particle-size slider on this tab sets how large the drawing is. The Particle size field on Run 1 records it.",
      range: "1.5–10 µm on this slider. It starts at 5 µm.",
      changes:
        "Smaller particles give narrower peaks and higher back-pressure. Narrower peaks are higher efficiency. Larger particles give wider peaks and lower back-pressure. Selectivity does not change. Retention factor k does not change from particle size alone.",
    },
  },
  pore: {
    label: "Pore size",
    note: {
      does: "Pore size is the width of the channels inside the bead. A wider pore lets larger compounds in. A narrower pore has more surface for small compounds. This line is the width only. The picture does not reshape the bead.",
      sets: "The column packing. The pore-size slider sets the line on the picture. The Pore size field on Run 1 records it.",
      range: "60–300 Å on this slider. It starts at 100 Å.",
      changes:
        "If a compound is too big for the pore, it cannot reach the coating inside, so retention and selectivity can change. For small compounds that fit, a narrower pore means more surface and often more retention. Pore size does not change efficiency the way particle size does.",
    },
  },
};

function ligandNote(name: (typeof LIGANDS)[number] | undefined): FunctionNote {
  const picked = name ? ` ${ligandSentences[name]}` : "";
  return {
    does: `The ligand is the coating bonded on the silica.${picked} The mark on each ligand spot changes with the ligand. A C18 tail is longer than a C8 tail. Biphenyl uses a ring-like mark.`,
    sets: "The column coating. The ligand menu on this tab sets the mark. The Ligand field on Run 1 records the same choice.",
    range: "The choices are C18, C18aq, PFPP, C8, biphenyl, and IBD. A name, not a number. No units.",
    changes:
      "The ligand is the coating and is the last selectivity change. Peaks can pull apart or change order. Retention also changes, because a different coating holds compounds more or less strongly. It does not by itself change efficiency (how narrow the peaks are).",
  };
}

function formatMicrons(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

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

const beadFrames = {
  porous: { src: "/equipment/bead-fully-porous.png", cx: 236.3, cy: 180, r: 172, w: 418, h: 360 },
  shell: { src: "/equipment/bead-core-shell.png", cx: 165.9, cy: 152.5, r: 145, w: 352, h: 318 },
} as const;

const ligandPictures: Record<(typeof LIGANDS)[number], string> = {
  C18: "/equipment/ligand-c18.png",
  C8: "/equipment/ligand-c8.png",
  C18aq: "/equipment/ligand-c18aq.png",
  biphenyl: "/equipment/ligand-biphenyl.png",
  PFPP: "/equipment/ligand-pfpp.png",
  IBD: "/equipment/ligand-ibd.png",
};

const drawCenter = 220;
const drawRadius = 198;

/** One pore in the picture, in drawing coordinates. The line never grows past this width. */
const poreMarks = {
  porous: { x: 144.3, y: 291.4, half: 12.1 },
  shell: { x: 201, y: 82.8, half: 12.3 },
} as const;

function framePlacement(kind: BeadKind) {
  const frame = beadFrames[kind];
  const scale = drawRadius / frame.r;
  return {
    src: frame.src,
    x: drawCenter - frame.cx * scale,
    y: drawCenter - frame.cy * scale,
    width: frame.w * scale,
    height: frame.h * scale,
  };
}

function LigandMark({ ligand }: { ligand: string }) {
  if (ligand === "C18" || ligand === "C18aq") {
    return (
      <g>
        <path d="M0 0 L16 0" stroke="#0f6b56" strokeWidth="2.4" strokeLinecap="round" />
        {ligand === "C18aq" ? <circle cx="16" cy="0" r="3" fill="#7eb9d4" stroke="#144237" strokeWidth="0.8" /> : null}
      </g>
    );
  }
  if (ligand === "C8") {
    return <path d="M0 0 L8 0" stroke="#0f6b56" strokeWidth="2.4" strokeLinecap="round" />;
  }
  if (ligand === "biphenyl") {
    return (
      <g>
        <circle cx="3" cy="0" r="3.2" fill="none" stroke="#0f6b56" strokeWidth="1.8" />
        <circle cx="8.2" cy="0" r="3.2" fill="none" stroke="#0f6b56" strokeWidth="1.8" />
      </g>
    );
  }
  if (ligand === "PFPP") {
    return (
      <g>
        <circle cx="4" cy="0" r="3.4" fill="none" stroke="#0f6b56" strokeWidth="1.8" />
        <path d="M7.4 0 L11 0" stroke="#0f6b56" strokeWidth="1.8" strokeLinecap="round" />
      </g>
    );
  }
  if (ligand === "IBD") {
    return (
      <g>
        <path d="M0 0 L7 0" stroke="#0f6b56" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M7 -3.2 L11.2 0 L7 3.2 Z" fill="#0f6b56" />
      </g>
    );
  }
  return <circle r="4.2" fill="#0f6b56" />;
}

/** 10 µm is only a modest step up from 5 µm, and both stay inside the figure. */
function beadWidthPercent(particleUm: number): number {
  const low = 1.5;
  const high = 10;
  const clamped = Math.min(high, Math.max(low, particleUm));
  const t = (clamped - low) / (high - low);
  return 64 + t * 24;
}

function BeadDrawing({
  kind,
  ligand,
  ligandAt,
  particleUm,
  poreAngstroms,
}: {
  kind: BeadKind;
  ligand: string;
  ligandAt: boolean[];
  particleUm: number;
  poreAngstroms: number;
}) {
  const spots = kind === "porous" ? porousSpots : shellSpots;
  const frame = framePlacement(kind);
  const pore = poreMarks[kind];
  const lineHalf = pore.half * (poreAngstroms / 300);
  const labelY = pore.y < 130 ? pore.y + 22 : pore.y - 16;

  return (
    <svg
      id="bead-drawing"
      viewBox="0 0 440 440"
      style={{ width: `${beadWidthPercent(particleUm)}%` }}
      className="block h-auto max-w-full"
      role="img"
      aria-label={kind === "porous" ? "Cut through a fully porous bead" : "Cut through a core shell bead"}
      data-kind={kind}
      data-ligands={ligandAt.filter(Boolean).length}
      data-silanols={ligandAt.length - ligandAt.filter(Boolean).length}
      data-particle={particleUm}
      data-pore={poreAngstroms}
      data-line={lineHalf * 2}
    >
      <defs>
        <clipPath id="bead-clip">
          <circle cx={drawCenter} cy={drawCenter} r={drawRadius} />
        </clipPath>
      </defs>
      <g clipPath="url(#bead-clip)">
        <image href={frame.src} x={frame.x} y={frame.y} width={frame.width} height={frame.height} />
      </g>
      <circle cx={drawCenter} cy={drawCenter} r={drawRadius} fill="none" stroke="#0f6b56" strokeWidth="3" />
      {spots.map(([x, y], index) => {
        const ligandSpot = ligandAt[index] === true;
        return (
          <g key={index} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
            <circle r="7.2" fill="#ffffff" opacity="0.92" />
            {ligandSpot ? (
              <LigandMark ligand={ligand} />
            ) : (
              <circle r="4.6" fill="#f6e2a8" stroke="#6a4b16" strokeWidth="1.4" />
            )}
          </g>
        );
      })}
      <g id="bead-pore-line">
        <line
          x1={pore.x - lineHalf}
          x2={pore.x + lineHalf}
          y1={pore.y}
          y2={pore.y}
          stroke="#ffffff"
          strokeWidth="7"
          strokeLinecap="butt"
        />
        <line
          x1={pore.x - lineHalf}
          x2={pore.x + lineHalf}
          y1={pore.y}
          y2={pore.y}
          stroke="#0f6b56"
          strokeWidth="3"
          strokeLinecap="butt"
        />
        <line
          x1={pore.x - lineHalf}
          x2={pore.x - lineHalf}
          y1={pore.y - 7}
          y2={pore.y + 7}
          stroke="#0f6b56"
          strokeWidth="2.5"
        />
        <line
          x1={pore.x + lineHalf}
          x2={pore.x + lineHalf}
          y1={pore.y - 7}
          y2={pore.y + 7}
          stroke="#0f6b56"
          strokeWidth="2.5"
        />
        <text
          x={pore.x}
          y={labelY}
          textAnchor="middle"
          fontSize="16"
          fill="#144237"
          stroke="#ffffff"
          strokeWidth="5"
          paintOrder="stroke"
          className="font-sans"
        >
          {poreAngstroms} Å
        </text>
      </g>
    </svg>
  );
}

export function BeadDiagram() {
  const [kind, setKind] = useState<BeadKind>("porous");
  const [ligand, setLigand] = useState("");
  const [carbonLoad, setCarbonLoad] = useState(10);
  const [particleUm, setParticleUm] = useState(5);
  const [poreAngstroms, setPoreAngstroms] = useState(100);
  const [hoveredChoice, setHoveredChoice] = useState<BeadKind | null>(null);
  const [openId, setOpenId] = useState<NoteId | null>(null);
  const [pinnedId, setPinnedId] = useState<NoteId | null>(null);
  const [carbonTip, setCarbonTip] = useState(false);
  const surface = beadSurface(carbonLoad);
  const sentence = LIGANDS.find((name) => name === ligand);
  const open =
    openId === "ligand"
      ? { label: "Ligand", note: ligandNote(sentence) }
      : openId
        ? notes[openId]
        : null;

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
        <div id="bead-standing" className="rounded-xl bg-[#e7f3ee] px-4 py-3 text-sm leading-relaxed text-[#144237]">
          <FunctionNoteView
            title={kind === "porous" ? notes.porous.label : notes.shell.label}
            note={kind === "porous" ? notes.porous.note : notes.shell.note}
          />
        </div>
        <figure
          className="mx-auto flex w-full max-w-[28rem] items-center justify-center overflow-hidden rounded-xl bg-card px-3 py-3 ring-1 ring-foreground/10 sm:px-4"
          {...bind("drawing")}
        >
          <BeadDrawing
            kind={kind}
            ligand={ligand}
            ligandAt={surface.ligandAt}
            particleUm={particleUm}
            poreAngstroms={poreAngstroms}
          />
        </figure>
        <p id="bead-counts" className="px-1 font-heading text-xl text-[#144237]">
          {surface.ligands} ligands. {surface.silanols} SiOH.
        </p>
        <ul id="bead-legend" className="flex flex-col gap-3 px-1 sm:flex-row sm:flex-wrap sm:items-center">
          <li className="flex items-center gap-2 text-sm">
            <svg viewBox="0 0 20 20" className="size-5 shrink-0" aria-hidden="true">
              <circle cx="10" cy="10" r="6.2" fill="#f6e2a8" stroke="#6a4b16" strokeWidth="1.6" />
            </svg>
            <span>SiOH</span>
          </li>
          <li className="flex items-center gap-2 text-sm">
            <svg viewBox="0 0 20 20" className="size-5 shrink-0" aria-hidden="true">
              <circle cx="10" cy="10" r="6.2" fill="#0f6b56" />
            </svg>
            <span>{sentence ?? "Ligand"}</span>
            {sentence ? (
              <img
                src={ligandPictures[sentence]}
                alt=""
                className="h-20 w-auto rounded-md bg-black px-2 py-1"
              />
            ) : null}
          </li>
        </ul>
        <div className="flex flex-col gap-1.5" {...bind("ligand")}>
          <label htmlFor="bead-ligand" className="flex flex-wrap items-center gap-2 text-sm font-medium">
            Ligand
            <KindMark kind="chemical" />
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
        <div className="rounded-lg px-1 py-2">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Carbon load <KindMark kind="chemical" /></p>
              <p className="text-xs text-muted-foreground">Percent</p>
            </div>
            <p className="font-heading text-lg text-[#144237] tabular-nums">{carbonLoad}%</p>
          </div>
          <div
            className="relative mt-1"
            onMouseEnter={() => setCarbonTip(true)}
            onMouseLeave={() => setCarbonTip(false)}
          >
            <input
              id="bead-carbon-load"
              className="column-slider"
              type="range"
              min={0}
              max={100}
              step={1}
              value={carbonLoad}
              aria-valuetext={`${carbonLoad} percent`}
              aria-describedby={carbonTip ? "carbon-load-note" : undefined}
              onChange={(event) => setCarbonLoad(Number(event.target.value))}
              onClick={() => setCarbonTip(true)}
            />
            {carbonTip ? (
              <div
                id="carbon-load-note"
                role="tooltip"
                className="absolute bottom-full left-0 z-30 mb-2 w-[min(100%,36rem)] rounded-xl bg-card p-4 text-sm leading-relaxed text-foreground shadow-lg ring-1 ring-foreground/10"
              >
                <FunctionNoteView title={notes.load.label} note={notes.load.note} />
              </div>
            ) : null}
          </div>
        </div>
        <div className="rounded-lg px-1 py-2" {...bind("particle")}>
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium">Particle size <KindMark kind="mechanical" /></p>
            <p className="font-heading text-lg text-[#144237] tabular-nums">
              {formatMicrons(particleUm)} µm
            </p>
          </div>
          <input
            id="bead-particle-size"
            className="column-slider mt-1"
            type="range"
            min={1.5}
            max={10}
            step={0.1}
            value={particleUm}
            aria-valuetext={`${formatMicrons(particleUm)} micrometers`}
            onChange={(event) => setParticleUm(Number(event.target.value))}
          />
        </div>
        <div className="rounded-lg px-1 py-2" {...bind("pore")}>
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium">Pore size <KindMark kind="chemical" /></p>
            <p className="font-heading text-lg text-[#144237] tabular-nums">{poreAngstroms} Å</p>
          </div>
          <input
            id="bead-pore-size"
            className="column-slider mt-1"
            type="range"
            min={60}
            max={300}
            step={1}
            value={poreAngstroms}
            aria-valuetext={`${poreAngstroms} angstroms`}
            onChange={(event) => setPoreAngstroms(Number(event.target.value))}
          />
        </div>
      </div>
      <aside
        id="bead-note"
        className="rounded-xl bg-card px-4 py-4 text-sm leading-relaxed text-foreground ring-1 ring-foreground/10 lg:sticky lg:top-4 lg:col-start-2 lg:row-start-1"
      >
        {open ? (
          <FunctionNoteView title={open.label} note={open.note} />
        ) : (
          <p className="text-muted-foreground">Hover or tap a control, or the bead.</p>
        )}
      </aside>
    </section>
  );
}
