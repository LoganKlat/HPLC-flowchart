"use client";

import { useState, type CSSProperties } from "react";
import { ChoiceSelect } from "@/components/choice-select";
import { beadSurface } from "@/lib/bead-surface";
import { porousSpots, shellSpots } from "@/lib/bead-spots";
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

function BeadDrawing({
  kind,
  ligand,
  ligandAt,
}: {
  kind: BeadKind;
  ligand: string;
  ligandAt: boolean[];
}) {
  const spots = kind === "porous" ? porousSpots : shellSpots;
  const frame = framePlacement(kind);

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
