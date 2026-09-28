"use client";

import { useState, type CSSProperties } from "react";
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

function box(x: number, y: number, w: number, h: number, imgW: number, imgH: number, pad = 10): Box {
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
    width: 1094,
    height: 508,
    parts: [
      { id: "solvents", label: "Solvents", body: solvents, box: box(408, 48, 180, 118, 1094, 508) },
      { id: "degasser", label: "Degasser", body: degasser, box: box(408, 166, 180, 64, 1094, 508) },
      { id: "uv", label: "UV detector", body: uvDetector, box: box(408, 228, 185, 100, 1094, 508) },
      {
        id: "pump",
        label: "Pump with quaternary valve",
        body: pumpQuaternary,
        box: box(408, 330, 180, 110, 1094, 508),
      },
      {
        id: "controller",
        label: "Controller or fluorescence detector",
        body: controller,
        box: box(592, 158, 175, 100, 1094, 508),
      },
      {
        id: "oven",
        label: "Oven and column",
        body: ovenAndColumn,
        box: box(592, 290, 180, 85, 1094, 508),
      },
      {
        id: "injector",
        label: "Manual injector",
        body: manualInjector,
        box: box(592, 370, 180, 70, 1094, 508),
      },
    ],
  },
  {
    id: "hplc-3",
    label: "HPLC 3",
    src: "/equipment/hplc-3.png",
    width: 1264,
    height: 660,
    parts: [
      { id: "solvents", label: "Solvents", body: solvents, box: box(440, 20, 190, 120, 1264, 660) },
      { id: "degasser", label: "Degasser", body: degasser, box: box(440, 140, 190, 50, 1264, 660) },
      { id: "pump-1", label: "Pump 1", body: pumps12, box: box(440, 185, 190, 95, 1264, 660) },
      { id: "pump-2", label: "Pump 2", body: pumps12, box: box(440, 278, 190, 95, 1264, 660) },
      {
        id: "controller",
        label: "Controller or fluorescence detector",
        body: controller,
        box: box(640, 185, 185, 95, 1264, 660),
      },
      {
        id: "detector",
        label: "UV or PDA detector",
        body: uvOrPda,
        box: box(640, 280, 185, 95, 1264, 660),
      },
      {
        id: "oven",
        label: "Oven and column",
        body: ovenAndColumn,
        box: box(640, 455, 185, 195, 1264, 660),
      },
      { id: "autosampler", label: "Autosampler", body: autosampler, box: box(440, 375, 190, 270, 1264, 660) },
    ],
  },
  {
    id: "hplc-6",
    label: "HPLC 6",
    src: "/equipment/hplc-6.png",
    width: 1228,
    height: 582,
    parts: [
      { id: "solvents", label: "Solvents", body: solvents, box: box(435, 35, 190, 125, 1228, 582) },
      { id: "degasser", label: "Degasser", body: degasser, box: box(435, 155, 190, 55, 1228, 582) },
      {
        id: "pump",
        label: "Pump with quaternary valve",
        body: pumpQuaternary,
        box: box(435, 205, 190, 180, 1228, 582),
      },
      {
        id: "controller",
        label: "Controller or fluorescence detector",
        body: controller,
        box: box(635, 110, 185, 95, 1228, 582),
      },
      {
        id: "detector",
        label: "UV or PDA detector",
        body: uvOrPda,
        box: box(635, 200, 185, 140, 1228, 582),
      },
      {
        id: "oven",
        label: "Oven and column",
        body: ovenAndColumn,
        box: box(635, 375, 185, 195, 1228, 582),
      },
      { id: "autosampler", label: "Autosampler", body: autosampler, box: box(435, 400, 190, 170, 1228, 582) },
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

export function EquipmentPanel({ onOpenNav }: { onOpenNav: () => void }) {
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
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-w-0 flex-col gap-5">
      <header>
        <p className="text-xs tracking-[0.16em] text-[#0f6b56] uppercase">Lab setups</p>
        <h1 className="mt-1 font-heading text-3xl text-foreground sm:text-4xl">Equipment</h1>
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
            alt={`Diagram of ${setup.label}`}
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
    </div>
  );
}
