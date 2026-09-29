"use client";

import { useState, type CSSProperties } from "react";
import { BeadDiagram } from "@/components/bead-diagram";
import { ColumnDiagram } from "@/components/column-diagram";
import { Button } from "@/components/ui/button";

type Box = { left: number; top: number; width: number; height: number };

type Part = {
  id: string;
  label: string;
  body: string;
  box: Box;
};

type Setup = {
  id: string;
  label: string;
  src: string;
  width: number;
  height: number;
  parts: Part[];
};

const solvents =
  "Bottles of the liquids that carry the sample. One is usually water, sometimes with a set pH. The other is the organic solvent, such as acetonitrile or methanol. The mix is the %B.";
const degasser =
  "Takes dissolved air out of the solvents before the pump. Bubbles would upset the flow and the detector. There is no setting to type.";
const pumpQuaternary =
  "Pushes the liquid at a flow rate in mL/min. The valve can blend up to four solvents. That blend is the %B.";
const pumps12 =
  "Two pumps. Each pushes its own solvent, and they mix after the pumps. Together they set the flow rate and the %B.";
const uvDetector =
  "Shines UV light through the liquid leaving the column. The chromatogram is how much light the sample absorbs, over time. The setting is the wavelength, in nm.";
const uvOrPda =
  "A UV detector reads one wavelength. A PDA reads many wavelengths at once, so a spectrum can be kept. The setting is the wavelength, in nm.";
const ovenAndColumn =
  "The column is where the peaks separate. Its ligand (such as C18 or C18aq), length, diameter, and particle size are part of the column. The oven holds that column at the temperature you set, in °C. Temperature changes how long the peaks take and how well they separate.";
const manualInjector =
  "The sample is loaded by hand with a syringe. The amount loaded is the injection volume.";
const autosampler = "Injects the sample from a vial. The setting is the injection volume.";
const controller = "Not used in this class.";

function box(x: number, y: number, w: number, h: number, imgW: number, imgH: number, pad = 2): Box {
  const left = Math.max(0, x - pad);
  const top = Math.max(0, y - pad);
  const right = Math.min(imgW, x + w + pad);
  const bottom = Math.min(imgH, y + h + pad);
  return {
    left: (left / imgW) * 100,
    top: (top / imgH) * 100,
    width: ((right - left) / imgW) * 100,
    height: ((bottom - top) / imgH) * 100,
  };
}

const setups: Setup[] = [
  {
    id: "hplc-1-2-5",
    label: "HPLC 1, 2, and 5",
    src: "/equipment/hplc-1-2-5.png",
    width: 387,
    height: 422,
    parts: [
      { id: "solvents", label: "Solvents", body: solvents, box: box(21, 20, 171, 111, 387, 422) },
      { id: "degasser", label: "Degasser", body: degasser, box: box(29, 141, 161, 47, 387, 422) },
      { id: "uv", label: "UV detector", body: uvDetector, box: box(30, 201, 162, 89, 387, 422) },
      {
        id: "pump",
        label: "Pump with quaternary valve",
        body: pumpQuaternary,
        box: box(20, 307, 169, 93, 387, 422),
      },
      {
        id: "controller",
        label: "Controller or fluorescence detector",
        body: controller,
        box: box(205, 127, 162, 92, 387, 422),
      },
      {
        id: "oven",
        label: "Oven and column",
        body: ovenAndColumn,
        box: box(205, 219, 162, 118, 387, 422),
      },
      {
        id: "injector",
        label: "Manual injector",
        body: manualInjector,
        box: box(205, 337, 162, 65, 387, 422),
      },
    ],
  },
  {
    id: "hplc-3",
    label: "HPLC 3",
    src: "/equipment/hplc-3.png",
    width: 399,
    height: 655,
    parts: [
      { id: "solvents", label: "Solvents", body: solvents, box: box(20, 20, 164, 114, 399, 655) },
      { id: "degasser", label: "Degasser", body: degasser, box: box(20, 134, 164, 49, 399, 655) },
      { id: "pump-1", label: "Pump 1", body: pumps12, box: box(23, 183, 158, 89, 399, 655) },
      { id: "pump-2", label: "Pump 2", body: pumps12, box: box(23, 277, 158, 89, 399, 655) },
      {
        id: "controller",
        label: "Controller or fluorescence detector",
        body: controller,
        box: box(221, 187, 158, 87, 399, 655),
      },
      {
        id: "detector",
        label: "UV or PDA detector",
        body: uvOrPda,
        box: box(221, 277, 158, 93, 399, 655),
      },
      {
        id: "oven",
        label: "Oven and column",
        body: ovenAndColumn,
        box: box(221, 370, 158, 269, 399, 655),
      },
      { id: "autosampler", label: "Autosampler", body: autosampler, box: box(23, 369, 163, 270, 399, 655) },
    ],
  },
  {
    id: "hplc-6",
    label: "HPLC 6",
    src: "/equipment/hplc-6.png",
    width: 400,
    height: 565,
    parts: [
      { id: "solvents", label: "Solvents", body: solvents, box: box(21, 20, 164, 116, 400, 565) },
      { id: "degasser", label: "Degasser", body: degasser, box: box(21, 137, 164, 47, 400, 565) },
      {
        id: "pump",
        label: "Pump with quaternary valve",
        body: pumpQuaternary,
        box: box(20, 184, 168, 90, 400, 565),
      },
      {
        id: "controller",
        label: "Controller or fluorescence detector",
        body: controller,
        box: box(222, 93, 158, 88, 400, 565),
      },
      {
        id: "detector",
        label: "UV or PDA detector",
        body: uvOrPda,
        box: box(222, 183, 158, 93, 400, 565),
      },
      {
        id: "oven",
        label: "Oven and column",
        body: ovenAndColumn,
        box: box(222, 276, 158, 268, 400, 565),
      },
      { id: "autosampler", label: "Autosampler", body: autosampler, box: box(24, 275, 164, 271, 400, 565) },
    ],
  },
];

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

const equipmentTabs = [
  { id: "hplc", label: "HPLC" },
  { id: "column", label: "Column" },
  { id: "beads", label: "Beads" },
] as const;

export function EquipmentPanel({ onOpenNav }: { onOpenNav: () => void }) {
  const [view, setView] = useState<(typeof equipmentTabs)[number]["id"]>("hplc");
  const [hoveredView, setHoveredView] = useState<string | null>(null);
  const [setupId, setSetupId] = useState(setups[0].id);
  const [hoveredChoice, setHoveredChoice] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const setup = setups.find((item) => item.id === setupId) ?? setups[0];
  const open = setup.parts.find((part) => part.id === openId) ?? null;

  return (
    <div id="equipment" className="flex flex-col gap-5">
      <div className="md:hidden">
        <Button type="button" variant="outline" className="h-10 px-3" onClick={onOpenNav}>
          Sections
        </Button>
      </div>
      <header>
        <p className="text-xs tracking-[0.16em] text-[#0f6b56] uppercase">Lab setups</p>
        <h1 className="mt-1 font-heading text-3xl text-foreground sm:text-4xl">Equipment</h1>
      </header>
      <div id="equipment-tabs" className="flex flex-wrap gap-2">
        {equipmentTabs.map((tab) => {
          const selected = tab.id === view;
          return (
            <button
              key={tab.id}
              type="button"
              aria-pressed={selected}
              className="h-10 rounded-md border border-solid px-4 text-sm transition-none"
              style={choiceStyle(selected, hoveredView === tab.id)}
              onMouseEnter={() => setHoveredView(tab.id)}
              onMouseLeave={() => setHoveredView((current) => (current === tab.id ? null : current))}
              onClick={() => setView(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {view === "column" ? <ColumnDiagram /> : null}
      {view === "beads" ? <BeadDiagram /> : null}
      {view === "hplc" ? (
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex min-w-0 flex-col gap-5">
      <header>
        <p className="mt-2 max-w-2xl text-base text-muted-foreground">
          Pick the HPLC in the lab. Hover or tap a part to see what it does and which setting it
          controls.
        </p>
      </header>
      <div id="equipment-choices" className="flex flex-wrap gap-2">
        {setups.map((item) => {
          const selected = item.id === setup.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={selected}
              className="h-10 rounded-md border border-solid px-4 text-sm transition-none"
              style={choiceStyle(selected, hoveredChoice === item.id)}
              onMouseEnter={() => setHoveredChoice(item.id)}
              onMouseLeave={() => setHoveredChoice((current) => (current === item.id ? null : current))}
              onClick={() => {
                setSetupId(item.id);
                setOpenId(null);
                setPinnedId(null);
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <figure className="rounded-xl bg-card ring-1 ring-foreground/10">
        <div className="relative">
          <img
            src={setup.src}
            alt=""
            width={setup.width}
            height={setup.height}
            className="block h-auto w-full"
          />
          {setup.parts.map((part) => {
            const active = open?.id === part.id;
            return (
              <button
                key={part.id}
                type="button"
                aria-label={part.label}
                aria-expanded={active}
                className="absolute rounded-sm transition-none"
                style={{
                  left: `${part.box.left}%`,
                  top: `${part.box.top}%`,
                  width: `${part.box.width}%`,
                  height: `${part.box.height}%`,
                  backgroundColor: active ? "rgba(207, 232, 223, 0.55)" : "transparent",
                  outline: active ? "2px solid #0f6b56" : "2px solid transparent",
                }}
                onMouseEnter={() => setOpenId(part.id)}
                onMouseLeave={() =>
                  setOpenId((current) => (current === part.id && pinnedId !== part.id ? null : current))
                }
                onClick={() => {
                  setPinnedId((current) => {
                    const next = current === part.id ? null : part.id;
                    setOpenId(next);
                    return next;
                  });
                }}
              />
            );
          })}
        </div>
      </figure>
      </div>
      <aside
        id="equipment-note"
        className="rounded-xl bg-card px-4 py-4 text-sm leading-relaxed text-foreground ring-1 ring-foreground/10 lg:sticky lg:top-4"
      >
        {open ? (
          <>
            <p className="font-medium">{open.label}</p>
            <p className="mt-1">{open.body}</p>
          </>
        ) : (
          <p className="text-muted-foreground">Hover or tap a part of the instrument.</p>
        )}
      </aside>
      </div>
      ) : null}
    </div>
  );
}
