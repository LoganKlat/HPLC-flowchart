import { describe, expect, it } from "vitest";
import {
  BEAD_R,
  BEAD_X,
  COMPOUNDS,
  STOP_HOLD,
  TRAVEL_SPEED,
  holdTotal,
  initialTravelers,
  stepTravelers,
} from "@/lib/column-travel";

describe("column travel", () => {
  it("packs more beads, and a more retained compound stops more often for a brief moment", () => {
    expect(BEAD_X.length).toBeGreaterThan(12);
    for (let index = 1; index < BEAD_X.length; index++) {
      expect(BEAD_X[index]! - BEAD_X[index - 1]!).toBeGreaterThan(BEAD_R * 2);
    }
    expect(COMPOUNDS[0]?.label).toBe("Uracil");
    expect(COMPOUNDS[0]?.stops).toHaveLength(0);
    expect(holdTotal(COMPOUNDS[0]!.stops)).toBe(0);
    expect(STOP_HOLD).toBeGreaterThanOrEqual(0.2);
    expect(STOP_HOLD).toBeLessThanOrEqual(0.4);
    const counts = COMPOUNDS.map((compound) => compound.stops.length);
    for (let index = 1; index < counts.length; index++) {
      expect(counts[index]!).toBeGreaterThan(counts[index - 1]!);
    }
    for (const compound of COMPOUNDS) {
      for (const stop of compound.stops) {
        expect(stop.hold).toBeGreaterThanOrEqual(0.2);
        expect(stop.hold).toBeLessThan(1);
      }
    }
    const totals = COMPOUNDS.map((compound) => holdTotal(compound.stops));
    for (let index = 1; index < totals.length; index++) {
      expect(totals[index]!).toBeGreaterThan(totals[index - 1]!);
    }
  });

  it("moves every compound at the same speed until one stops", () => {
    const started = initialTravelers();
    const moved = stepTravelers(started, 0.2);
    const expected = started[0]!.x + TRAVEL_SPEED * 0.2;
    for (const traveler of moved) {
      expect(traveler.x).toBeCloseTo(expected, 6);
      expect(traveler.stopped).toBe(false);
    }
  });

  it("parks a retained compound on a bead, then lets it go at the shared speed", () => {
    const plans = COMPOUNDS;
    let travelers = initialTravelers(plans);
    const uracilIndex = 0;
    const heldIndex = plans.findIndex((compound) => compound.id === "c5");
    const stopAt = BEAD_X[plans[heldIndex]!.stops[0]!.bead]!;
    const approach = (stopAt - travelers[0]!.x) / TRAVEL_SPEED;
    travelers = stepTravelers(travelers, approach + 0.01, plans);
    const held = travelers[heldIndex]!;
    const uracil = travelers[uracilIndex]!;
    expect(held.stopped).toBe(true);
    expect(held.x).toBe(stopAt);
    expect(uracil.stopped).toBe(false);
    expect(uracil.x).toBeGreaterThan(held.x);

    const during = stepTravelers(travelers, 0.2, plans);
    expect(during[heldIndex]!.x).toBe(stopAt);
    expect(during[uracilIndex]!.x).toBeCloseTo(uracil.x + TRAVEL_SPEED * 0.2, 5);

    const release = held.holdLeft + 0.05;
    const after = stepTravelers(travelers, release, plans);
    expect(after[heldIndex]!.stopped).toBe(false);
    expect(after[heldIndex]!.x).toBeCloseTo(stopAt + TRAVEL_SPEED * 0.05, 5);
  });
});
