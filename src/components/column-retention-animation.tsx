"use client";

import { useEffect, useState } from "react";
import {
  BEAD_X,
  COMPOUNDS,
  OUTLET_X,
  initialTravelers,
  stepTravelers,
  type Traveler,
} from "@/lib/column-travel";

const colors = ["#c9841a", "#2f6fdb", "#0e8a7d", "#7c3aed", "#d4522a"] as const;
const laneOffset = [-16, -8, 0, 8, 16];

const description =
  "The compounds travel with the mobile phase at the same speed. They separate because some spend longer stopped on the stationary phase, which is the surface of the beads. Uracil does not stick, so it comes out first. That time is t0. A compound that pauses longer comes out later. Retention, k, is that extra time compared with t0.";

export function ColumnRetentionAnimation() {
  const [replay, setReplay] = useState(0);
  const [travelers, setTravelers] = useState<Traveler[]>(() => initialTravelers());

  useEffect(() => {
    let frame = initialTravelers();
    let doneFor = 0;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      let next = stepTravelers(frame, dt);
      if (next.every((traveler) => traveler.done)) {
        doneFor += dt;
        if (doneFor > 1.6) {
          next = initialTravelers();
          doneFor = 0;
        }
      } else {
        doneFor = 0;
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
    <section id="column-animation" className="flex flex-col gap-4">
      <header>
        <p className="text-xs tracking-[0.16em] text-[#0f6b56] uppercase">Retention</p>
        <h2 className="mt-1 font-heading text-2xl text-[#144237]">Same speed, longer stops</h2>
        <p className="mt-2 max-w-2xl text-base text-muted-foreground">{description}</p>
      </header>
      <div className="rounded-xl bg-card px-3 py-3 ring-1 ring-foreground/10 sm:px-4">
        <svg
          id="column-animation-drawing"
          viewBox="0 0 680 188"
          className="block h-auto w-full"
          role="img"
          aria-label="Compounds moving through a column of beads. Uracil does not stop."
        >
          <text x="48" y="22" fill="#6b6456" fontSize="13" className="font-sans">
            Inlet
          </text>
          <text x="600" y="22" fill="#6b6456" fontSize="13" className="font-sans">
            Outlet
          </text>
          <rect x="28" y="40" width="624" height="108" rx="54" fill="#f4fbf8" stroke="#0f6b56" strokeWidth="3" />
          <rect x="28" y="58" width="22" height="72" rx="6" fill="#8e9893" stroke="#144237" strokeWidth="1.5" />
          <rect x="630" y="58" width="22" height="72" rx="6" fill="#8e9893" stroke="#144237" strokeWidth="1.5" />
          {BEAD_X.map((x) => {
            const sitting = travelers.find((traveler) => traveler.stopped && traveler.x === x);
            const color = sitting ? colors[COMPOUNDS.findIndex((compound) => compound.id === sitting.id)] : "#0f6b56";
            return (
              <circle
                key={x}
                cx={x}
                cy="94"
                r="22"
                fill="#e7f3ee"
                stroke={color}
                strokeWidth={sitting ? 3.5 : 1.5}
              />
            );
          })}
          {travelers.map((traveler, index) => {
            const y = traveler.stopped ? 78 : 94 + (laneOffset[index] ?? 0);
            const elapsed = traveler.done && traveler.x >= OUTLET_X;
            return (
              <g
                key={traveler.id}
                data-compound={traveler.id}
                data-x={traveler.x.toFixed(1)}
                data-stopped={traveler.stopped ? "true" : "false"}
                transform={`translate(${traveler.x.toFixed(1)} ${y})`}
              >
                <circle r="8" fill={colors[index]} stroke="#ffffff" strokeWidth="2" opacity={elapsed ? 0.45 : 1} />
              </g>
            );
          })}
        </svg>
        <button
          type="button"
          className="mt-2 h-10 rounded-md border border-solid border-border bg-background px-4 text-sm text-foreground"
          onClick={() => setReplay((count) => count + 1)}
        >
          Replay
        </button>
      </div>
      <ul id="column-animation-legend" className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-5 sm:gap-y-2">
        {COMPOUNDS.map((compound, index) => (
          <li key={compound.id} className="flex items-center gap-2 text-sm">
            <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: colors[index] }} />
            <span>
              <span className="font-medium">{compound.label}.</span> {compound.note}.
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
