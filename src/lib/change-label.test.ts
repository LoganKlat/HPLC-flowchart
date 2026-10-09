import { describe, expect, it } from "vitest";
import { NO_CHANGE_YET, retentionChangeLabel, selectivityChangeLabel } from "@/lib/change-label";
import type { RetentionDecision } from "@/lib/retention";
import type { SelectivityPlan } from "@/lib/selectivity";

function retention(partial: Partial<RetentionDecision>): RetentionDecision {
  return {
    status: "recommend",
    reason: "drop-10",
    move: "drop-10",
    nextPercentB: 60,
    nextChange: "The long sentence stays out of this box.",
    why: "Why stays under the table.",
    fit: null,
    ...partial,
  };
}

describe("next change wording", () => {
  it("names a percent B run without a long explanation", () => {
    expect(retentionChangeLabel(retention({ nextPercentB: 60 }))).toBe("Run at 60% B");
    expect(retentionChangeLabel(retention({ nextPercentB: 80 }), 40)).toBe("Run at 40% B");
  });

  it("names temperature, solvent, and ligand the same way", () => {
    expect(retentionChangeLabel(retention({ nextTemperature: "40", nextPercentB: 60 }))).toBe("Run at 40°C");
    expect(
      retentionChangeLabel(
        retention({ reason: "second-minimum", nextTemperature: "40", nextPercentB: 36, move: null }),
      ),
    ).toBe("Run at 40°C at 36% B");
    const plan = { status: "recommend", step: "solvent" } as SelectivityPlan;
    expect(
      selectivityChangeLabel(
        { ...plan, prefill: { percentB: "", temperature: "25", solvent: "", ligand: "" } },
        { solvent: "MeOH" },
      ),
    ).toBe("Change solvent, back at 25°C");
    expect(selectivityChangeLabel({ ...plan, step: "ligand" }, { ligand: "C8" })).toBe("Run with C8");
    expect(selectivityChangeLabel({ ...plan, step: "temp-40" })).toBe("Run at 40°C");
  });

  it("says nothing is changing when no next run is recommended", () => {
    expect(retentionChangeLabel(retention({ status: "finished", nextPercentB: null }))).toBe(NO_CHANGE_YET);
    expect(selectivityChangeLabel({ status: "finished", step: "temp-40" } as SelectivityPlan)).toBe(NO_CHANGE_YET);
  });
});
