import { describe, expect, it } from "vitest";
import { methodStageFromLatest } from "@/lib/method-stage";

describe("method development stage", () => {
  it("starts in retention before a decision exists", () => {
    expect(methodStageFromLatest({ leftSelectivity: false, phase: null })).toBe("Retention");
  });

  it("stays in retention for the %B ladder and a chosen minimum", () => {
    expect(
      methodStageFromLatest({
        leftSelectivity: false,
        phase: "retention",
        retentionStatus: "recommend",
        retentionReason: "calculated",
      }),
    ).toBe("Retention");
    expect(
      methodStageFromLatest({
        leftSelectivity: false,
        phase: "retention",
        retentionStatus: "recommend",
        retentionReason: "choose-percent",
      }),
    ).toBe("Retention");
  });

  it("moves to selectivity for temperature, solvent, and ligand", () => {
    expect(methodStageFromLatest({ leftSelectivity: false, phase: "selectivity" })).toBe("Selectivity");
  });

  it("moves to efficiency when that step is the decision or it was chosen", () => {
    expect(
      methodStageFromLatest({
        leftSelectivity: false,
        phase: "retention",
        retentionStatus: "efficiency",
        retentionReason: "efficiency",
      }),
    ).toBe("Efficiency");
    expect(methodStageFromLatest({ leftSelectivity: true, phase: "selectivity" })).toBe("Efficiency");
  });

  it("shows Efficiency when peaks already match and the engine leaves retention", () => {
    expect(
      methodStageFromLatest({
        leftSelectivity: false,
        phase: "retention",
        retentionStatus: "efficiency",
        retentionReason: "efficiency",
      }),
    ).toBe("Efficiency");
  });
});
