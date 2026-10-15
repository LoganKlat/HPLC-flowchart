"use client";

import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
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

const colors = ["var(--hp-amber-2)", "var(--hp-blue-2)", "var(--hp-teal)", "var(--hp-violet)", "var(--hp-red-2)"] as const;
const laneOffset = [-16, -8, 0, 8, 16];

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
          <h2 className="font-heading text-lg font-bold tracking-tight text-foreground sm:text-xl">
            Analyte Migration & Separation
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Analytes partition between the mobile phase and stationary phase beads according to chemical affinity.
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

      {/* Summary Notes */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 rounded-xl border border-border/70 bg-card p-3.5 text-xs leading-relaxed text-muted-foreground">
        <div>
          <p className="font-semibold text-foreground mb-0.5">Partition Equilibria</p>
          <p>
            Molecules travel while dissolved in the flowing mobile phase. Lipophilic analytes partition more frequently into stationary phase ligands, eluting later than polar molecules.
          </p>
        </div>
        <div>
          <p className="font-semibold text-foreground mb-0.5">Dead Time (t₀) & Retention Factor (k)</p>
          <p>
            Unretained compounds (e.g. Uracil) travel at solvent velocity, establishing column dead time t₀. Retention factor k = (tR − t₀) / t₀ measures retention relative to t₀.
          </p>
        </div>
      </div>
    </section>
  );
}
