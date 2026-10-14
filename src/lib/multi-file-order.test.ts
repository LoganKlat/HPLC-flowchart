import { describe, expect, it } from "vitest";
import { parseInjectionNumber, sortFilesByInjection } from "@/lib/filename-details";

describe("multi-file injection ordering", () => {
  it("sorts 15-part LabSolutions filenames in ascending injection order", () => {
    const unorganized = [
      { fileName: "GR09-14-4-ACN-3-ISO-35-1.5-20u-CP-0.1-C18aqP-150x4.6x5-amb-254.xlsx" },
      { fileName: "GR09-06-3-ACN-3-ISO-80-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254_2191.xlsx" },
      { fileName: "GR09-10-3-ACN-3-ISO-40-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254.xlsx" },
      { fileName: "GR09-05-3-ACN-3-ISO-90-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254_f959.xlsx" },
      { fileName: "GR09-08-3-ACN-3-ISO-60-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254.xlsx" },
      { fileName: "GR09-07-3-ACN-3-ISO-70-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254.xlsx" },
      { fileName: "GR09-09-3-ACN-3-ISO-50-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254.xlsx" },
    ];

    const sorted = sortFilesByInjection(unorganized);
    const sortedInjections = sorted.map((f) => parseInjectionNumber(f.fileName));

    expect(sortedInjections).toEqual([5, 6, 7, 8, 9, 10, 14]);
    expect(sorted[0].fileName).toContain("GR09-05");
    expect(sorted[sorted.length - 1].fileName).toContain("GR09-14");
  });

  it("handles short filenames and ensures numeric rather than lexicographical ordering", () => {
    // String sorting would place "GR41-10" before "GR41-04" if unpadded, or "inj10" before "inj2"
    const files = [
      { fileName: "sample_inj10.csv" },
      { fileName: "sample_inj2.csv" },
      { fileName: "sample_inj1.csv" },
      { fileName: "sample_inj20.csv" },
      { fileName: "sample_inj3.csv" },
    ];

    const sorted = sortFilesByInjection(files);
    expect(sorted.map((f) => f.fileName)).toEqual([
      "sample_inj1.csv",
      "sample_inj2.csv",
      "sample_inj3.csv",
      "sample_inj10.csv",
      "sample_inj20.csv",
    ]);
  });

  it("sorts retention run fixtures across various naming patterns", () => {
    const mixed = [
      { fileName: "GR41-15-38-40C.csv" },
      { fileName: "GR41-04-90.csv" },
      { fileName: "GR41-10-37.csv" },
      { fileName: "GR41-06-70-good.csv" },
      { fileName: "GR41-08-50.csv" },
    ];

    const sorted = sortFilesByInjection(mixed);
    expect(sorted.map((f) => parseInjectionNumber(f.fileName))).toEqual([4, 6, 8, 10, 15]);
  });

  it("places unrecognized files at the end while preserving their original order", () => {
    const files = [
      { fileName: "unknown_first.txt" },
      { fileName: "run_5.csv" },
      { fileName: "unknown_second.txt" },
      { fileName: "run_1.csv" },
    ];

    const sorted = sortFilesByInjection(files);
    expect(sorted.map((f) => f.fileName)).toEqual([
      "run_1.csv",
      "run_5.csv",
      "unknown_first.txt",
      "unknown_second.txt",
    ]);
  });

  it("inspects content fallback when filenames are generic", () => {
    const fileA = {
      fileName: "data_a.csv",
      buffer: new TextEncoder().encode("[Sample Information]\r\nSample Name,GR09-08-3-ACN-3-ISO-60\r\n").buffer,
    };
    const fileB = {
      fileName: "data_b.csv",
      buffer: new TextEncoder().encode("[Header]\r\nData File Name,C:\\LabSolutions\\GR41-04-5-ACN-3-ISO-90.lcd\r\n").buffer,
    };

    const sorted = sortFilesByInjection([fileA, fileB]);
    expect(sorted[0].fileName).toBe("data_b.csv"); // Injection 4
    expect(sorted[1].fileName).toBe("data_a.csv"); // Injection 8
  });
});
