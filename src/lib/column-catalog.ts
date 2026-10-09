import * as XLSX from "xlsx";

/**
 * One physical column from the workbook: a coating plus the sizes on that row.
 * Two PFPP columns with different lengths stay separate.
 */
export type ColumnSpec = {
  coating: string;
  product: string;
  lengthMm: number;
  diameterMm: number;
  particleUm: number;
  /** Angstroms, when the sheet name includes a pore such as 200A. */
  poreA: number | null;
  label: string;
};

const CANONICAL = ["C18", "C18aq", "PFPP", "C8", "biphenyl", "IBD"];

const PHASE_SHEETS: Record<string, string> = {
  c18: "C18",
  c8: "C8",
  c18aq: "C18aq",
  ibd: "IBD",
  pfpp: "PFPP",
  bip: "biphenyl",
};

export function columnKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

export function columnsFromWorkbook(workbook: XLSX.WorkBook): ColumnSpec[] {
  const found: ColumnSpec[] = [];
  for (const sheetName of workbook.SheetNames) {
    const phase = PHASE_SHEETS[sheetName.trim().toLowerCase()];
    if (phase) collectPhaseSheet(found, workbook.Sheets[sheetName], phase);
  }
  const other = workbook.Sheets["Other columns"];
  if (other) collectOtherSheet(found, other);
  return uniqueColumns(found);
}

/** Coatings still in Settings, in the selectivity order, then any other coating. */
export function coatingsFromColumns(columns: readonly ColumnSpec[]): string[] {
  const present = new Set(columns.map((column) => column.coating));
  const ordered = CANONICAL.filter((name) => present.has(name));
  const extra = [...present].filter((name) => !CANONICAL.includes(name)).sort((left, right) => left.localeCompare(right));
  return [...ordered, ...extra];
}

export type SizeField = "coating" | "lengthMm" | "diameterMm" | "particleUm" | "poreA";

export type SizePick = {
  coating: string;
  lengthMm: string;
  diameterMm: string;
  particleUm: string;
  poreA: string;
};

/** Values of one size that still exist on a column matching the other chosen sizes. */
export function sizeChoices(columns: readonly ColumnSpec[], pick: SizePick, field: SizeField): string[] {
  const values = new Set<string>();
  for (const column of columns) {
    if (!matchesOther(column, pick, field)) continue;
    const value = fieldValue(column, field);
    if (value) values.add(value);
  }
  return [...values].sort(compareSize);
}

/** Keep the chosen sizes when they still match a column. Clear a size that no longer does. */
export function applySizeChoice(columns: readonly ColumnSpec[], pick: SizePick, field: SizeField, value: string): SizePick {
  const next: SizePick = { ...pick, [field]: value };
  const order: SizeField[] = ["coating", "lengthMm", "diameterMm", "particleUm", "poreA"];
  for (const other of order) {
    if (other === field || !next[other]) continue;
    if (!sizeChoices(columns, next, other).includes(next[other])) next[other] = "";
  }
  return next;
}

export function parseColumnSpec(raw: string): ColumnSpec | null {
  const text = raw.trim().replace(/\s+/g, " ");
  const match = text.match(
    /^(.+?),\s*(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)\s*mm,\s*(\d+(?:\.\d+)?)\s*(?:µm|μm|um)(?:\s*,\s*(\d+(?:\.\d+)?)\s*(?:Å|A))?$/i,
  );
  if (!match) return null;
  const named = splitCoating(match[1]);
  return specFrom(named.coating, named.product, Number(match[2]), Number(match[3]), Number(match[4]), match[5] ? Number(match[5]) : null);
}

function collectPhaseSheet(found: ColumnSpec[], sheet: XLSX.WorkSheet, coating: string) {
  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, defval: "" });
  const header = rows.find((row) => hasHeaders(row));
  if (!header) return;
  const nameAt = headerIndex(header, "Name");
  const lengthAt = headerIndex(header, "Length");
  const diameterAt = headerIndex(header, "Diameter");
  const particleAt = headerIndex(header, "Particle size");
  for (const row of rows) {
    if (row === header) continue;
    const product = brandClean(String(row[nameAt] ?? ""));
    if (!product || isJunk(product) || /^sum of columns$/i.test(product)) continue;
    const lengthMm = asNumber(row[lengthAt]);
    const diameterMm = asNumber(row[diameterAt]);
    const particleUm = asNumber(row[particleAt]);
    if (lengthMm == null || diameterMm == null || particleUm == null) continue;
    const poreA = poreInName(product);
    const built = specFrom(coating, product, lengthMm, diameterMm, particleUm, poreA);
    if (built) found.push(built);
  }
}

function collectOtherSheet(found: ColumnSpec[], sheet: XLSX.WorkSheet) {
  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, defval: "" });
  for (const row of rows.slice(1)) {
    const maker = brandClean(String(row[0] ?? ""));
    const name = brandClean(String(row[1] ?? ""));
    if (!name || isJunk(name)) continue;
    const lengthMm = asNumber(row[2]);
    const diameterMm = asNumber(row[3]);
    const particleUm = asNumber(row[4]);
    if (lengthMm == null || diameterMm == null || particleUm == null) continue;
    const named = splitCoating(name);
    const product = named.product || maker;
    const built = specFrom(named.coating, product, lengthMm, diameterMm, particleUm, poreInName(name));
    if (built) found.push(built);
  }
}

function specFrom(
  coating: string,
  product: string,
  lengthMm: number,
  diameterMm: number,
  particleUm: number,
  poreA: number | null,
): ColumnSpec | null {
  const phase = normalizePhaseWords(coating);
  const line = brandClean(normalizePhaseWords(product));
  if (!phase || isJunk(phase)) return null;
  if (!(lengthMm > 0) || !(diameterMm > 0) || !(particleUm > 0)) return null;
  const shownProduct = line && columnKey(line) !== columnKey(phase) ? line : "";
  const label = columnLabel(phase, shownProduct, lengthMm, diameterMm, particleUm, poreA);
  return { coating: phase, product: shownProduct, lengthMm, diameterMm, particleUm, poreA, label };
}

export function columnLabel(
  coating: string,
  product: string,
  lengthMm: number,
  diameterMm: number,
  particleUm: number,
  poreA: number | null,
): string {
  const who = product ? `${product} ${coating}` : coating;
  const size = `${formatSize(lengthMm)} × ${formatSize(diameterMm)} mm, ${formatSize(particleUm)} µm`;
  return poreA == null ? `${who}, ${size}` : `${who}, ${size}, ${formatSize(poreA)} Å`;
}

function matchesOther(column: ColumnSpec, pick: SizePick, field: SizeField): boolean {
  if (field !== "coating" && pick.coating && column.coating !== pick.coating) return false;
  if (field !== "lengthMm" && pick.lengthMm && !sameNumber(column.lengthMm, pick.lengthMm)) return false;
  if (field !== "diameterMm" && pick.diameterMm && !sameNumber(column.diameterMm, pick.diameterMm)) return false;
  if (field !== "particleUm" && pick.particleUm && !sameNumber(column.particleUm, pick.particleUm)) return false;
  if (field !== "poreA" && pick.poreA && !sameNumber(column.poreA ?? Number.NaN, pick.poreA)) return false;
  return true;
}

function fieldValue(column: ColumnSpec, field: SizeField): string {
  if (field === "coating") return column.coating;
  if (field === "lengthMm") return formatSize(column.lengthMm);
  if (field === "diameterMm") return formatSize(column.diameterMm);
  if (field === "particleUm") return formatSize(column.particleUm);
  return column.poreA == null ? "" : formatSize(column.poreA);
}

function compareSize(left: string, right: string): number {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber !== rightNumber) return leftNumber - rightNumber;
  return left.localeCompare(right);
}

function uniqueColumns(found: ColumnSpec[]): ColumnSpec[] {
  const order = new Map(CANONICAL.map((name, index) => [name, index]));
  const seen = new Set<string>();
  const unique: ColumnSpec[] = [];
  for (const column of found) {
    const key = columnKey(column.label);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(column);
  }
  unique.sort((left, right) => {
    const leftOrder = order.get(left.coating) ?? 100;
    const rightOrder = order.get(right.coating) ?? 100;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return left.label.localeCompare(right.label);
  });
  return unique;
}

function splitCoating(value: string): { coating: string; product: string } {
  const text = normalizePhaseWords(value);
  const match = text.match(/^(.*?)(?:\s+)?(C18aq|C18|C8|PFPP|biphenyl|IBD|Phenyl|CN)$/);
  if (!match) return { coating: text, product: "" };
  return { coating: match[2], product: match[1].trim() };
}

function poreInName(value: string): number | null {
  const match = value.match(/(\d+(?:\.\d+)?)\s*A\b/i);
  if (!match) return null;
  const pore = Number(match[1]);
  return pore > 0 ? pore : null;
}

function hasHeaders(row: readonly (string | number)[]): boolean {
  const cells = row.map((cell) => String(cell).trim().toLowerCase());
  return cells.includes("name") && cells.includes("length") && cells.includes("diameter") && cells.includes("particle size");
}

function headerIndex(row: readonly (string | number)[], name: string): number {
  return row.findIndex((cell) => String(cell).trim().toLowerCase() === name.toLowerCase());
}

function asNumber(value: string | number | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value ?? "").trim();
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function sameNumber(left: number, right: string): boolean {
  const number = Number(right);
  return Number.isFinite(number) && Math.abs(left - number) < 1e-9;
}

function formatSize(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(value);
}

function cleanSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizePhaseWords(value: string): string {
  let text = cleanSpaces(value);
  text = text.replace(/pinaccle/gi, "Pinnacle");
  text = text.replace(/flourophenyl/gi, "PFPP");
  text = text.replace(/\bfluorophenyl\b/gi, "PFPP");
  text = text.replace(/\bpfp\b/gi, "PFPP");
  text = text.replace(/\bpfpp\b/gi, "PFPP");
  text = text.replace(/\bbiph\b/gi, "biphenyl");
  text = text.replace(/\bbiphenyl\b/gi, "biphenyl");
  text = text.replace(/\bc18aq\b/gi, "C18aq");
  text = text.replace(/\baq\s+c18\b/gi, "C18aq");
  text = text.replace(/\bc18\s*aq\b/gi, "C18aq");
  text = text.replace(/\bC18\b/g, "C18");
  text = text.replace(/\bC8\b/g, "C8");
  text = text.replace(/\bIBD\b/gi, "IBD");
  text = text.replace(/\bphenyl\b/gi, "Phenyl");
  return cleanSpaces(text);
}

function isJunk(value: string): boolean {
  const low = value.toLowerCase();
  if (!value || value.length > 80) return true;
  if (/https?:/i.test(value)) return true;
  if (["name", "length", "diameter", "code", "serial numbers", "particle size", "column 1", "column 2", "ref #"].includes(low)) {
    return true;
  }
  if (low.includes("rules") || low.includes("different columns") || low.includes("same columns")) return true;
  if (low.startsWith("sum of") || low.includes("<--") || low === "longer column" || low === "found" || low === "ma" || low === "broken") {
    return true;
  }
  return false;
}

function brandClean(value: string): string {
  return cleanSpaces(value).replace(/\s+NEW$/i, "").replace(/\s+OLD$/i, "").replace(/pinaccle/gi, "Pinnacle");
}
