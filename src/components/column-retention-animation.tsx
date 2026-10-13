"use client";

import { useEffect, useState } from "react";
import { RotateCcw, Play, Gauge, Activity, Clock, Compass, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  BEAD_R,
  BEAD_X,
  COMPOUNDS,
  OUTLET_X,
  initialTravelers,
  stepTravelers,
  type Traveler,
} from "@/lib/column-travel";
import { cn } from "@/lib/utils";

const colors = ["var(--hp-amber-2)", "var(--hp-blue-2)", "var(--hp-teal)", "var(--hp-violet)", "var(--hp-red-2)"] as const;
const laneOffset = [-16, -8, 0, 8, 16];

const retentionPrinciples = [
  {
    title: "Mobile vs Stationary Phase",
    icon: Layers,
    description:
      "A compound travels only while dissolved in the flowing mobile phase. It halts whenever it partitions into the bonded stationary phase on the silica bead surfaces. All molecules move at identical velocity while in the fluid stream.",
  },
  {
    title: "Chemical Partitioning",
    icon: Compass,
    description:
      "Retention arises from molecular polarity and hydrophobicity. Non-polar, lipophilic analytes partition strongly into non-polar C18 alkyl chains, spending more time adsorbed. Polar molecules remain preferentially in water-rich solvent.",
  },
  {
    title: "Dead Time (t₀) Void Marker",
    icon: Clock,
    description:
      "Uracil is small and highly polar with near-zero affinity for reversed-phase C18. It flows unobstructed at mobile phase velocity. The time required for uracil to reach the detector establishes the column dead time t₀.",
  },
  {
    title: "Retention Factor (k)",
    icon: Gauge,
    description:
      "Defined as k = (tR − t₀) / t₀. The retention factor measures the additional time an analyte spends retained on the stationary phase relative to the unretained void time. Optimal method development targets k between 1 and 10.",
  },
];

export function ColumnRetentionAnimation() {
  const [replay, setReplay] = useState(0);
  const [travelers, setTravelers] = useState<Traveler[]>(() => initialTravelers());
  const [isFinished, setIsFinished] = useState(false);

  useEffect(() => {
    let frame = initialTravelers();
    let doneFor = 0;
    let last = performance.now();
    let raf = 0;
    setIsFinished(false);

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      let next = stepTravelers(frame, dt);
      if (next.every((traveler) => traveler.done)) {
        setIsFinished(true);
        doneFor += dt;
        if (doneFor > 3.5) {
          next = initialTravelers();
          doneFor = 0;
          setIsFinished(false);
        }
      } else {
        doneFor = 0;
        setIsFinished(false);
      }
      frame = next;
      setTravelers(next);
      raf = requestAnimationFrame(tick);
    };

    setTravelers(frame);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [replay]);

  return (
    <section id="column-animation" className="flex flex-col gap-5 rounded-2xl border border-border/80 bg-card p-4 sm:p-6 shadow-xs">
      {/* Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--hp-brand)]/30 bg-[var(--hp-brand)]/10 px-2.5 py-0.5 text-xs font-semibold tracking-wider text-[var(--hp-brand)] uppercase">
            <Activity className="size-3.5" />
            Retention Mechanism Simulation
          </span>
          <h2 className="mt-1.5 font-heading text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            Why Compounds Separate Along the Column
          </h2>
          <p className="mt-1 max-w-3xl text-xs text-muted-foreground sm:text-sm">
            Watch individual compound bands migrate through the packed bead bed. Analytes partition between the flowing mobile phase
            and stationary phase silica beads according to chemical affinity.
          </p>
        </div>
        <div className="mt-2 shrink-0 sm:mt-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 px-3 text-xs font-semibold cursor-pointer active:scale-95 transition-all"
            onClick={() => setReplay((count) => count + 1)}
          >
            <RotateCcw className="size-3.5" />
            Replay Migration
          </Button>
        </div>
      </div>

      {/* Main Simulation Stage */}
      <div className="relative overflow-hidden rounded-xl border border-border/70 bg-muted/20 p-3 sm:p-5 dark:bg-muted/10">
        <svg
          id="column-animation-drawing"
          viewBox="0 0 680 188"
          className="block h-auto w-full"
          role="img"
          aria-label="Compounds moving through a column of beads. Uracil does not stop."
        >
          {/* Inlet & Outlet Labels */}
          <text x="48" y="24" fill="var(--hp-brand)" fontSize="12" fontWeight="700" className="font-sans uppercase tracking-wider">
            Column Inlet →
          </text>
          <text x="560" y="24" fill="var(--hp-brand)" fontSize="12" fontWeight="700" className="font-sans uppercase tracking-wider">
            → Detector Outlet
          </text>

          {/* Tube outline */}
          <rect x="28" y="40" width="624" height="108" rx="54" fill="var(--hp-surface)" stroke="var(--hp-brand)" strokeWidth="2.5" />
          <rect x="28" y="58" width="22" height="72" rx="6" fill="var(--hp-grey-2)" stroke="var(--hp-ink)" strokeWidth="1.5" />
          <rect x="630" y="58" width="22" height="72" rx="6" fill="var(--hp-grey-2)" stroke="var(--hp-ink)" strokeWidth="1.5" />

          {/* Packed Stationary Phase Beads */}
          {BEAD_X.map((x) => {
            const sitting = travelers.find((traveler) => traveler.stopped && traveler.x === x);
            const color = sitting ? colors[COMPOUNDS.findIndex((compound) => compound.id === sitting.id)] : "var(--hp-brand)";
            return (
              <circle
                key={x}
                data-bead=""
                cx={x}
                cy="94"
                r={BEAD_R}
                fill="var(--hp-soft)"
                stroke={color}
                strokeWidth={sitting ? 3 : 1.5}
                className="transition-all duration-150"
              />
            );
          })}

          {/* Migrating Solute Packets */}
          {travelers.map((traveler, index) => {
            const y = traveler.stopped ? 94 - BEAD_R * 0.65 : 94 + (laneOffset[index] ?? 0);
            const elapsed = traveler.done && traveler.x >= OUTLET_X;
            return (
              <g
                key={traveler.id}
                data-compound={traveler.id}
                data-x={traveler.x.toFixed(1)}
                data-stopped={traveler.stopped ? "true" : "false"}
                transform={`translate(${traveler.x.toFixed(1)} ${y})`}
              >
                <circle
                  r={traveler.stopped ? "9.5" : "8"}
                  fill={colors[index]}
                  stroke="var(--hp-paper)"
                  strokeWidth="2"
                  opacity={elapsed ? 0.45 : 1}
                  className="transition-all duration-100"
                />
              </g>
            );
          })}
        </svg>

        {/* Compound Legend Ribbon */}
        <div id="column-animation-legend" className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
          <div className="flex flex-wrap items-center gap-2 sm:gap-4">
            {COMPOUNDS.map((compound, index) => (
              <div
                key={compound.id}
                className="flex items-center gap-2 rounded-lg border border-border/60 bg-card px-2.5 py-1 text-xs shadow-2xs"
              >
                <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: colors[index] }} />
                <span className="font-semibold text-foreground">{compound.label}</span>
                <span className="text-[11px] text-muted-foreground">{compound.note}</span>
              </div>
            ))}
          </div>
          <span className="text-[11px] font-medium text-muted-foreground italic">
            {isFinished ? "Elution complete · Restarting..." : "Simulating partition equilibria"}
          </span>
        </div>
      </div>

      {/* 4 Informative Principles Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {retentionPrinciples.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.title}
              className="flex flex-col gap-2 rounded-xl border border-border/70 bg-card p-3.5 transition-colors hover:border-[var(--hp-brand)]/40 hover:bg-[var(--hp-soft)]/20"
            >
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-lg bg-[var(--hp-brand)]/10 text-[var(--hp-brand)]">
                  <Icon className="size-4" />
                </span>
                <h3 className="font-heading text-xs font-bold text-foreground sm:text-sm">{item.title}</h3>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">{item.description}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
