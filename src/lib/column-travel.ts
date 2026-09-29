export const TRAVEL_SPEED = 100;
export const INLET_X = 64;
export const OUTLET_X = 640;
export const BEAD_R = 15;
export const BEAD_X = Array.from({ length: 16 }, (_, index) => 88 + index * 34);

export type Stop = { bead: number; hold: number };

export type CompoundPlan = {
  id: string;
  label: string;
  note: string;
  stops: readonly Stop[];
};

export const COMPOUNDS: readonly CompoundPlan[] = [
  { id: "uracil", label: "Uracil", note: "Not retained", stops: [] },
  { id: "c2", label: "Compound 2", note: "Held a little", stops: [{ bead: 11, hold: 2 }] },
  {
    id: "c3",
    label: "Compound 3",
    note: "Held longer",
    stops: [
      { bead: 8, hold: 2.5 },
      { bead: 13, hold: 2.5 },
    ],
  },
  {
    id: "c4",
    label: "Compound 4",
    note: "Held longer still",
    stops: [
      { bead: 5, hold: 3 },
      { bead: 10, hold: 3 },
      { bead: 14, hold: 3 },
    ],
  },
  {
    id: "c5",
    label: "Compound 5",
    note: "Held the longest",
    stops: [
      { bead: 2, hold: 3.5 },
      { bead: 6, hold: 3.5 },
      { bead: 9, hold: 3.5 },
      { bead: 15, hold: 3.5 },
    ],
  },
];

export type Traveler = {
  id: string;
  x: number;
  stopIndex: number;
  holdLeft: number;
  stopped: boolean;
  done: boolean;
};

export function holdTotal(stops: readonly Stop[]) {
  return stops.reduce((sum, stop) => sum + stop.hold, 0);
}

export function initialTravelers(plans: readonly CompoundPlan[] = COMPOUNDS): Traveler[] {
  return plans.map((plan) => ({
    id: plan.id,
    x: INLET_X,
    stopIndex: 0,
    holdLeft: 0,
    stopped: false,
    done: false,
  }));
}

function stepOne(traveler: Traveler, stops: readonly Stop[], dt: number): Traveler {
  if (traveler.done || dt <= 0) return traveler;
  let holdLeft = traveler.holdLeft;
  let stopIndex = traveler.stopIndex;
  let x = traveler.x;
  let movingTime = dt;

  if (holdLeft > 0) {
    if (movingTime < holdLeft) {
      return { ...traveler, holdLeft: holdLeft - movingTime, stopped: true };
    }
    movingTime -= holdLeft;
    holdLeft = 0;
  }

  x += TRAVEL_SPEED * movingTime;
  const next = stops[stopIndex];
  const stopAt = next ? BEAD_X[next.bead] : undefined;
  if (next && stopAt != null && x >= stopAt) {
    return {
      ...traveler,
      x: stopAt,
      stopIndex: stopIndex + 1,
      holdLeft: next.hold,
      stopped: true,
      done: false,
    };
  }
  if (x >= OUTLET_X) {
    return { ...traveler, x: OUTLET_X, holdLeft: 0, stopped: false, done: true, stopIndex };
  }
  return { ...traveler, x, holdLeft: 0, stopped: false, stopIndex };
}

export function stepTravelers(
  travelers: readonly Traveler[],
  dt: number,
  plans: readonly CompoundPlan[] = COMPOUNDS,
): Traveler[] {
  return travelers.map((traveler, index) => stepOne(traveler, plans[index]?.stops ?? [], dt));
}
