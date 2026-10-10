import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  FILE_NAME_CHECKBOX_LABEL,
  FILE_NAME_EXAMPLE,
  FILE_NAME_MISMATCH,
  FILE_NAME_STRUCTURE_NOTE,
  detailsFromFileName,
  detailsFromFileNameIfEnabled,
  copyableNextRunFileName,
  nextRunFileName,
  parseRunFileName,
} from "@/lib/filename-details";
import { solventNomograph } from "@/lib/selectivity";
import { readLabFile } from "@/lib/lab-file";
import { decideRetention } from "@/lib/retention";
import { emptyRunDetails } from "@/lib/run-details";

const uploads = path.join(process.cwd(), "fixtures/lab");
const workbook90 = `${uploads}/GR09-05-3-ACN-3-ISO-90-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254_f959.xlsx`;
const workbook80 = `${uploads}/GR09-06-3-ACN-3-ISO-80-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254_2191.xlsx`;
const name90 = "GR09-05-3-ACN-3-ISO-90-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254.xlsx";
const name80 = "GR09-06-3-ACN-3-ISO-80-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254.xlsx";

describe("run file names", () => {
  it("explains the pattern with the GR09 90% B name", () => {
    expect(FILE_NAME_MISMATCH).toBe("This file name does not follow naming conventions.");
    expect(FILE_NAME_CHECKBOX_LABEL).toBe("Check this box to autofill details from file name.");
    expect(FILE_NAME_STRUCTURE_NOTE).toBe(
      "Structure must be group number-injection number-HPLC number-solvent-pH-method-%B-flow rate-injection volume-sample type-sample concentration-ligand-length x diameter x particle size-oven temperature-wavelength. For example, GR09-05-3-ACN-3-ISO-90-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254.",
    );
    expect(FILE_NAME_STRUCTURE_NOTE).toContain(FILE_NAME_EXAMPLE);
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
    expect(full.fields.injectionVolume).toBe("20");
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

  it("fills the class pattern and still loads a short or odd name", () => {
    const matched = parseRunFileName(`${FILE_NAME_EXAMPLE}.csv`);
    expect(matched.ok).toBe(true);
    if (!matched.ok) return;
    expect(matched.fields).toMatchObject({
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

    const odd = parseRunFileName("lab-export.csv");
    expect(odd.ok).toBe(false);
    if (odd.ok) return;
    expect(odd.message).toBe(FILE_NAME_MISMATCH);

    const read = readLabFile(readFileSync(path.join(process.cwd(), "fixtures/synthetic-lab.csv")));
    expect(read.blockingMessage).toBeNull();
    expect(read.peakCount).toBe(3);
    const decision = decideRetention(
      [
        {
          percentB: 90,
          peakCount: read.peakCount,
          lastPeakTimeMin: read.lastPeakTimeMin,
          firstPeakTimeMin: read.firstPeakTimeMin,
          minResolutionExcludingFirst: read.minResolutionExcludingFirst,
          maxBackPressurePsi: read.maxBackPressurePsi,
        },
      ],
      { requiredPeaks: 8, lastPeakTimeMin: 10, maxBackPressurePsi: 2000 },
    );
    expect(decision.nextChange.length).toBeGreaterThan(0);
    expect(decision.nextChange.toLowerCase()).not.toContain("file name");
  });

  it("reads T60, a unit stuck on a number, and a trailing upload suffix", () => {
    const stem = "GR09-16-4-ACN-3-ISO-35-1.5-20u-CP-0.1-C18aqP-150x4.6x5-T60-254";
    for (const fileName of [stem, `${stem}.xlsx`, `${stem}_493a.xlsx`]) {
      const parsed = parseRunFileName(fileName);
      expect(parsed.ok, fileName).toBe(true);
      if (!parsed.ok) return;
      expect(parsed.fields).toMatchObject({
        solvent: "ACN",
        ph: "3",
        method: "ISO",
        percentB: "35",
        flowRate: "1.5",
        injectionVolume: "20",
        sampleType: "CP",
        sampleConcentration: "0.1",
        ligand: "C18aq",
        lengthMm: "150",
        diameterMm: "4.6",
        particleSize: "5",
        temperature: "60",
        wavelength: "254",
      });
    }

    const microliters = parseRunFileName(
      "GR09-16-4-ACN-3-ISO-35-1.5mL/min-20µL-CP-0.1-C18aqP-150x4.6x5-60°C-254.xlsx",
    );
    expect(microliters.ok).toBe(true);
    if (!microliters.ok) return;
    expect(microliters.fields.flowRate).toBe("1.5");
    expect(microliters.fields.injectionVolume).toBe("20");
    expect(microliters.fields.temperature).toBe("60");
    expect(microliters.fields.percentB).toBe("35");

    const ul = parseRunFileName("GR09-16-4-acn-3-iso-35-1.5-20uL-CP-0.1-C18aqP-150x4.6x5-t60-254.xlsx");
    expect(ul.ok).toBe(true);
    if (!ul.ok) return;
    expect(ul.fields.solvent).toBe("ACN");
    expect(ul.fields.method).toBe("ISO");
    expect(ul.fields.injectionVolume).toBe("20");
    expect(ul.fields.temperature).toBe("60");

    const micro = parseRunFileName("GR09-16-4-ACN-3-ISO-35-1.5-20μL-CP-0.1-C18aqP-150x4.6x5-60C-254.xlsx");
    expect(micro.ok).toBe(true);
    if (!micro.ok) return;
    expect(micro.fields.injectionVolume).toBe("20");
    expect(micro.fields.temperature).toBe("60");

    const thf = parseRunFileName("GR09-16-4-thf-3-ISO-35-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254.xlsx");
    expect(thf.ok).toBe(true);
    if (!thf.ok) return;
    expect(thf.fields.solvent).toBe("THF");
    expect(thf.fields.temperature).toBe("ambient");

    const spaced = parseRunFileName("GR09-16-4-ACN-3-ISO-35-1.5 mL/min-20 uL-CP-0.1-C18aqP-150x4.6x5-60 °C-254.xlsx");
    expect(spaced.ok).toBe(true);
    if (!spaced.ok) return;
    expect(spaced.fields.flowRate).toBe("1.5");
    expect(spaced.fields.injectionVolume).toBe("20");
    expect(spaced.fields.temperature).toBe("60");
  });

  it("replaces the details when autofill stays on and a second file is loaded", () => {
    const firstName = "GR09-05-3-ACN-3-ISO-90-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254.csv";
    const secondName = "GR09-16-4-MeOH-3-ISO-35-1.5-20u-CP-0.1-C8-150x4.6x5-T60-254.csv";
    const first = detailsFromFileName(emptyRunDetails(), firstName);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.details).toMatchObject({
      solvent: "ACN",
      percentB: "90",
      temperature: "ambient",
      ligand: "C18aq",
      injectionVolume: "20",
    });

    const removed = first.details;
    expect(removed.solvent).toBe("ACN");

    const second = detailsFromFileName(removed, secondName);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.details).toMatchObject({
      solvent: "MeOH",
      ph: "3",
      method: "ISO",
      percentB: "35",
      flowRate: "1.5",
      injectionVolume: "20",
      sampleType: "CP",
      sampleConcentration: "0.1",
      ligand: "C8",
      lengthMm: "150",
      diameterMm: "4.6",
      particleSize: "5",
      temperature: "60",
      wavelength: "254",
    });
    expect(second.details.solvent).not.toBe("ACN");
    expect(second.details.percentB).not.toBe("90");
    expect(second.details.temperature).not.toBe("ambient");
    expect(second.details.ligand).not.toBe("C18aq");

    const shorter = detailsFromFileName(first.details, "GR09-16-35-T60.csv");
    expect(shorter.ok).toBe(true);
    if (!shorter.ok) return;
    expect(shorter.details.percentB).toBe("35");
    expect(shorter.details.temperature).toBe("60");
    expect(shorter.details.solvent).toBe("");
    expect(shorter.details.ligand).toBe("");

    const mismatch = detailsFromFileName(second.details, "notes.csv");
    expect(mismatch.ok).toBe(false);
    if (mismatch.ok) return;
    expect(mismatch.note).toBe("This file name does not follow naming conventions.");
    expect(mismatch.details).toEqual(second.details);
  });

  it("uses the file name %B on a later run when that %B is not the recommended 42%", () => {
    const recommended = { ...emptyRunDetails(), percentB: "42", ligand: "C18", solvent: "ACN", temperature: "ambient" };
    const next = detailsFromFileName(
      recommended,
      "GR09-16-4-ACN-3-ISO-35-1.5-20u-CP-0.1-C18aqP-150x4.6x5-T60-254.csv",
    );
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    expect(next.details.percentB).toBe("35");
    expect(next.details.ligand).toBe("C18aq");
    expect(next.details.lengthMm).toBe("150");
    expect(next.details.diameterMm).toBe("4.6");
    expect(next.details.particleSize).toBe("5");
    expect(next.details.percentB).not.toBe(recommended.percentB);

    const kept = detailsFromFileName(recommended, "not-a-run-name.csv");
    expect(kept.ok).toBe(false);
    if (kept.ok) return;
    expect(kept.note).toBe(FILE_NAME_MISMATCH);
    expect(kept.details.percentB).toBe("42");
  });

  it("leaves every run's details unchanged when autofill is off", () => {
    const typed = {
      ...emptyRunDetails(),
      solvent: "MeOH",
      percentB: "42",
      temperature: "25",
      ligand: "C8",
      wavelength: "210",
    };
    const named = "GR09-16-4-ACN-3-ISO-35-1.5-20u-CP-0.1-C18aqP-150x4.6x5-T60-254.csv";
    const first = detailsFromFileNameIfEnabled(typed, named, false);
    expect(first.apply).toBe(false);
    expect(first.note).toBeNull();
    expect(first.details).toEqual(typed);

    const again = detailsFromFileNameIfEnabled(first.details, named, false);
    expect(again.details).toEqual(typed);

    const shortName = detailsFromFileNameIfEnabled(typed, "GR41-09-40.csv", false);
    expect(shortName.apply).toBe(false);
    expect(shortName.details.percentB).toBe("42");
    expect(shortName.details.temperature).toBe("25");

    const mismatch = detailsFromFileNameIfEnabled(typed, "notes.csv", false);
    expect(mismatch.apply).toBe(false);
    expect(mismatch.note).toBeNull();
    expect(mismatch.details).toEqual(typed);

    const enabled = detailsFromFileNameIfEnabled(typed, named, true);
    expect(enabled.apply).toBe(true);
    if (!enabled.apply) return;
    expect(enabled.details.percentB).toBe("35");
    expect(enabled.details.solvent).toBe("ACN");
    expect(enabled.details.temperature).toBe("60");
  });

  it("builds the next run file name from the latest identity and the next run’s details", () => {
    const next = {
      ...emptyRunDetails(),
      solvent: "ACN",
      ph: "3",
      method: "ISO",
      percentB: "62",
      flowRate: "1.5",
      injectionVolume: "20",
      sampleType: "CP",
      sampleConcentration: "0.1",
      ligand: "biphenyl",
      lengthMm: "150",
      diameterMm: "4.6",
      particleSize: "5",
      temperature: "ambient",
      wavelength: "254",
    };
    const latest = "GR41-05-5-ACN-3-ISO-80-1.5-20u-CP-0.1-BiphP-150x4.6x5-amb-254.csv";
    const name = nextRunFileName(latest, next);
    expect(name).toBe("GR41-06-5-ACN-3-ISO-62-1.5-20u-CP-0.1-BiphP-150x4.6x5-amb-254");
    expect(name).not.toMatch(/[–—]/);
    const filled = detailsFromFileName(emptyRunDetails(), `${name}.csv`);
    expect(filled.ok).toBe(true);
    if (!filled.ok) return;
    expect(filled.details.percentB).toBe("62");
    expect(filled.details.ligand).toBe("biphenyl");
    expect(filled.details.temperature).toBe("ambient");
    expect(filled.details.solvent).toBe("ACN");

    const heated = nextRunFileName(latest, { ...next, ligand: "C18aq", temperature: "60°C", percentB: "62" });
    expect(heated).toContain("-C18aqP-");
    expect(heated.endsWith("-T60-254")).toBe(true);

    const fromShort = nextRunFileName("GR41-09-40.csv", next);
    expect(fromShort.startsWith("GR41-10-1-")).toBe(true);
    expect(fromShort).toContain("-62-");
    expect(fromShort).not.toContain("-40-");

    const unseen = nextRunFileName(null, next);
    expect(unseen.startsWith("GR-01-1-")).toBe(true);
  });

  it("waits to copy the next-run name until the chart solvent and %B are filled in", () => {
    const latest = "GR41-03-5-ACN-3-ISO-60-1.5-20u-CP-0.1-C18-150x4.6x5-T60-254.csv";
    const base = {
      ...emptyRunDetails(),
      ph: "3",
      method: "ISO",
      flowRate: "1.5",
      injectionVolume: "20",
      sampleType: "CP",
      sampleConcentration: "0.1",
      ligand: "C18",
      lengthMm: "150",
      diameterMm: "4.6",
      particleSize: "5",
      wavelength: "254",
      temperature: "25",
    };
    const unset = nextRunFileName(latest, { ...base, solvent: "", percentB: "" });
    expect(unset).toContain("-NA-");
    expect(unset).toContain("-0-");
    expect(copyableNextRunFileName(latest, { ...base, solvent: "", percentB: "" })).toBeNull();
    expect(copyableNextRunFileName(latest, { ...base, solvent: "NA", percentB: "45.1" })).toBeNull();
    expect(copyableNextRunFileName(latest, { ...base, solvent: "MeOH", percentB: "0" })).toBeNull();

    const chart = solventNomograph(35, "ACN");
    expect(chart).toBeTruthy();
    const percentOf = (id: string) => chart!.find((row) => row.id === id)!.percentText;
    expect(percentOf("acetonitrile")).toBe("35.0");
    expect(percentOf("methanol")).toBe("44.1");
    expect(percentOf("tetrahydrofuran")).toBe("24.5");

    expect(
      copyableNextRunFileName(latest, { ...base, solvent: "MeOH", percentB: percentOf("methanol"), temperature: "25" }),
    ).toBe("GR41-04-5-MeOH-3-ISO-44.1-1.5-20u-CP-0.1-C18-150x4.6x5-T25-254");
    expect(
      copyableNextRunFileName(latest, { ...base, solvent: "ACN", percentB: percentOf("acetonitrile"), temperature: "25" }),
    ).toBe("GR41-04-5-ACN-3-ISO-35-1.5-20u-CP-0.1-C18-150x4.6x5-T25-254");
    expect(
      copyableNextRunFileName(latest, { ...base, solvent: "THF", percentB: percentOf("tetrahydrofuran"), temperature: "25" }),
    ).toBe("GR41-04-5-THF-3-ISO-24.5-1.5-20u-CP-0.1-C18-150x4.6x5-T25-254");
    expect(
      copyableNextRunFileName(latest, {
        ...base,
        solvent: "MeOH",
        percentB: percentOf("methanol"),
        temperature: "ambient",
      }),
    ).toBe("GR41-04-5-MeOH-3-ISO-44.1-1.5-20u-CP-0.1-C18-150x4.6x5-amb-254");
  });
});
