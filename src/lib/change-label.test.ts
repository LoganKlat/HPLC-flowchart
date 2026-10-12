import { describe, expect, it } from "vitest";
import {
  nextRunLockedForLigand,
  nextRunLockedForSolvent,
  NO_CHANGE_YET,
  retentionChangeLabel,
  selectivityChangeLabel,
} from "@/lib/change-label";
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

  it("names efficiency when peaks already match the specification", () => {
    expect(
      retentionChangeLabel(
        retention({
          status: "efficiency",
          reason: "efficiency",
          move: null,
          nextPercentB: null,
          nextChange: "Move on to efficiency. This is recommended because the peak count equals the specification.",
        }),
      ),
    ).toBe("Move on to efficiency");
  });

  it("names temperature, solvent, and ligand the same way", () => {
    expect(retentionChangeLabel(retention({ nextTemperature: "40", nextPercentB: 60 }))).toBe("Run at 40°C");
    expect(
      retentionChangeLabel(
        retention({ reason: "second-minimum", nextTemperature: "40", nextPercentB: 36, move: null }),
      ),
    ).toBe("Run at 40°C at 36% B");
    expect(
      retentionChangeLabel(
        retention({ reason: "choose-percent", nextTemperature: "40", nextPercentB: null, move: null }),
      ),
    ).toBe("Select a %B");
    expect(
      retentionChangeLabel(
        retention({ reason: "choose-percent", nextTemperature: "40", nextPercentB: null, move: null }),
        22,
      ),
    ).toBe("Run at 40°C at 22% B");
    const plan = { status: "recommend", step: "solvent" } as SelectivityPlan;
    expect(
      selectivityChangeLabel(
        { ...plan, prefill: { percentB: "", temperature: "25", solvent: "", ligand: "" } },
        { solvent: "MeOH" },
      ),
    ).toBe("Change solvent, back at 25°C");
    expect(
      selectivityChangeLabel({ ...plan, prefill: { percentB: "", temperature: "ambient", solvent: "", ligand: "" } }),
    ).toBe("Change solvent, back at ambient");
    expect(
      selectivityChangeLabel({ ...plan, prefill: { percentB: "", temperature: "amb", solvent: "", ligand: "" } }),
    ).toBe("Change solvent, back at ambient");
    expect(
      selectivityChangeLabel({ ...plan, prefill: { percentB: "", temperature: "", solvent: "", ligand: "" } }),
    ).toBe("Change solvent, back at ambient");
    expect(
      selectivityChangeLabel({ ...plan, prefill: { percentB: "", temperature: "30", solvent: "", ligand: "" } }),
    ).toBe("Change solvent, back at 30°C");
    expect(selectivityChangeLabel({ ...plan, step: "ligand" }, { ligand: "C8" })).toBe("Run with C8");
    expect(selectivityChangeLabel({ ...plan, step: "temp-40" })).toBe("Run at 40°C");
  });

  it("locks the solvent step until a solvent and its %B are known", () => {
    const solvent = { status: "recommend" as const, step: "solvent" as const };
    expect(nextRunLockedForSolvent(solvent, { solvent: "", percentB: "" })).toBe(true);
    expect(nextRunLockedForSolvent(solvent, { solvent: "MeOH", percentB: "" })).toBe(true);
    expect(nextRunLockedForSolvent(solvent, { solvent: "", percentB: "50.3" })).toBe(true);
    expect(nextRunLockedForSolvent(solvent, null)).toBe(true);
    expect(nextRunLockedForSolvent(solvent, { solvent: "MeOH", percentB: "50.3" })).toBe(false);
    expect(nextRunLockedForSolvent(solvent, { solvent: "THF", percentB: "17.6" })).toBe(false);
    expect(nextRunLockedForSolvent({ status: "recommend", step: "temp-40" }, { solvent: "", percentB: "" })).toBe(
      false,
    );
    expect(nextRunLockedForSolvent({ status: "recommend", step: "temp-60" }, null)).toBe(false);
    expect(nextRunLockedForSolvent({ status: "recommend", step: "ligand" }, { solvent: "", percentB: "" })).toBe(
      false,
    );
    expect(nextRunLockedForSolvent({ status: "recommend", step: "temp-choice" }, { solvent: "", percentB: "" })).toBe(
      false,
    );
  });

  it("locks a new ligand until the next coating is different from this run", () => {
    const ligand = { status: "recommend" as const, step: "ligand" as const, tempChoice: null };
    expect(nextRunLockedForLigand(ligand, { nextLigand: "", currentLigand: "C18" })).toBe(true);
    expect(nextRunLockedForLigand(ligand, { nextLigand: "C18", currentLigand: "C18" })).toBe(true);
    expect(nextRunLockedForLigand(ligand, { nextLigand: "c18", currentLigand: "C18" })).toBe(true);
    expect(nextRunLockedForLigand(ligand, { nextLigand: "C8", currentLigand: "C18" })).toBe(false);
    expect(nextRunLockedForLigand(ligand, { nextLigand: "C8", currentLigand: "" })).toBe(false);
    expect(nextRunLockedForLigand(ligand, null)).toBe(true);
    expect(nextRunLockedForLigand({ status: "recommend", step: "solvent", tempChoice: null }, { nextLigand: "" })).toBe(
      false,
    );
    expect(nextRunLockedForLigand({ status: "recommend", step: "temp-40", tempChoice: null }, { nextLigand: "" })).toBe(
      false,
    );
    expect(nextRunLockedForLigand({ status: "recommend", step: "temp-60", tempChoice: null }, null)).toBe(false);
    const choice = {
      status: "recommend" as const,
      step: "temp-choice" as const,
      tempChoice: { other: "ligand" as const },
    };
    expect(nextRunLockedForLigand(choice, { tempPath: null, nextLigand: "", currentLigand: "C18" })).toBe(true);
    expect(nextRunLockedForLigand(choice, { tempPath: "heat", nextLigand: "", currentLigand: "C18" })).toBe(false);
    expect(nextRunLockedForLigand(choice, { tempPath: "ligand", nextLigand: "C8", currentLigand: "C18" })).toBe(false);
    expect(
      nextRunLockedForLigand(
        { status: "recommend", step: "temp-choice", tempChoice: { other: "solvent" } },
        { tempPath: null, nextLigand: "", currentLigand: "C18" },
      ),
    ).toBe(false);
  });

  it("says nothing is changing when no next run is recommended", () => {
    expect(retentionChangeLabel(retention({ status: "finished", nextPercentB: null }))).toBe(NO_CHANGE_YET);
    expect(selectivityChangeLabel({ status: "finished", step: "temp-40" } as SelectivityPlan)).toBe(NO_CHANGE_YET);
  });
});
