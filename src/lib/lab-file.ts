/**
 * Reads a LabSolutions export by section name and column name.
 * Row numbers are never used to find data.
 * A workbook is turned into the same labeled sections before it is read.
 */

import * as XLSX from "xlsx";

export type ChromatogramPoint = {
  timeMin: number;
  intensity: number;
};

/** One point from the pump-pressure section. Pressure is intensity times that section’s multiplier. */
export type PressurePoint = {
  timeMin: number;
  pressure: number;
};

export type PeakMeasurement = {
  timeMin: number | null;
  area: number | null;
  height: number | null;
};

export type LabFileRead = {
  /** Set when the peak table cannot be used. Plain words for the screen. */
  blockingMessage: string | null;
  notes: string[];
  peakCount: number | null;
  peakRowCount: number;
  /** R.Time of the first peak row. Used as the unretained peak (t0). */
  firstPeakTimeMin: number | null;
  /** Every peak-table R.Time, in table order. */
  peakTimesMin: number[];
  /** Every peak row: retention time, area, and height. Columns are found by header. */
  peaks: PeakMeasurement[];
  areaColumnFound: boolean;
  heightColumnFound: boolean;
  lastPeakTimeMin: number | null;
  /** Smallest Resolution after the first peak. Null when that value is not available. */
  minResolutionExcludingFirst: number | null;
  resolutionColumnFound: boolean;
  maxBackPressurePsi: number | null;
  pressureFound: boolean;
  pressureUnits: string | null;
  /** Pump-pressure series. Null when that section is missing or cannot be scaled. */
  pressureTrace: PressurePoint[] | null;
  chromatogram: ChromatogramPoint[] | null;
  chromatogramSectionName: string | null;
  /** Label for the vertical axis. */
  chromatogramYAxis: string;
  chromatogramMissingMessage: string | null;
};

const PEAK_SECTION = "Peak Table(Detector A)";
const PRESSURE_SECTION = "LC Status Trace(Pump A Pressure)";

export function readLabFile(input: string | ArrayBuffer | Uint8Array): LabFileRead {
  const blank = emptyRead();
  const text = labText(input).replace(/^\uFEFF/, "");
  if (!text.trim()) {
    return { ...blank, blockingMessage: "This file is empty." };
  }

  const delimiter = detectDelimiter(text);
  const sections = splitSections(text);
  if (sections.size === 0) {
    return {
      ...blank,
      blockingMessage:
        "This file could not be read. No labeled sections were found, so it does not look like a LabSolutions export.",
    };
  }

  const notes: string[] = [];
  const peakName =
    (sections.has(PEAK_SECTION) ? PEAK_SECTION : undefined) ??
    [...sections.keys()].find((name) => name.startsWith("Peak Table"));
  const peakLines = peakName ? sections.get(peakName) : undefined;
  if (!peakLines) {
    return {
      ...blank,
      blockingMessage: "The peak table (Detector A) is not in this file.",
    };
  }

  const peakTable = parseTable(peakLines, delimiter, ["Peak#", "R.Time"]);
  const peakCountRaw = metaGet(peakTable.meta, "# of Peaks");
  if (peakCountRaw == null || peakCountRaw.trim() === "") {
    return {
      ...blank,
      blockingMessage: "The peak table is missing the line “# of Peaks”.",
    };
  }
  const peakCount = Number(peakCountRaw.trim());
  if (!Number.isFinite(peakCount)) {
    return {
      ...blank,
      blockingMessage: "The peak table has a “# of Peaks” line, but the count is not a number.",
    };
  }

  if (!peakTable.headerFound) {
    return {
      ...blank,
      peakCount,
      blockingMessage: "The peak table is missing the Peak# header row.",
    };
  }

  const timeCol = columnIndex(peakTable.headers, "R.Time");
  if (timeCol < 0) {
    return {
      ...blank,
      peakCount,
      blockingMessage: "The peak table is missing the R.Time column.",
    };
  }

  const peakNumberCol = columnIndex(peakTable.headers, "Peak#");
  const peakRows = peakTable.rows.filter((row) => {
    if (peakNumberCol < 0) return row.some((cell) => cell.trim() !== "");
    return parseFileNumber(row[peakNumberCol] ?? "") != null;
  });

  if (peakRows.length !== peakCount) {
    notes.push(
      `The file says ${formatCount(peakCount)} peaks, but the table lists ${formatCount(peakRows.length)} peak rows.`,
    );
  }

  const areaCol = columnIndex(peakTable.headers, "Area");
  const heightCol = columnIndex(peakTable.headers, "Height");
  const peaks = peakRows.map((row) => ({
    timeMin: parseFileNumber(row[timeCol] ?? ""),
    area: areaCol < 0 ? null : parseFileNumber(row[areaCol] ?? ""),
    height: heightCol < 0 ? null : parseFileNumber(row[heightCol] ?? ""),
  }));
  const peakTimesMin = peaks
    .map((peak) => peak.timeMin)
    .filter((value): value is number => value != null);
  const firstPeakTimeMin = peakTimesMin[0] ?? null;
  const lastPeakTimeMin = peakTimesMin.length > 0 ? Math.max(...peakTimesMin) : null;
  if (lastPeakTimeMin == null) {
    notes.push("The peak table has no retention times in the R.Time column.");
  }

  const resolutionCol = columnIndex(peakTable.headers, "Resolution");
  let minResolutionExcludingFirst: number | null = null;
  if (resolutionCol < 0) {
    notes.push("The peak table is missing the Resolution column.");
  } else {
    const later = peakRows
      .slice(1)
      .map((row) => parseFileNumber(row[resolutionCol] ?? ""))
      .filter((value): value is number => value != null);
    if (later.length > 0) {
      minResolutionExcludingFirst = Math.min(...later);
    }
  }

  const pressure = readPressure(sections.get(PRESSURE_SECTION), delimiter, notes);
  const chromatogram = readChromatogram(sections, delimiter);

  return {
    blockingMessage: null,
    notes,
    peakCount,
    peakRowCount: peakRows.length,
    firstPeakTimeMin,
    peakTimesMin,
    peaks,
    areaColumnFound: areaCol >= 0,
    heightColumnFound: heightCol >= 0,
    lastPeakTimeMin,
    minResolutionExcludingFirst,
    resolutionColumnFound: resolutionCol >= 0,
    maxBackPressurePsi: pressure.maxPsi,
    pressureFound: pressure.found,
    pressureUnits: pressure.units,
    pressureTrace: pressure.trace,
    chromatogram: chromatogram.points,
    chromatogramSectionName: chromatogram.sectionName,
    chromatogramYAxis: chromatogram.yAxis,
    chromatogramMissingMessage: chromatogram.missingMessage,
  };
}

function labText(input: string | ArrayBuffer | Uint8Array): string {
  if (typeof input !== "string") {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (isXlsx(bytes)) return workbookToLabText(bytes);
  }
  return decodeLabText(input);
}

function isXlsx(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/** One sheet, cells in order. A section title in the first cell stays a [Section] line. */
function workbookToLabText(bytes: Uint8Array): string {
  const book = XLSX.read(bytes, { type: "array" });
  const sheetName = book.SheetNames[0];
  if (!sheetName) return "";
  const sheet = book.Sheets[sheetName];
  const ref = sheet["!ref"];
  if (!ref) return "";
  const range = XLSX.utils.decode_range(ref);
  const lines: string[] = [];
  for (let row = range.s.r; row <= range.e.r; row++) {
    const cells: string[] = [];
    let last = -1;
    for (let column = range.s.c; column <= range.e.c; column++) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
      const value = cellValue(cell);
      cells.push(value);
      if (value !== "") last = cells.length - 1;
    }
    if (last < 0) {
      lines.push("");
      continue;
    }
    const used = cells.slice(0, last + 1);
    if (used.length === 1 && /^\[[^[\]]+\]$/.test(used[0])) {
      lines.push(used[0]);
    } else {
      lines.push(used.map(csvCell).join(","));
    }
  }
  return lines.join("\n");
}

function cellValue(cell: XLSX.CellObject | undefined): string {
  if (!cell || cell.v == null) return "";
  if (typeof cell.v === "number") return String(cell.v);
  if (typeof cell.v === "boolean") return cell.v ? "TRUE" : "FALSE";
  return String(cell.v).trim();
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

export function decodeLabText(input: string | ArrayBuffer | Uint8Array): string {
  if (typeof input === "string") return input;
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes);
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes);
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }

  const sample = Math.min(bytes.length, 240);
  let zeroEven = 0;
  let zeroOdd = 0;
  for (let i = 0; i < sample; i++) {
    if (bytes[i] === 0) {
      if (i % 2 === 0) zeroEven += 1;
      else zeroOdd += 1;
    }
  }
  if (zeroOdd > sample * 0.2) return new TextDecoder("utf-16le").decode(bytes);
  if (zeroEven > sample * 0.2) return new TextDecoder("utf-16be").decode(bytes);
  return new TextDecoder("utf-8").decode(bytes);
}

function emptyRead(): LabFileRead {
  return {
    blockingMessage: null,
    notes: [],
    peakCount: null,
    peakRowCount: 0,
    firstPeakTimeMin: null,
    peakTimesMin: [],
    peaks: [],
    areaColumnFound: false,
    heightColumnFound: false,
    lastPeakTimeMin: null,
    minResolutionExcludingFirst: null,
    resolutionColumnFound: false,
    maxBackPressurePsi: null,
    pressureFound: false,
    pressureUnits: null,
    pressureTrace: null,
    chromatogram: null,
    chromatogramSectionName: null,
    chromatogramYAxis: "Absorbance",
    chromatogramMissingMessage: null,
  };
}

function formatCount(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}

export function detectDelimiter(text: string): "," | "\t" {
  const sample = text.slice(0, 16000);
  const tabs = sample.split("\t").length - 1;
  const commas = sample.split(",").length - 1;
  return tabs > commas ? "\t" : ",";
}

export function splitSections(text: string): Map<string, string[]> {
  const sections = new Map<string, string[]>();
  let current: string | null = null;
  for (const line of text.split(/\r?\n/)) {
    const header = /^\[([^[\]]+)\]$/.exec(line.trim());
    if (header) {
      current = header[1].trim();
      if (!sections.has(current)) sections.set(current, []);
      continue;
    }
    if (current) sections.get(current)!.push(line);
  }
  return sections;
}

type ParsedTable = {
  meta: Record<string, string>;
  headers: string[];
  rows: string[][];
  headerFound: boolean;
};

function parseTable(lines: string[], delimiter: "," | "\t", anchors: string[]): ParsedTable {
  let headerIndex = -1;
  let headers: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = splitRow(lines[i], delimiter);
    if (anchors.every((anchor) => columnIndex(cells, anchor) >= 0)) {
      headerIndex = i;
      headers = cells;
      break;
    }
  }

  const meta: Record<string, string> = {};
  const limit = headerIndex === -1 ? lines.length : headerIndex;
  for (let i = 0; i < limit; i++) {
    if (!lines[i].trim()) continue;
    const cells = splitRow(lines[i], delimiter);
    if (cells.length >= 2 && cells[0].trim()) {
      meta[cells[0].trim()] = cells.slice(1).join(delimiter).trim();
    }
  }

  const rows: string[][] = [];
  if (headerIndex !== -1) {
    for (let i = headerIndex + 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      rows.push(splitRow(lines[i], delimiter));
    }
  }

  return { meta, headers, rows, headerFound: headerIndex !== -1 };
}

function splitRow(line: string, delimiter: "," | "\t"): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

/** Spacing-only differences still match. Letters themselves must match. */
export function columnIndex(headers: string[], expected: string): number {
  const target = normalizeHeader(expected);
  return headers.findIndex((header) => normalizeHeader(header) === target);
}

function normalizeHeader(value: string): string {
  return value.trim().replace(/\s+/g, "");
}

function metaGet(meta: Record<string, string>, key: string): string | undefined {
  const target = normalizeHeader(key);
  for (const [name, value] of Object.entries(meta)) {
    if (normalizeHeader(name) === target) return value;
  }
  return undefined;
}

function parseFileNumber(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function readPressure(
  lines: string[] | undefined,
  delimiter: "," | "\t",
  notes: string[],
): { found: boolean; maxPsi: number | null; units: string | null; trace: PressurePoint[] | null } {
  if (!lines) {
    notes.push("The pressure trace (Pump A) is not in this file, so max back-pressure is not available.");
    return { found: false, maxPsi: null, units: null, trace: null };
  }

  const table = parseTable(lines, delimiter, ["R.Time (min)", "Intensity"]);
  const units = metaGet(table.meta, "Intensity Units") ?? null;
  if (units && units.trim().toLowerCase() !== "psi") {
    notes.push(`The pressure trace says its units are “${units.trim()}”, not psi.`);
  }

  const multiplierRaw = metaGet(table.meta, "Intensity Multiplier");
  const multiplier = multiplierRaw == null ? null : parseFileNumber(multiplierRaw);
  if (multiplier == null) {
    notes.push(
      "The pressure trace is missing its intensity multiplier, so back-pressure could not be worked out.",
    );
    return { found: true, maxPsi: null, units, trace: null };
  }

  if (!table.headerFound) {
    notes.push("The pressure trace is missing the time and intensity columns.");
    return { found: true, maxPsi: null, units, trace: null };
  }

  const timeCol = columnIndex(table.headers, "R.Time (min)");
  const intensityCol = columnIndex(table.headers, "Intensity");
  const intensities = table.rows
    .map((row) => parseFileNumber(row[intensityCol] ?? ""))
    .filter((value): value is number => value != null);
  const trace: PressurePoint[] = [];
  for (const row of table.rows) {
    const timeMin = parseFileNumber(row[timeCol] ?? "");
    const raw = parseFileNumber(row[intensityCol] ?? "");
    if (timeMin == null || raw == null) continue;
    trace.push({ timeMin, pressure: raw * multiplier });
  }
  if (intensities.length === 0 || trace.length === 0) {
    notes.push("The pressure trace has no intensity points.");
    return { found: true, maxPsi: null, units, trace: null };
  }

  const maxRaw = Math.max(...intensities);
  return { found: true, maxPsi: maxRaw * multiplier, units, trace };
}

function readChromatogram(
  sections: Map<string, string[]>,
  delimiter: "," | "\t",
): {
  sectionName: string | null;
  points: ChromatogramPoint[] | null;
  yAxis: string;
  missingMessage: string | null;
} {
  const sectionName =
    [...sections.keys()].find(
      (name) => name.includes("Chromatogram") && name.includes("Detector A"),
    ) ??
    [...sections.keys()].find((name) => name.includes("Chromatogram")) ??
    null;

  if (!sectionName) {
    return {
      sectionName: null,
      points: null,
      yAxis: "Absorbance",
      missingMessage:
        "The picture could not be drawn because the chromatogram (Detector A) was not in this file.",
    };
  }

  const table = parseTable(sections.get(sectionName) ?? [], delimiter, [
    "R.Time (min)",
    "Intensity",
  ]);
  const units = metaGet(table.meta, "Intensity Units")?.trim() ?? "";
  const multiplierRaw = metaGet(table.meta, "Intensity Multiplier");
  const multiplier = multiplierRaw == null ? null : parseFileNumber(multiplierRaw);
  const yAxis = units || "Absorbance";
  const applyMultiplier = multiplier != null && isAbsorbanceUnit(units);

  if (!table.headerFound) {
    return {
      sectionName,
      points: null,
      yAxis,
      missingMessage:
        "The picture could not be drawn because the chromatogram is missing the time or intensity column.",
    };
  }

  const timeCol = columnIndex(table.headers, "R.Time (min)");
  const intensityCol = columnIndex(table.headers, "Intensity");
  const points: ChromatogramPoint[] = [];
  for (const row of table.rows) {
    const timeMin = parseFileNumber(row[timeCol] ?? "");
    const raw = parseFileNumber(row[intensityCol] ?? "");
    if (timeMin == null || raw == null) continue;
    points.push({
      timeMin,
      intensity: applyMultiplier ? raw * multiplier : raw,
    });
  }

  if (points.length === 0) {
    return {
      sectionName,
      points: null,
      yAxis,
      missingMessage:
        "The picture could not be drawn because the chromatogram has no time and intensity points.",
    };
  }

  return { sectionName, points, yAxis, missingMessage: null };
}

/**
 * mAU, AU, and the word absorbance all count. The multiplier in the file
 * converts the stored numbers into those units. It is never invented.
 */
function isAbsorbanceUnit(units: string): boolean {
  const token = units.trim().toLowerCase().replace(/\s+/g, "");
  if (!token) return false;
  if (token.includes("absorbance")) return true;
  return /^(m|u|µ|μ)?au$/.test(token);
}
