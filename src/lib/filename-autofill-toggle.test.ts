import { describe, it, expect } from "vitest";
import { syncNextRun, emptyRun, type RunState } from "@/components/hplc-app";
import { emptyRunDetails, type RunDetails } from "@/lib/run-details";
import type { RuleNumbers } from "@/lib/evaluate";
import type { LabFileRead } from "@/lib/lab-file";

function mockRead(
  peakCount: number,
  firstPeakTimeMin: number,
  lastPeakTimeMin: number,
  minResolutionExcludingFirst = 1.2,
): LabFileRead {
  return {
    blockingMessage: null,
    notes: [],
    peakCount,
    peakRowCount: peakCount,
    firstPeakTimeMin,
    peakTimesMin: [firstPeakTimeMin, lastPeakTimeMin],
    peaks: [],
    areaColumnFound: true,
    heightColumnFound: true,
    lastPeakTimeMin,
    minResolutionExcludingFirst,
    resolutionColumnFound: true,
    maxBackPressurePsi: 2000,
    pressureFound: true,
    pressureTrace: [],
    pressureUnits: "psi",
    chromatogram: [],
    chromatogramSectionName: null,
    chromatogramYAxis: "mAU",
    chromatogramMissingMessage: null,
  };
}

describe("Filename autofill toggle and decision rules application", () => {
  const baseDetails: RunDetails = {
    ...emptyRunDetails(),
    percentB: "90",
    temperature: "amb",
    solvent: "Methanol",
    ligand: "C18",
    sampleType: "CP",
    sampleConcentration: "0.1",
  };

  const checks: RuleNumbers = {
    requiredPeaks: 7,
    minResolution: 1.5,
    lastPeakTimeMin: 15,
    maxBackPressurePsi: 4000,
  };

  it("automatically applies decision point recommendation to Run 2 when fillFromFileName is false", () => {
    // Run 0 has 3 peaks at 90% B and elutes quickly (3.0 min), which recommends dropping by 10% to 80% B
    const run0: RunState = {
      ...emptyRun(),
      status: "ready",
      percentB: "90",
      temperature: "amb",
      solvent: "Methanol",
      ligand: "C18",
      read: mockRead(3, 1.0, 3.0),
    };

    // Run 1 is uploaded/read but fillFromFileName is false
    const run1: RunState = {
      ...emptyRun(),
      status: "ready",
      fileName: "custom_sample_run2.csv",
      percentB: "",
      temperature: "",
      solvent: "",
      ligand: "",
      read: mockRead(5, 1.5, 6.0),
    };

    const synced = syncNextRun([run0, run1], { ...baseDetails, percentB: "90" }, checks, {
      leftSelectivity: false,
      choice: {},
      heat: null,
      continuePastEfficiency: false,
      linePercent: null,
      pickedPercent: null,
      fillFromFileName: false,
    });

    // Run 1 should have received the decision point recommendation: 80% B, amb, Methanol, C18
    expect(synced[1].percentB).toBe("80");
    expect(synced[1].temperature).toBe("amb");
    expect(synced[1].solvent).toBe("Methanol");
    expect(synced[1].ligand).toBe("C18");
  });

  it("preserves user-edited fields on Run 2 when fillFromFileName is false", () => {
    const run0: RunState = {
      ...emptyRun(),
      status: "ready",
      percentB: "90",
      temperature: "amb",
      solvent: "Methanol",
      ligand: "C18",
      read: mockRead(3, 1.0, 3.0),
    };

    // User explicitly changed %B on Run 1 to 75% B
    const run1: RunState = {
      ...emptyRun(),
      status: "ready",
      fileName: "custom_sample_run2.csv",
      percentB: "75",
      percentEdited: true,
      userEditedPercentB: true,
      temperature: "",
      temperatureEdited: false,
      userEditedTemperature: false,
      solvent: "",
      solventEdited: false,
      userEditedSolvent: false,
      ligand: "",
      ligandEdited: false,
      userEditedLigand: false,
      read: mockRead(5, 1.5, 6.0),
    };

    const synced = syncNextRun([run0, run1], { ...baseDetails, percentB: "90" }, checks, {
      leftSelectivity: false,
      choice: {},
      heat: null,
      continuePastEfficiency: false,
      linePercent: null,
      pickedPercent: null,
      fillFromFileName: false,
    });

    // %B must remain the user-edited 75%, while temperature, solvent, ligand get the recommended rules
    expect(synced[1].percentB).toBe("75");
    expect(synced[1].temperature).toBe("amb");
    expect(synced[1].solvent).toBe("Methanol");
    expect(synced[1].ligand).toBe("C18");
  });

  it("does not overwrite non-user-edited ready runs when fillFromFileName is true", () => {
    const run0: RunState = {
      ...emptyRun(),
      status: "ready",
      percentB: "90",
      temperature: "amb",
      solvent: "Methanol",
      ligand: "C18",
      read: mockRead(3, 1.0, 3.0),
    };

    // Run 1 came from filename autofill with 70% B
    const run1: RunState = {
      ...emptyRun(),
      status: "ready",
      fileName: "run_70B.csv",
      percentB: "70",
      percentEdited: true,
      userEditedPercentB: false,
      temperature: "30",
      temperatureEdited: true,
      userEditedTemperature: false,
      solvent: "Acetonitrile",
      solventEdited: true,
      userEditedSolvent: false,
      ligand: "C18",
      ligandEdited: true,
      userEditedLigand: false,
      read: mockRead(5, 1.5, 6.0),
    };

    const synced = syncNextRun([run0, run1], baseDetails, checks, {
      leftSelectivity: false,
      choice: {},
      heat: null,
      continuePastEfficiency: false,
      linePercent: null,
      pickedPercent: null,
      fillFromFileName: true,
    });

    // When fillFromFileName is true, run 1 keeps its filename conditions
    expect(synced[1].percentB).toBe("70");
    expect(synced[1].temperature).toBe("30");
    expect(synced[1].solvent).toBe("Acetonitrile");
  });

  it("propagates decision rules across a chain of multiple runs when fillFromFileName is false", () => {
    // Run 0: 90% B, quick elution -> recommends 80% B
    const run0: RunState = {
      ...emptyRun(),
      status: "ready",
      percentB: "90",
      temperature: "amb",
      solvent: "Methanol",
      ligand: "C18",
      read: mockRead(3, 1.0, 3.0),
    };

    // Run 1: gets 80% B, quick elution -> recommends 70% B
    const run1: RunState = {
      ...emptyRun(),
      status: "ready",
      percentB: "",
      temperature: "",
      solvent: "",
      ligand: "",
      read: mockRead(4, 1.2, 4.5),
    };

    // Run 2: blank conditions initially
    const run2: RunState = {
      ...emptyRun(),
      status: "ready",
      percentB: "",
      temperature: "",
      solvent: "",
      ligand: "",
      read: mockRead(5, 1.5, 6.0),
    };

    const synced = syncNextRun([run0, run1, run2], { ...baseDetails, percentB: "90" }, checks, {
      leftSelectivity: false,
      choice: {},
      heat: null,
      continuePastEfficiency: false,
      linePercent: null,
      pickedPercent: null,
      fillFromFileName: false,
    });

    // Run 1 gets 80% B from Decision 0
    expect(synced[1].percentB).toBe("80");
    expect(synced[1].temperature).toBe("amb");

    // Run 2 gets 70% B from Decision 1
    expect(synced[2].percentB).toBe("70");
    expect(synced[2].temperature).toBe("amb");
  });
});
