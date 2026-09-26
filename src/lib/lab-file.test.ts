import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateRun } from "@/lib/evaluate";
import { readLabFile } from "@/lib/lab-file";

const root = process.cwd();
const syntheticPath = path.join(root, "fixtures/synthetic-lab.csv");
const example06 = path.join(
  root,
  "public/examples/GR41-06-5-ACN-3-ISO-70-1.5-20u-CP-0.1-BiphP-150x4.6x5-amb-254 (3).csv",
);
const example07 = path.join(
  root,
  "public/examples/GR41-07-5-ACN-3-ISO-60-1.5-20u-CP-0.1-BiphP-150x4.6x5-amb-254 (2).csv",
);

const noRules = {
  requiredPeaks: null,
  lastPeakTimeMin: null,
  minResolution: null,
  maxBackPressurePsi: null,
};

describe("stand-in lab file", () => {
  const read = readLabFile(readFileSync(syntheticPath));

  it("uses # of Peaks for the count", () => {
    expect(read.blockingMessage).toBeNull();
    expect(read.peakCount).toBe(3);
    expect(read.peakRowCount).toBe(3);
  });

  it("uses the largest R.Time as the last peak", () => {
    expect(read.lastPeakTimeMin).toBeCloseTo(3.1, 5);
  });

  it("scales pressure with the multiplier from the file", () => {
    expect(read.maxBackPressurePsi).toBeCloseTo(72.1 * 14.2233, 5);
    expect(read.maxBackPressurePsi!).toBeGreaterThan(1025);
    expect(read.maxBackPressurePsi!).toBeLessThan(1026);
    expect(read.maxBackPressurePsi).toBeGreaterThan(40 * 14.2233);
  });

  it("ignores the first peak when finding minimum resolution", () => {
    expect(read.minResolutionExcludingFirst).toBeCloseTo(0.9, 5);
    expect(read.minResolutionExcludingFirst).not.toBe(0);
  });

  it("calls resolution NA when the file has fewer peaks than required", () => {
    const rows = evaluateRun(read, { ...noRules, requiredPeaks: 5, minResolution: 1.5 });
    const resolution = rows.find((row) => row.id === "resolution");
    expect(resolution?.measured).toBe("NA");
    expect(resolution?.status).toBe("not-met");
  });

  it("still reports resolution when a required peak count has not been entered", () => {
    const rows = evaluateRun(read, noRules);
    const resolution = rows.find((row) => row.id === "resolution");
    expect(resolution?.measured).toBe("0.900");
    expect(resolution?.status).toBe("not-set");
    expect(resolution?.measured).not.toBe("NA");
  });

  it("leaves an empty rule as not set", () => {
    const rows = evaluateRun(read, noRules);
    expect(rows.every((row) => row.rule === "not set")).toBe(true);
    expect(rows.every((row) => row.status === "not-set")).toBe(true);
  });

  it("draws a scaled chromatogram peak", () => {
    expect(read.chromatogramSectionName).toBe("LC Chromatogram(Detector A)");
    expect(read.chromatogramYAxis).toBe("mAU");
    const peak = read.chromatogram?.find((point) => point.timeMin === 1.2);
    expect(peak?.intensity).toBeCloseTo(5, 5);
  });
});

describe("real LabSolutions exports", () => {
  it("reads GR41-06", () => {
    const read = readLabFile(readFileSync(example06));
    expect(read.blockingMessage).toBeNull();
    expect(read.peakCount).toBe(6);
    expect(read.peakRowCount).toBe(6);
    expect(read.lastPeakTimeMin).toBeCloseTo(1.952, 5);
    expect(read.maxBackPressurePsi).toBeCloseTo(73.1 * 14.2233, 4);
    expect(read.minResolutionExcludingFirst).toBeCloseTo(0.64, 5);
    expect(read.chromatogramSectionName).toBe("LC Chromatogram(Detector A-Ch1)");
    expect(read.chromatogramYAxis).toBe("mAU");
    const start = read.chromatogram?.find((point) => point.timeMin === 0);
    expect(start?.intensity).toBeCloseTo(-1.619, 3);
    expect(read.chromatogramMissingMessage).toBeNull();

    const short = evaluateRun(read, { ...noRules, requiredPeaks: 7, minResolution: 1 });
    expect(short.find((row) => row.id === "resolution")?.measured).toBe("NA");
    expect(short.find((row) => row.id === "resolution")?.status).toBe("not-met");
  });

  it("reads GR41-07", () => {
    const read = readLabFile(readFileSync(example07));
    expect(read.blockingMessage).toBeNull();
    expect(read.peakCount).toBe(6);
    expect(read.peakRowCount).toBe(6);
    expect(read.lastPeakTimeMin).toBeCloseTo(2.779, 5);
    expect(read.maxBackPressurePsi).toBeCloseTo(86.2 * 14.2233, 4);
    expect(read.minResolutionExcludingFirst).toBeCloseTo(0.625, 5);
    expect(read.chromatogramSectionName).toBe("LC Chromatogram(Detector A-Ch1)");
    const start = read.chromatogram?.find((point) => point.timeMin === 0);
    expect(start?.intensity).toBeCloseTo(-2.21, 3);

    const enough = evaluateRun(read, {
      requiredPeaks: 6,
      lastPeakTimeMin: 2,
      minResolution: 0.5,
      maxBackPressurePsi: 2000,
    });
    expect(enough.find((row) => row.id === "peaks")?.status).toBe("met");
    expect(enough.find((row) => row.id === "last-peak")?.status).toBe("met");
    expect(enough.find((row) => row.id === "resolution")?.status).toBe("met");
    expect(enough.find((row) => row.id === "resolution")?.measured).toBe("0.625");
    expect(enough.find((row) => row.id === "back-pressure")?.status).toBe("met");
  });
});

describe("file shape differences", () => {
  it("keeps the # of Peaks value when the row count differs", () => {
    const text = `
[Peak Table(Detector A)]
# of Peaks,4
Peak#,R.Time,Resolution
1,1.0,0.000
2,2.0,1.200
3,3.0,1.500
`;
    const read = readLabFile(text);
    expect(read.peakCount).toBe(4);
    expect(read.peakRowCount).toBe(3);
    expect(read.notes.some((note) => note.includes("4 peaks") && note.includes("3 peak rows"))).toBe(
      true,
    );
    const row = evaluateRun(read, noRules).find((item) => item.id === "peaks");
    expect(row?.measured).toBe("4");
    expect(row?.note).toMatch(/3 peak rows/);
  });

  it("accepts spacing variants and tab columns", () => {
    const text = [
      "[Peak Table(Detector A)]",
      "# of Peaks\t2",
      "Peak#\tR. Time\tResolution",
      "1\t1.250\t0.000",
      "2\t4.500\t2.250",
      "",
      "[LC Status Trace(Pump A Pressure)]",
      "Intensity Units\tpsi",
      "Intensity Multiplier\t10",
      "R. Time (min)\tIntensity",
      "0\t1",
      "1\t3.5",
    ].join("\n");
    const read = readLabFile(text);
    expect(read.peakCount).toBe(2);
    expect(read.lastPeakTimeMin).toBeCloseTo(4.5, 5);
    expect(read.minResolutionExcludingFirst).toBeCloseTo(2.25, 5);
    expect(read.maxBackPressurePsi).toBeCloseTo(35, 5);
  });

  it("reads UTF-16 LE and BE byte order marks", () => {
    const text = readFileSync(syntheticPath, "utf8");
    for (const bytes of [encodeUtf16(text, "le"), encodeUtf16(text, "be")]) {
      const read = readLabFile(bytes);
      expect(read.peakCount).toBe(3);
      expect(read.maxBackPressurePsi).toBeCloseTo(72.1 * 14.2233, 5);
    }
  });

  it("reads a UTF-8 byte order mark", () => {
    const text = readFileSync(syntheticPath);
    const bytes = new Uint8Array(text.length + 3);
    bytes.set([0xef, 0xbb, 0xbf], 0);
    bytes.set(text, 3);
    expect(readLabFile(bytes).peakCount).toBe(3);
  });

  it("names a missing chromatogram and still returns the table values", () => {
    const text = `
[Peak Table(Detector A)]
# of Peaks,2
Peak#,R.Time,Resolution
1,1.0,0.000
2,2.5,1.100
[LC Status Trace(Pump A Pressure)]
Intensity Units,psi
Intensity Multiplier,2
R.Time (min),Intensity
0,4
1,9
`;
    const read = readLabFile(text);
    expect(read.peakCount).toBe(2);
    expect(read.maxBackPressurePsi).toBeCloseTo(18, 5);
    expect(read.chromatogram).toBeNull();
    expect(read.chromatogramMissingMessage).toMatch(/chromatogram \(Detector A\)/);
  });

  it("names a missing peak table", () => {
    const read = readLabFile("[Header]\nApplication Name,LabSolutions\n");
    expect(read.blockingMessage).toMatch(/peak table \(Detector A\)/);
  });

  it("does not invent a chromatogram multiplier for non-absorbance units", () => {
    const text = `
[Peak Table(Detector A)]
# of Peaks,1
Peak#,R.Time,Resolution
1,1.0,0.000
[LC Chromatogram(Detector A)]
Intensity Units,mV
Intensity Multiplier,0.001
R.Time (min),Intensity
0,1000
1,2000
`;
    const read = readLabFile(text);
    expect(read.chromatogramYAxis).toBe("mV");
    expect(read.chromatogram?.[1]?.intensity).toBe(2000);
  });
});

function encodeUtf16(text: string, endian: "le" | "be"): Uint8Array {
  const bytes = new Uint8Array(2 + text.length * 2);
  if (endian === "le") {
    bytes[0] = 0xff;
    bytes[1] = 0xfe;
  } else {
    bytes[0] = 0xfe;
    bytes[1] = 0xff;
  }
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const offset = 2 + i * 2;
    if (endian === "le") {
      bytes[offset] = code & 0xff;
      bytes[offset + 1] = code >> 8;
    } else {
      bytes[offset] = code >> 8;
      bytes[offset + 1] = code & 0xff;
    }
  }
  return bytes;
}
