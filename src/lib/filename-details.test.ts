import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FILE_NAME_CHECKBOX_LABEL, FILE_NAME_MISMATCH, parseRunFileName } from "@/lib/filename-details";
import { readLabFile } from "@/lib/lab-file";

const uploads = "/home/ubuntu/.cursor/projects/workspace/uploads";
const workbook90 = `${uploads}/GR09-05-3-ACN-3-ISO-90-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254_f959.xlsx`;
const workbook80 = `${uploads}/GR09-06-3-ACN-3-ISO-80-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254_2191.xlsx`;
const name90 = "GR09-05-3-ACN-3-ISO-90-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254.xlsx";
const name80 = "GR09-06-3-ACN-3-ISO-80-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254.xlsx";

describe("run file names", () => {
  it("explains the pattern with the GR09 90% B name", () => {
    expect(FILE_NAME_CHECKBOX_LABEL).toBe(
      "Check this box to autofill details from file name. Structure must be group number-injection number-HPLC number-solvent-pH-method-%B-flow rate-injection volume-sample type-sample concentration-ligand-length x diameter x particle size-oven temperature-wavelength. For example, GR09-05-3-ACN-3-ISO-90-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254.",
    );
  });

  it("parses both workbook names, including the extra upload suffix", () => {
    for (const fileName of [name90, name80, workbook90, workbook80]) {
      const parsed = parseRunFileName(fileName);
      expect(parsed.ok, fileName).toBe(true);
    }
    const at90 = parseRunFileName(name90);
    const at80 = parseRunFileName(name80);
    if (!at90.ok || !at80.ok) throw new Error("names did not parse");
    expect(at90.fields).toMatchObject({
      solvent: "ACN",
      ph: "3",
      method: "ISO",
      percentB: "90",
      flowRate: "1.5",
      injectionVolume: "20",
      sampleType: "CP",
      sampleConcentration: "0.1",
      ligand: "C18aq",
      lengthMm: "150",
      diameterMm: "4.6",
      particleSize: "5",
      temperature: "ambient",
      wavelength: "254",
    });
    expect(at80.fields.percentB).toBe("80");
    expect(at80.fields.method).toBe("ISO");
    expect(at80.fields.ligand).toBe("C18aq");
  });

  it("maps BiphP and keeps a short name to the pieces it has", () => {
    const full = parseRunFileName(
      "GR41-06-5-ACN-3-ISO-70-1.5-20u-CP-0.1-BiphP-150x4.6x5-amb-254 (3).csv",
    );
    expect(full.ok).toBe(true);
    if (!full.ok) return;
    expect(full.fields.ligand).toBe("biphenyl");
    expect(full.fields.injectionVolume).toBe("20u");
    expect(full.fields.percentB).toBe("70");

    const short = parseRunFileName("GR41-04-90.csv");
    expect(short.ok).toBe(true);
    if (!short.ok) return;
    expect(short.fields).toEqual({ percentB: "90" });

    const ambient = parseRunFileName("GR41-09-40-ambient.csv");
    expect(ambient.ok).toBe(true);
    if (!ambient.ok) return;
    expect(ambient.fields.temperature).toBe("ambient");
    expect(ambient.fields.percentB).toBe("40");

    const heated = parseRunFileName("GR41-15-38-40C.csv");
    expect(heated.ok).toBe(true);
    if (!heated.ok) return;
    expect(heated.fields.temperature).toBe("40");

    const noted = parseRunFileName("GR41-06-70-good.csv");
    expect(noted.ok).toBe(true);
    if (!noted.ok) return;
    expect(noted.fields.percentB).toBe("70");
    expect(noted.fields.ligand).toBeUndefined();
  });

  it("does not invent a menu choice, and leaves a name that does not match", () => {
    const unknown = parseRunFileName(
      "GR09-05-3-ACN-3-ISO-90-1.5-20-CP-0.1-C30-150x4.6x5-amb-254.xlsx",
    );
    expect(unknown.ok).toBe(true);
    if (!unknown.ok) return;
    expect(unknown.fields.ligand).toBeUndefined();
    expect(unknown.fields.solvent).toBe("ACN");

    const methanol = parseRunFileName("GR09-05-3-MeOH-3-ISO-90-1.5-20-CP-0.1-C8-150x4.6x5-amb-254.xlsx");
    expect(methanol.ok).toBe(true);
    if (!methanol.ok) return;
    expect(methanol.fields.solvent).toBe("MeOH");
    expect(methanol.fields.ligand).toBe("C8");

    const gradient = parseRunFileName(
      "GR09-05-3-ACN-3-GRA-90-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254.xlsx",
    );
    expect(gradient.ok).toBe(true);
    if (!gradient.ok) return;
    expect(gradient.fields.method).toBe("GRA");

    const mismatch = parseRunFileName("notes.csv");
    expect(mismatch).toEqual({ ok: false, message: FILE_NAME_MISMATCH });

    const blank = parseRunFileName(
      "GR09-05-3-ACN-3-ISO-90-1.5-20-blank-0.1-C18-150x4.6x5-amb-254.xlsx",
    );
    expect(blank.ok).toBe(true);
    if (!blank.ok) return;
    expect(blank.fields.sampleType).toBe("BLANK");

    const other = parseRunFileName(
      "GR09-05-3-ACN-3-ISO-90-1.5-20-STD-0.1-C18-150x4.6x5-amb-254.xlsx",
    );
    expect(other.ok).toBe(true);
    if (!other.ok) return;
    expect(other.fields.sampleType).toBeUndefined();
    expect(other.fields.sampleConcentration).toBe("0.1");
  });

  it("reads both workbooks the same way as a LabSolutions export", () => {
    const first = readLabFile(readFileSync(workbook90));
    const second = readLabFile(readFileSync(workbook80));
    expect(first.blockingMessage).toBeNull();
    expect(first.peakCount).toBe(3);
    expect(first.lastPeakTimeMin).toBeCloseTo(2.01, 5);
    expect(first.minResolutionExcludingFirst).toBeCloseTo(0.369, 3);
    expect(first.pressureFound).toBe(true);
    expect(first.maxBackPressurePsi).not.toBeNull();
    expect(first.chromatogram?.length).toBeGreaterThan(10);
    expect(first.chromatogramYAxis.toLowerCase()).toContain("mau");

    expect(second.blockingMessage).toBeNull();
    expect(second.peakCount).toBe(3);
    expect(second.lastPeakTimeMin).toBeCloseTo(1.687, 5);
    expect(second.minResolutionExcludingFirst).toBeCloseTo(1.093, 3);
    expect(second.pressureFound).toBe(true);
    expect(second.chromatogram?.length).toBeGreaterThan(10);
  });
});
