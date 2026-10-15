"use client";

import { useMemo, useState } from "react";
import { FlaskConical, X, Eye } from "lucide-react";
import { ChoiceSelect } from "@/components/choice-select";
import { FunctionNoteView, type FunctionNote } from "@/components/function-note";
import { beadSurface } from "@/lib/bead-surface";
import { porousSpots, shellSpots } from "@/lib/bead-spots";
import { LIGANDS } from "@/lib/selectivity";
import { cn } from "@/lib/utils";

type BeadKind = "porous" | "shell";
type NoteId = "porous" | "shell" | "ligand" | "load" | "drawing" | "particle" | "pore";

export const STANDARD_LIGANDS = [
  "C18",
  "C8",
  "C4",
  "C30",
  "C18aq",
  "biphenyl",
  "PFPP",
  "IBD",
  "Phenyl",
  "CN",
  "NH2",
  "HILIC",
] as const;

export type StandardLigand = (typeof STANDARD_LIGANDS)[number];

export function resolveLigandKey(name: string): StandardLigand | "other" {
  const lower = name.toLowerCase().trim();
  if (lower.includes("c18aq") || (lower.includes("c18") && lower.includes("polar"))) return "C18aq";
  if (lower.includes("c30")) return "C30";
  if (lower.includes("c18")) return "C18";
  if (lower.includes("c8")) return "C8";
  if (lower.includes("c4")) return "C4";
  if (lower.includes("biphenyl")) return "biphenyl";
  if (lower.includes("pfpp") || lower.includes("f5") || lower.includes("pfp")) return "PFPP";
  if (lower.includes("ibd")) return "IBD";
  if (lower.includes("phenyl")) return "Phenyl";
  if (lower.includes("cn") || lower.includes("cyano")) return "CN";
  if (lower.includes("nh2") || lower.includes("amino") || lower.includes("aps")) return "NH2";
  if (lower.includes("hilic") || lower.includes("diol")) return "HILIC";
  return "other";
}

export const ligandSentences: Record<StandardLigand, string> = {
  C18: "Octadecyl (C18) alkyl chain. Imparts strong hydrophobic retention and broad selectivity for lipophilic solutes.",
  C8: "Octyl (C8) alkyl chain. Moderate hydrophobicity with shorter retention times and faster elution than C18.",
  C4: "Butyl (C4) short alkyl chain. Low hydrophobicity designed for intact proteins, biomolecules, and hydrophobic peptides.",
  C30: "Triacontyl (C30) long polymeric chain. Outstanding shape selectivity for geometric isomers, carotenoids, and steroids.",
  C18aq: "Aqueous-compatible C18 phase with polar endcapping. Resists stationary phase dewetting in 100% aqueous mobile phases.",
  biphenyl: "Biphenyl aromatic rings. Offers powerful π-π electron interactions and steric shape selectivity for fused aromatics.",
  PFPP: "Pentafluorophenyl propyl ligand. Exhibits dipole-dipole, π-π, and halogen-bonding interactions for fluorinated and basic drugs.",
  IBD: "Intrinsic base-deactivated ligand with embedded polar groups. Suppresses secondary silanol tailing for protonated amine drugs.",
  Phenyl: "Phenyl-Hexyl aromatic phase. Delivers enhanced π-π selectivity for aromatic compounds and orthogonal retention to straight-chain alkyls.",
  CN: "Cyanopropyl (-C≡N) polar bonded phase. Rapid re-equilibration with unique dipole selectivity in both reversed-phase and normal-phase modes.",
  NH2: "Aminopropyl (-NH2) weak anion-exchange and polar phase. Industry standard for carbohydrate analysis, sugars, and polar organic acids.",
  HILIC: "Hydrophilic interaction diol phase. Retains extremely polar and hydrophilic solutes that elute near the void volume in reversed-phase.",
};

export const ligandPictures: Record<StandardLigand, string> = {
  C18: "/equipment/ligand-c18.png",
  C8: "/equipment/ligand-c8.png",
  C4: "/equipment/ligand-c4.png",
  C30: "/equipment/ligand-c30.png",
  C18aq: "/equipment/ligand-c18aq.png",
  biphenyl: "/equipment/ligand-biphenyl.png",
  PFPP: "/equipment/ligand-pfpp.png",
  IBD: "/equipment/ligand-ibd.png",
  Phenyl: "/equipment/ligand-phenyl-hexyl.png",
  CN: "/equipment/ligand-cyano.png",
  NH2: "/equipment/ligand-amino.png",
  HILIC: "/equipment/ligand-hilic.png",
};

export const ligandBadges: Record<StandardLigand, string[]> = {
  C18: ["Hydrophobic Retention", "USP L1", "General Purpose"],
  C8: ["Moderate Retention", "USP L7", "Fast Elution"],
  C4: ["Low Retention", "USP L26", "Proteins & Peptides"],
  C30: ["Shape Selectivity", "USP L62", "Carotenoids & Isomers"],
  C18aq: ["100% Aqueous", "Polar Endcapped", "Anti-Dewetting"],
  biphenyl: ["π-π Interactions", "USP L11", "Aromatic Isomers"],
  PFPP: ["Dipole & Halogen", "USP L43", "Fluorinated Analytes"],
  IBD: ["Embedded Polar", "Base-Deactivated", "Low Silanol Tailing"],
  Phenyl: ["Aromatic π-π", "USP L11", "Orthogonal Selectivity"],
  CN: ["Cyano Dipole", "USP L10", "RP & NP Dual-Mode"],
  NH2: ["Weak Anion Exchange", "USP L8", "Carbohydrates & Sugars"],
  HILIC: ["Hydrophilic Interaction", "Diol Phase", "Ultra-Polar Retention"],
};

const carbonLoadDoes =
  "Carbon load is the mass percentage of carbon bonded to the silica bead surface from immobilized ligands. A higher percentage signifies dense surface coverage and fewer accessible residual silanol (SiOH) sites. In this schematic, each dot represents a surface bonding site out of 100 total positions.";
const carbonLoadChanges =
  "Elevated carbon load enhances hydrophobic retention (k) for non-polar molecules and minimizes peak tailing of basic compounds by shielding acidic silanols. Lower carbon load leaves more unshielded SiOH groups, causing peak tailing for basic amines and reducing retention for hydrophobic compounds.";

const notes: Record<Exclude<NoteId, "ligand">, { label: string; note: FunctionNote }> = {
  porous: {
    label: "Fully Porous Particles",
    note: {
      does: "Silica beads that are porous throughout the entire particle diameter. Solute molecules diffuse throughout the full particle volume.",
      sets: "The stationary phase particle type. Selected on this tab or via 'Core Shell: No' in Run specifications.",
      range: "Particle morphology selection: Fully Porous vs Core-Shell (SPP).",
      changes:
        "Fully porous particles provide maximum surface area and sample loadability, resulting in higher retention factors (k). However, longer intraparticle diffusion distances increase peak broadening (van Deemter C-term) at higher flow rates.",
    },
  },
  shell: {
    label: "Core-Shell (SPP) Particles",
    note: {
      does: "Superficially porous particles (SPP) featuring a solid, impermeable silica sphere surrounded by a thin, highly uniform porous silica outer layer.",
      sets: "The stationary phase particle type. Selected on this tab or via 'Core Shell: Yes' in Run specifications (e.g. Restek Raptor).",
      range: "Particle morphology selection: Fully Porous vs Core-Shell (SPP).",
      changes:
        "Core-shell particles dramatically shorten analyte diffusion distance, reducing the van Deemter C-term. This yields narrower peaks and ultra-high efficiency (high plate count N) at modest back-pressures, even at elevated flow rates.",
    },
  },
  load: {
    label: "Carbon Load (%)",
    note: {
      does: carbonLoadDoes,
      sets: "Stationary phase bonding density. Set by the carbon-load slider or the Carbon Load field in Run specifications.",
      range: "0–100% on this slider. Restek columns typically range from 4% (PFPP) to 7% (Raptor C18) and up to 20% (Force C18).",
      changes: carbonLoadChanges,
    },
  },
  drawing: {
    label: "Silica Bead Cross-Section",
    note: {
      does: "A cross-sectional cut through a single silica stationary phase particle. The outer dots indicate surface bonding sites: green marks represent bonded ligands, while gold dots denote residual free silanols (SiOH).",
      sets: "Visualizes the particle morphology, ligand identity, carbon load, particle diameter, and pore dimension.",
      range: "Particle size 1.5–10 µm; Pore size 60–300 Å; Carbon load 0–100%.",
      changes:
        "Interactive schematic depicting the interplay of particle morphology, surface functionalization, and channel width in reversed-phase HPLC.",
    },
  },
  particle: {
    label: "Particle Size (dp)",
    note: {
      does: "The spherical diameter of the silica beads packed inside the column tube.",
      sets: "The packing material particle diameter. Set on this tab or in the Particle Size field in Run specifications.",
      range: "1.5–10 µm. Typical values: 1.8 µm (UHPLC), 2.7 µm (Core-shell), 3 µm and 5 µm (Standard HPLC).",
      changes:
        "Smaller particles dramatically narrow peak widths and increase column efficiency (N ∝ 1/dp). However, column back-pressure rises sharply with 1/dp². Chemical selectivity (α) and retention factor (k) are unaffected by particle size alone.",
    },
  },
  pore: {
    label: "Pore Diameter (Å)",
    note: {
      does: "The internal width of the porous channels running through the silica structure. Allows solute molecules to access internal bonded ligands.",
      sets: "Silica pore diameter. Set on this tab or in the Pore Size field in Run specifications.",
      range: "60–300 Å. Standard small-molecule columns use 90 Å (Raptor), 100 Å (Force/Ultra), or 140 Å (Pinnacle). Large biomolecules require 300 Å.",
      changes:
        "Pore diameter must be at least 3× larger than the analyte's hydrodynamic radius to avoid size exclusion. For small molecules (<1000 Da), smaller pores provide higher specific surface area and greater retention.",
    },
  },
};

function ligandNote(name: string, sentence: string): FunctionNote {
  return {
    does: `The stationary phase ligand is the functional chemical group covalently bonded to the silica surface. ${sentence}`,
    sets: "The stationary phase chemistry. Selected on this tab or via the Coating / Ligand dropdown in Run specifications.",
    range: "Standard reversed-phase coatings: C18, C8, C4, C30, C18aq, biphenyl, PFPP, IBD, Phenyl, CN, NH2, HILIC.",
    changes:
      "Stationary phase ligand chemistry is the most potent selectivity (α) tool in method development. Different ligands alter analyte retention order and peak spacing through varying hydrophobic, π-π, dipole, and steric interactions.",
  };
}

function formatMicrons(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

const beadFrames = {
  porous: { src: "/equipment/bead-fully-porous.png", cx: 236.3, cy: 180, r: 172, w: 418, h: 360 },
  shell: { src: "/equipment/bead-core-shell.png", cx: 165.9, cy: 152.5, r: 145, w: 352, h: 318 },
} as const;

const drawCenter = 220;
const drawRadius = 198;

const poreMarks = {
  porous: { x: 144.3, y: 291.4, half: 12.1 },
  shell: { x: 201, y: 82.8, half: 12.3 },
} as const;

function framePlacement(kind: BeadKind) {
  const frame = beadFrames[kind];
  const scale = drawRadius / frame.r;
  return {
    src: frame.src,
    width: frame.w * scale,
    height: frame.h * scale,
    x: drawCenter - frame.cx * scale,
    y: drawCenter - frame.cy * scale,
  };
}

function LigandMark({ ligand }: { ligand: string }) {
  const key = resolveLigandKey(ligand);
  if (key === "C4") {
    return <line x1="0" y1="3.2" x2="0" y2="-3.2" stroke="var(--hp-brand)" strokeWidth="2.2" strokeLinecap="round" />;
  }
  if (key === "C8") {
    return <line x1="0" y1="4.6" x2="0" y2="-4.6" stroke="var(--hp-brand)" strokeWidth="2.4" strokeLinecap="round" />;
  }
  if (key === "C18" || key === "C18aq") {
    return <line x1="0" y1="6" x2="0" y2="-6" stroke="var(--hp-brand)" strokeWidth="2.8" strokeLinecap="round" />;
  }
  if (key === "C30") {
    return <line x1="0" y1="7.6" x2="0" y2="-7.6" stroke="var(--hp-brand)" strokeWidth="3" strokeLinecap="round" />;
  }
  if (key === "biphenyl") {
    return (
      <g>
        <circle cx="0" cy="-2.5" r="2.4" fill="none" stroke="var(--hp-brand)" strokeWidth="1.2" />
        <circle cx="0" cy="2.5" r="2.4" fill="none" stroke="var(--hp-brand)" strokeWidth="1.2" />
      </g>
    );
  }
  if (key === "PFPP") {
    return (
      <polygon
        points="0,-4.5 4,2.5 -4,2.5"
        fill="var(--hp-brand)"
        stroke="var(--hp-brand-strong)"
        strokeWidth="0.8"
      />
    );
  }
  if (key === "IBD") {
    return (
      <g>
        <line x1="0" y1="5" x2="0" y2="-5" stroke="var(--hp-brand)" strokeWidth="2" strokeLinecap="round" />
        <circle cx="0" cy="0" r="1.8" fill="var(--hp-paper)" />
      </g>
    );
  }
  if (key === "Phenyl") {
    return <circle cx="0" cy="0" r="3.2" fill="none" stroke="var(--hp-brand)" strokeWidth="1.6" />;
  }
  if (key === "CN") {
    return (
      <g>
        <line x1="0" y1="3.5" x2="0" y2="-1" stroke="var(--hp-brand)" strokeWidth="2" strokeLinecap="round" />
        <circle cx="0" cy="-3.5" r="1.6" fill="var(--hp-brand)" />
      </g>
    );
  }
  if (key === "NH2") {
    return (
      <polygon
        points="0,-3.8 3.5,3.2 -3.5,3.2"
        fill="none"
        stroke="var(--hp-brand)"
        strokeWidth="1.4"
      />
    );
  }
  if (key === "HILIC") {
    return (
      <g>
        <circle cx="0" cy="-2.2" r="1.8" fill="var(--hp-brand)" />
        <circle cx="0" cy="2.2" r="1.8" fill="var(--hp-brand)" />
      </g>
    );
  }
  return <circle r="4.6" fill="var(--hp-brand)" />;
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
  ligandAt: readonly boolean[];
  particleUm: number;
  poreAngstroms: number;
}) {
  const frame = framePlacement(kind);
  const spots = kind === "porous" ? porousSpots : shellSpots;
  const pore = poreMarks[kind];
  const poreT = (poreAngstroms - 60) / (300 - 60);
  const lineHalf = pore.half * (0.35 + 0.65 * poreT);
  const labelY = pore.y > drawCenter ? pore.y + 26 : pore.y - 14;

  // Scale particle between 0.82 (1.5 µm) and 1.06 (10 µm) so it scales visibly without layout disruptions
  const particleScale = Math.max(0.82, Math.min(1.06, 0.82 + ((particleUm - 1.5) / 8.5) * 0.24));

  return (
    <svg
      id="bead-drawing"
      viewBox="0 0 440 440"
      className="block h-auto w-full max-h-[380px]"
      role="img"
      aria-label={`Bead cross-section, ${kind === "porous" ? "fully porous" : "core shell"}, with ${ligand || "unspecified"} ligands, pore size ${poreAngstroms} Å, particle size ${formatMicrons(particleUm)} µm`}
      data-kind={kind}
      data-particle={formatMicrons(particleUm)}
      data-pore={poreAngstroms}
    >
      <defs>
        <clipPath id="bead-clip">
          <circle cx={drawCenter} cy={drawCenter} r={drawRadius} />
        </clipPath>
      </defs>

      <g
        transform={`translate(${drawCenter} ${drawCenter}) scale(${particleScale.toFixed(4)}) translate(${-drawCenter} ${-drawCenter})`}
        style={{ transition: "transform 140ms cubic-bezier(0.16, 1, 0.3, 1)" }}
      >
        {/* Core & Shell / Porous background */}
        <g clipPath="url(#bead-clip)">
          {/* Black circle backing so transparent pore channels render dark through the silica matrix */}
          <circle cx={drawCenter} cy={drawCenter} r={drawRadius} fill="#000000" />
          {kind === "shell" ? (
            <>
              {/* Light mode core-shell image */}
              <image
                href={frame.src}
                x={frame.x}
                y={frame.y}
                width={frame.width}
                height={frame.height}
                className="dark:hidden"
              />
              {/* Dark mode core-shell image with emerald outer porous crust and solid core */}
              <image
                href="/equipment/bead-core-shell-dark.png"
                x={frame.x}
                y={frame.y}
                width={frame.width}
                height={frame.height}
                className="hidden dark:block"
              />
            </>
          ) : (
            <image
              href={frame.src}
              x={frame.x}
              y={frame.y}
              width={frame.width}
              height={frame.height}
            />
          )}
        </g>

        {/* Outer bead boundary circle */}
        <circle cx={drawCenter} cy={drawCenter} r={drawRadius} fill="none" stroke="var(--hp-brand)" strokeWidth="3" />

        {/* Surface bonding sites */}
        {spots.map(([x, y], index) => {
          const ligandSpot = ligandAt[index] === true;
          return (
            <g key={index} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
              <circle r="7.2" fill="var(--hp-paper)" opacity="0.92" />
              {ligandSpot ? (
                <LigandMark ligand={ligand} />
              ) : (
                <circle r="4.6" fill="var(--hp-gold-bright)" stroke="var(--hp-gold-deep)" strokeWidth="1.4" />
              )}
            </g>
          );
        })}

        {/* Internal Pore Dimension indicator */}
        <g id="bead-pore-line">
          <line
            x1={pore.x - lineHalf}
            x2={pore.x + lineHalf}
            y1={pore.y}
            y2={pore.y}
            stroke="var(--hp-paper)"
            strokeWidth="7"
            strokeLinecap="butt"
          />
          <line
            x1={pore.x - lineHalf}
            x2={pore.x + lineHalf}
            y1={pore.y}
            y2={pore.y}
            stroke="var(--hp-brand)"
            strokeWidth="3"
            strokeLinecap="butt"
          />
          <line
            x1={pore.x - lineHalf}
            x2={pore.x - lineHalf}
            y1={pore.y - 7}
            y2={pore.y + 7}
            stroke="var(--hp-brand)"
            strokeWidth="2.5"
          />
          <line
            x1={pore.x + lineHalf}
            x2={pore.x + lineHalf}
            y1={pore.y - 7}
            y2={pore.y + 7}
            stroke="var(--hp-brand)"
            strokeWidth="2.5"
          />
          <text
            x={pore.x}
            y={labelY}
            textAnchor="middle"
            fontSize="16"
            fontWeight="bold"
            fill="var(--hp-ink)"
            stroke="var(--hp-paper)"
            strokeWidth="5"
            paintOrder="stroke"
            className="font-sans"
          >
            {poreAngstroms} Å
          </text>
        </g>
      </g>
    </svg>
  );
}

export function BeadDiagram({ ligands = LIGANDS }: { ligands?: readonly string[] }) {
  const [kind, setKind] = useState<BeadKind>("porous");
  const [ligand, setLigand] = useState("C18");
  const [carbonLoad, setCarbonLoad] = useState(10);
  const [particleUm, setParticleUm] = useState(2.7);
  const [poreAngstroms, setPoreAngstroms] = useState(90);
  const [openId, setOpenId] = useState<NoteId | null>(null);

  const surface = beadSurface(carbonLoad);

  // Combine standard HPLC ligands and custom column database coatings
  const availableLigands = useMemo(() => {
    const list: string[] = [...STANDARD_LIGANDS];
    for (const item of ligands) {
      if (!list.includes(item)) {
        list.push(item);
      }
    }
    return list;
  }, [ligands]);

  const resolvedKey = resolveLigandKey(ligand);
  const currentSentence =
    resolvedKey !== "other"
      ? ligandSentences[resolvedKey]
      : `Stationary phase ligand: ${ligand}. Functional bonded group covalently anchored to silica substrate.`;
  const currentPicture =
    resolvedKey !== "other" ? ligandPictures[resolvedKey] : null;
  const currentBadges =
    resolvedKey !== "other" ? ligandBadges[resolvedKey] : ["Bonded Stationary Phase"];

  const open =
    openId === "ligand"
      ? { label: `Ligand Chemistry: ${ligand}`, note: ligandNote(ligand, currentSentence) }
      : openId
        ? notes[openId]
        : null;

  function toggleNote(id: NoteId) {
    setOpenId((current) => (current === id ? null : id));
  }

  return (
    <section id="bead-diagram" className="grid items-start gap-6 lg:grid-cols-12">
      {/* Main Bead Area (8 Cols) */}
      <div className="flex flex-col gap-5 lg:col-span-8">
        <header>
          <h2 className="font-heading text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            Silica Particle Chemistry
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Particle morphology (fully porous vs. core-shell), pore size, and carbon load govern efficiency and retention.
          </p>
        </header>

        {/* Morphology Selector: Fully Porous vs Core-Shell */}
        <div id="bead-kinds" className="flex flex-wrap items-center gap-2">
          <button
            id="bead-fully-porous"
            type="button"
            aria-pressed={kind === "porous"}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all cursor-pointer select-none",
              kind === "porous"
                ? "border-[var(--hp-brand)] bg-[var(--hp-soft)] text-foreground font-semibold shadow-2xs ring-1 ring-[var(--hp-brand)]/20"
                : "border-border/80 bg-card text-muted-foreground hover:text-foreground hover:bg-muted/40"
            )}
            onClick={() => {
              setKind("porous");
              setOpenId("porous");
            }}
          >
            <span>Fully Porous Silica (FPP)</span>
            <span className="text-[11px] text-muted-foreground">· High surface area</span>
          </button>

          <button
            id="bead-core-shell"
            type="button"
            aria-pressed={kind === "shell"}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all cursor-pointer select-none",
              kind === "shell"
                ? "border-[var(--hp-brand)] bg-[var(--hp-soft)] text-foreground font-semibold shadow-2xs ring-1 ring-[var(--hp-brand)]/20"
                : "border-border/80 bg-card text-muted-foreground hover:text-foreground hover:bg-muted/40"
            )}
            onClick={() => {
              setKind("shell");
              setOpenId("shell");
            }}
          >
            <span>Core-Shell Silica (SPP)</span>
            <span className="text-[11px] text-muted-foreground">· High efficiency</span>
          </button>
        </div>

        {/* Hero Bead Drawing Card */}
        <div className="flex flex-col rounded-2xl border border-border/80 bg-card p-4 sm:p-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-heading text-base font-bold text-foreground">Single Bead Cross-Section</h3>
                <button
                  type="button"
                  onClick={() => toggleNote("drawing")}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--hp-brand)] hover:underline cursor-pointer"
                >
                  <Eye className="size-3" />
                  {openId === "drawing" ? "Hide details" : "Inspect bead"}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">Channels indicate internal pore network; perimeter points show bonded ligands vs free silanols.</p>
            </div>
            {/* Live Surface Composition Stats */}
            <div id="bead-counts" className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/30 px-3 py-1.5 text-xs font-mono">
              <span className="flex items-center gap-1.5 font-bold text-[var(--hp-brand)]">
                <span className="size-2.5 rounded-full bg-[var(--hp-brand)]" />
                {surface.ligands} Ligands
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="flex items-center gap-1.5 font-bold text-amber-600 dark:text-amber-400">
                <span className="size-2.5 rounded-full bg-amber-400" />
                {surface.silanols} SiOH
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="font-semibold text-muted-foreground">{carbonLoad}% Coverage</span>
            </div>
          </div>

          {/* SVG Canvas (Non-jumping static container) */}
          <div className="flex items-center justify-center p-3 sm:p-5">
            <BeadDrawing
              kind={kind}
              ligand={ligand}
              ligandAt={surface.ligandAt}
              particleUm={particleUm}
              poreAngstroms={poreAngstroms}
            />
          </div>

          {/* Microstructure Sliders Toolbar (3 Dedicated Cards) */}
          <div id="bead-sliders" className="grid grid-cols-1 gap-3 sm:grid-cols-3 border-t border-border/60 pt-4">
            {/* Carbon load */}
            <div
              className={cn(
                "flex flex-col gap-1.5 rounded-xl border p-3 transition-colors",
                openId === "load"
                  ? "border-[var(--hp-brand)] bg-[var(--hp-soft)]/50 ring-2 ring-[var(--hp-brand)]/20"
                  : "border-border/70 bg-muted/20 hover:border-[var(--hp-brand)]/50"
              )}
            >
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => toggleNote("load")}
                  className="text-xs font-bold text-foreground flex items-center gap-1 text-left cursor-pointer hover:text-[var(--hp-brand)]"
                  title="Click to inspect Carbon Load"
                >
                  Carbon Load
                </button>
                <span className="font-mono text-xs font-bold text-[var(--hp-brand)] bg-card px-2 py-0.5 rounded border border-border/60">
                  {carbonLoad}%
                </span>
              </div>
              <input
                id="bead-carbon-load"
                className="column-slider w-full cursor-ew-resize mt-1"
                type="range"
                min={0}
                max={100}
                step={1}
                value={carbonLoad}
                aria-label="Carbon load"
                aria-valuetext={`${carbonLoad} percent`}
                onChange={(event) => setCarbonLoad(Number(event.target.value))}
              />
              <span className="text-[10px] text-muted-foreground">
                Higher % = denser shielding of acidic silanols
              </span>
            </div>

            {/* Particle size */}
            <div
              className={cn(
                "flex flex-col gap-1.5 rounded-xl border p-3 transition-colors",
                openId === "particle"
                  ? "border-[var(--hp-brand)] bg-[var(--hp-soft)]/50 ring-2 ring-[var(--hp-brand)]/20"
                  : "border-border/70 bg-muted/20 hover:border-[var(--hp-brand)]/50"
              )}
            >
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => toggleNote("particle")}
                  className="text-xs font-bold text-foreground flex items-center gap-1 text-left cursor-pointer hover:text-[var(--hp-brand)]"
                  title="Click to inspect Particle Size"
                >
                  Particle Size (dp)
                </button>
                <span className="font-mono text-xs font-bold text-foreground bg-card px-2 py-0.5 rounded border border-border/60">
                  {formatMicrons(particleUm)} µm
                </span>
              </div>
              <input
                id="bead-particle-size"
                className="column-slider w-full cursor-ew-resize mt-1"
                type="range"
                min={1.5}
                max={10}
                step={0.1}
                value={particleUm}
                aria-label="Particle size"
                aria-valuetext={`${formatMicrons(particleUm)} micrometers`}
                onChange={(event) => setParticleUm(Number(event.target.value))}
              />
              <span className="text-[10px] text-muted-foreground">
                Scales bead diameter: 1.5 µm (UHPLC) → 10 µm (Prep)
              </span>
            </div>

            {/* Pore size */}
            <div
              className={cn(
                "flex flex-col gap-1.5 rounded-xl border p-3 transition-colors",
                openId === "pore"
                  ? "border-[var(--hp-brand)] bg-[var(--hp-soft)]/50 ring-2 ring-[var(--hp-brand)]/20"
                  : "border-border/70 bg-muted/20 hover:border-[var(--hp-brand)]/50"
              )}
            >
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => toggleNote("pore")}
                  className="text-xs font-bold text-foreground flex items-center gap-1 text-left cursor-pointer hover:text-[var(--hp-brand)]"
                  title="Click to inspect Pore Size"
                >
                  Pore Size (Å)
                </button>
                <span className="font-mono text-xs font-bold text-foreground bg-card px-2 py-0.5 rounded border border-border/60">
                  {poreAngstroms} Å
                </span>
              </div>
              <input
                id="bead-pore-size"
                className="column-slider w-full cursor-ew-resize mt-1"
                type="range"
                min={60}
                max={300}
                step={1}
                value={poreAngstroms}
                aria-label="Pore size"
                aria-valuetext={`${poreAngstroms} angstroms`}
                onChange={(event) => setPoreAngstroms(Number(event.target.value))}
              />
              <span className="text-[10px] text-muted-foreground">
                90 Å (Raptor) · 100 Å (Force) · 140 Å (Pinnacle)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Inspector Area (4 Cols) */}
      <aside
        id="bead-note"
        className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-card p-4 sm:p-5 shadow-xs lg:sticky lg:top-4 lg:col-span-4 min-h-[460px]"
      >
        {/* Stationary Phase Ligand Card (Independent, hover-safe) */}
        <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-muted/20 p-3.5 dark:bg-muted/10">
          <div className="flex items-center justify-between">
            <label htmlFor="bead-ligand" className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <FlaskConical className="size-3.5 text-[var(--hp-brand)]" />
              Bonded Ligand Phase
            </label>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => toggleNote("ligand")}
                className="text-[11px] font-semibold text-[var(--hp-brand)] hover:underline cursor-pointer"
                title="Inspect ligand retention chemistry"
              >
                {openId === "ligand" ? "Hide note" : "Inspect"}
              </button>
            </div>
          </div>

          <ChoiceSelect
            id="bead-ligand"
            className="h-8 text-xs font-semibold"
            value={availableLigands.includes(ligand) ? ligand : availableLigands[0]}
            placeholder="Select a ligand phase"
            options={availableLigands.map((name) => ({ value: name, label: name }))}
            onChange={setLigand}
          />

          <div className="flex flex-col gap-2.5 pt-1">
            <p className="text-xs leading-relaxed text-muted-foreground">{currentSentence}</p>

            {/* Ligand Chemical Structure Display */}
            {currentPicture ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-border/70 bg-background/80 p-3 shadow-2xs backdrop-blur-xs">
                <div className="relative flex w-full items-center justify-center py-1">
                  <img
                    src={currentPicture}
                    alt={`${ligand} chemical structure`}
                    className="max-h-28 w-auto object-contain filter drop-shadow-xs transition-transform duration-200 hover:scale-105"
                  />
                </div>
                {/* Mechanism badges */}
                <div className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5 border-t border-border/50 pt-2 w-full">
                  {currentBadges.map((badge, idx) => (
                    <span
                      key={idx}
                      className="rounded-md border border-[var(--hp-brand)]/30 bg-[var(--hp-brand)]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--hp-brand)]"
                    >
                      {badge}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Parameter Details or Guide */}
        {open ? (
          <div className="flex flex-col gap-3 border-t border-border/60 pt-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Parameter Details
              </span>
              <button
                type="button"
                onClick={() => setOpenId(null)}
                className="flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
                title="Close inspector note"
                aria-label="Close inspector note"
              >
                <X className="size-3.5" />
              </button>
            </div>
            <div id={openId === "load" ? "carbon-load-note" : undefined}>
              <FunctionNoteView title={open.label} note={open.note} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 border-t border-border/60 pt-3 text-xs leading-relaxed text-muted-foreground">
            <p>
              <strong className="text-foreground">Residual Silanols (SiOH):</strong> Unshielded surface silanols act as weak cation exchangers, causing peak tailing for basic analytes. Dense carbon bonding and endcapping shield these sites.
            </p>
            <p>
              <strong className="text-foreground">Core-Shell Particles:</strong> A solid core with a thin porous crust shortens intraparticle diffusion paths, yielding sharper peaks at higher flow rates.
            </p>
          </div>
        )}
      </aside>
    </section>
  );
}
