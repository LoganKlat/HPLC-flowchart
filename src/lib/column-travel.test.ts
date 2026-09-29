import { describe, expect, it } from "vitest";
import {
  BEAD_R,
  BEAD_X,
  COMPOUNDS,
  TRAVEL_SPEED,
  holdTotal,
  initialTravelers,
  stepTravelers,
} from "@/lib/column-travel";

describe("column travel", () => {
  it("packs more beads, and each compound is held clearly longer than the one before", () => {
    expect(BEAD_X.length).toBeGreaterThan(12);
    for (let index = 1; index < BEAD_X.length; index++) {
      expect(BEAD_X[index]! - BEAD_X[index - 1]!).toBeGreaterThan(BEAD_R * 2);
    }
    const totals = COMPOUNDS.map((compound) => holdTotal(compound.stops));
    expect(totals[0]).toBe(0);
    expect(COMPOUNDS[0]?.label).toBe("Uracil");
    for (let index = 1; index < totals.length; index++) {
      expect(totals[index]! - (totals[index - 1] ?? 0)).toBeGreaterThanOrEqual(2);
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
