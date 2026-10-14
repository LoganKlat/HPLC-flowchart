import { isUltraColumn, type ColumnSpec } from "@/lib/column-catalog";
import { formatPercentB } from "@/lib/retention";
import type { RunDetails } from "@/lib/run-details";
import { LIGANDS, SOLVENTS } from "@/lib/selectivity";
import { SHEET_COLUMNS } from "@/lib/sheet-columns";

export const FILE_NAME_EXAMPLE =
  "GR09-05-3-ACN-3-ISO-90-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254";

/** Short label beside the Run 1 checkbox. The pattern lives in the note. */
export const FILE_NAME_CHECKBOX_LABEL = "Check this box to autofill details from file name.";

/** Opened from the control next to the checkbox. One real name, broken into its pieces. */
export const FILE_NAME_STRUCTURE_NOTE =
  "Structure must be group number-injection number-HPLC number-solvent-pH-method-%B-flow rate-injection volume-sample type-sample concentration-ligand-length x diameter x particle size-oven temperature-wavelength. For example, " +
  FILE_NAME_EXAMPLE +
  ".";

export const FILE_NAME_MISMATCH = "This file name does not follow naming conventions.";

export type FilenameParse =
  | { ok: true; fields: Partial<RunDetails> }
  | { ok: false; message: string };

const LIGAND_NAMES = new Map<string, (typeof LIGANDS)[number]>(
  LIGANDS.map((name) => [name.toLowerCase(), name]),
);
LIGAND_NAMES.set("c18aqp", "C18aq");
LIGAND_NAMES.set("biphp", "biphenyl");
LIGAND_NAMES.set("bipp", "biphenyl");
LIGAND_NAMES.set("biph", "biphenyl");
LIGAND_NAMES.set("bip", "biphenyl");
LIGAND_NAMES.set("c18p", "C18");
LIGAND_NAMES.set("c8p", "C8");
LIGAND_NAMES.set("pfppp", "PFPP");
LIGAND_NAMES.set("ibdp", "IBD");
LIGAND_NAMES.set("c18r", "C18");
LIGAND_NAMES.set("biphr", "biphenyl");
LIGAND_NAMES.set("bipr", "biphenyl");
LIGAND_NAMES.set("pfppr", "PFPP");
LIGAND_NAMES.set("c18f", "C18");
LIGAND_NAMES.set("biphf", "biphenyl");
LIGAND_NAMES.set("bipf", "biphenyl");
LIGAND_NAMES.set("pfppf", "PFPP");

/** File-name tokens that parse back through LIGAND_NAMES. */
const LIGAND_FILE_TOKENS = new Map<string, string>([
  ["c18aq", "C18aqP"],
  ["biphenyl", "BiphP"],
  ["c18", "C18"],
  ["pfpp", "PFPP"],
  ["c8", "C8"],
  ["ibd", "IBD"],
]);

export function parseRunFileName(fileName: string): FilenameParse {
  for (const stem of nameStems(fileName)) {
    const parsed = parseStem(stem);
    if (parsed) return { ok: true, fields: parsed };
  }
  return { ok: false, message: FILE_NAME_MISMATCH };
}

/** Fields a file name can set. A new name replaces these, including ones it leaves blank. */
const FILE_NAME_DETAIL_KEYS = [
  "solvent",
  "ph",
  "method",
  "percentB",
  "flowRate",
  "injectionVolume",
  "sampleType",
  "sampleConcentration",
  "ligand",
  "coreShell",
  "poreSize",
  "carbonLoad",
  "lengthMm",
  "diameterMm",
  "particleSize",
  "temperature",
  "wavelength",
] as const satisfies readonly (keyof RunDetails)[];

/**
 * Autofill is on. A name that matches replaces the file-name fields.
 * A name that does not match leaves the current details and returns the mismatch note.
 */
export function detailsFromFileName(
  current: RunDetails,
  fileName: string,
): { ok: true; details: RunDetails } | { ok: false; details: RunDetails; note: string } {
  const parsed = parseRunFileName(fileName);
  if (!parsed.ok) return { ok: false, details: current, note: parsed.message };
  const details: RunDetails = { ...current };
  for (const key of FILE_NAME_DETAIL_KEYS) {
    Object.assign(details, { [key]: parsed.fields[key] ?? "" });
  }
  return { ok: true, details };
}

/**
 * The autofill checkbox is the only switch for this.
 * Off leaves the current details alone, including a recommended %B the name does not match.
 */
export function detailsFromFileNameIfEnabled(
  current: RunDetails,
  fileName: string,
  enabled: boolean,
): { apply: true; details: RunDetails; note: null } | { apply: false; details: RunDetails; note: string | null } {
  if (!enabled) return { apply: false, details: current, note: null };
  const parsed = detailsFromFileName(current, fileName);
  if (!parsed.ok) return { apply: false, details: current, note: parsed.note };
  return { apply: true, details: parsed.details, note: null };
}

function nameStems(fileName: string): string[] {
  const trimmed = fileName.trim();
  const base = trimmed.replace(/^.*[/\\]/, "");
  const seeds = base === trimmed ? [trimmed] : [trimmed, base];
  return seeds.flatMap((seed) => stemVariants(seed));
}

function stemVariants(seed: string): string[] {
  const stem = seed.replace(/\.(csv|txt|xlsx)$/i, "");
  const stems = [stem];
  for (const peeled of peelNameSuffixes(stem)) {
    if (!stems.includes(peeled)) stems.push(peeled);
  }
  return stems.flatMap((value) => {
    const parts = splitPieces(value);
    if (parts.at(-1)?.toLowerCase() === "good" && parts.length > 1) {
      return [value, parts.slice(0, -1).join("-")];
    }
    return [value];
  });
}

/**
 * Drop an upload hash, then a Windows copy marker.
 * `name (1).xlsx` and `name_1__ab12.xlsx` are the same run as `name`.
 * The copy number is not the injection number.
 */
function peelNameSuffixes(stem: string): string[] {
  const peeled: string[] = [];
  let current = stem;
  for (let i = 0; i < 4; i++) {
    const next = current
      .replace(/\s*\(\d+\)$/, "")
      .replace(/_[A-Za-z0-9]+$/, "")
      .replace(/_+\d+_+$/, "");
    if (next === current) break;
    peeled.push(next);
    current = next;
  }
  return peeled;
}

function parseStem(stem: string): Partial<RunDetails> | null {
  const parts = splitPieces(stem);
  if (parts.length === 15) return parseFull(parts);
  if (parts.length === 3) return parseShort(parts, null);
  if (parts.length === 4) {
    const oven = ovenText(parts[3]);
    if (!oven) return null;
    return parseShort(parts.slice(0, 3), oven);
  }
  return null;
}

function splitPieces(stem: string): string[] {
  return stem.split("-").map((piece) => piece.trim());
}

function parseShort(parts: string[], oven: string | null): Partial<RunDetails> | null {
  if (!isGroup(parts[0]) || !isDigits(parts[1]) || !isNumber(parts[2])) return null;
  const fields: Partial<RunDetails> = {
    percentB: parts[2],
  };
  if (oven) fields.temperature = oven;
  return fields;
}

function parseFull(parts: string[]): Partial<RunDetails> | null {
  const [group, injection, hplc, solvent, ph, method, percentB, flow, injectionVolume, sampleType, concentration, ligand, dimensions, oven, wavelength] = parts;
  const size = dimensions.match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)(?:u|um|µm|μm)?$/i);
  const temperature = ovenText(oven);
  if (
    !isGroup(group) ||
    !isDigits(injection) ||
    !isDigits(hplc) ||
    !/^[A-Za-z]+$/.test(solvent) ||
    !numericValue(ph) ||
    !/^[A-Za-z]+$/.test(method) ||
    !numericValue(percentB) ||
    !numericValue(flow) ||
    !numericValue(injectionVolume) ||
    !/^[A-Za-z]+$/.test(sampleType) ||
    !numericValue(concentration) ||
    !/^[A-Za-z0-9]+$/.test(ligand) ||
    !size ||
    !temperature ||
    !isDigits(wavelength)
  ) {
    return null;
  }

  const fields: Partial<RunDetails> = {
    ph: numericValue(ph)!,
    percentB: numericValue(percentB)!,
    flowRate: numericValue(flow)!,
    injectionVolume: numericValue(injectionVolume)!,
    sampleConcentration: numericValue(concentration)!,
    lengthMm: size[1],
    diameterMm: size[2],
    particleSize: size[3],
    temperature,
    wavelength,
  };
  const methodName = methodLabel(method);
  if (methodName) fields.method = methodName;
  const sample = sampleTypeLabel(sampleType);
  if (sample) fields.sampleType = sample;
  const solventLabel = solventLabelFor(solvent);
  if (solventLabel) fields.solvent = solventLabel;
  const ligandName = LIGAND_NAMES.get(ligand.toLowerCase());
  if (ligandName) {
    fields.ligand = ligandName;
    const specs = matchColumnSpecs(ligand, ligandName, size[1], size[2], size[3]);
    if (specs) {
      fields.coreShell = specs.coreShell;
      fields.poreSize = specs.poreSize;
      fields.carbonLoad = specs.carbonLoad;
    }
  }
  return fields;
}

function matchColumnSpecs(
  rawLigand: string,
  ligandName: string,
  lengthMm: string,
  diameterMm: string,
  particleSize: string,
): Pick<RunDetails, "coreShell" | "poreSize" | "carbonLoad"> | null {
  const len = Number(lengthMm);
  const dia = Number(diameterMm);
  const part = Number(particleSize);
  const available = SHEET_COLUMNS.filter((col) => !isUltraColumn(col) && col.coating === ligandName);
  const sized = available.filter(
    (col) =>
      Math.abs(col.lengthMm - len) < 1e-6 &&
      Math.abs(col.diameterMm - dia) < 1e-6 &&
      Math.abs(col.particleUm - part) < 1e-6,
  );
  const pool: ColumnSpec[] = sized.length > 0 ? sized : available;
  if (pool.length === 0) return null;
  const low = rawLigand.toLowerCase();
  const wantsPinnacle = low !== "pfpp" && low.endsWith("p");
  const wantsRaptor = low.endsWith("r");
  const wantsForce = low.endsWith("f");
  const chosen =
    (wantsPinnacle ? pool.find((col) => /pinnacle/i.test(col.product)) : undefined) ??
    (wantsRaptor ? pool.find((col) => /raptor/i.test(col.product)) : undefined) ??
    (wantsForce ? pool.find((col) => /force/i.test(col.product)) : undefined) ??
    pool.find((col) => /pinnacle/i.test(col.product)) ??
    pool[0];
  return {
    coreShell: chosen.coreShell,
    poreSize: String(chosen.poreA),
    carbonLoad: String(chosen.carbonLoad),
  };
}

function methodLabel(token: string): "GRA" | "ISO" | null {
  if (/^gra$/i.test(token)) return "GRA";
  if (/^iso$/i.test(token)) return "ISO";
  return null;
}

function sampleTypeLabel(token: string): "CP" | "BLANK" | null {
  if (/^cp$/i.test(token)) return "CP";
  if (/^(?:blank|blk)$/i.test(token)) return "BLANK";
  return null;
}

function solventLabelFor(token: string): string | null {
  const found = SOLVENTS.find(
    (solvent) => solvent.label.toLowerCase() === token.toLowerCase() || solvent.aliases.includes(token.toLowerCase()),
  );
  return found?.label ?? null;
}

function ovenText(token: string): string | null {
  const cleaned = token.trim().replace(/\s+/g, "").replace(/°/g, "");
  if (/^(amb|ambient)$/i.test(cleaned)) return "ambient";
  const prefixed = cleaned.match(/^t(\d+(?:\.\d+)?)c?$/i);
  if (prefixed) return prefixed[1];
  const degrees = cleaned.match(/^(\d+(?:\.\d+)?)c?$/i);
  if (!degrees) return null;
  return degrees[1];
}

/** Leading number, with a unit such as u, µL, or mL/min left off the stored value. */
function numericValue(token: string): string | null {
  const compact = token.trim().replace(/\s+/g, "");
  const match = compact.match(/^(\d+(?:\.\d+)?)(.*)$/);
  if (!match) return null;
  const rest = match[2];
  if (rest === "" || /^(?:u|ul|µl|μl|ml\/min|%)$/i.test(rest)) return match[1];
  return null;
}

function isGroup(value: string): boolean {
  return /^[A-Za-z]+\d+$/.test(value);
}

function isDigits(value: string): boolean {
  return /^\d+$/.test(value);
}

function isNumber(value: string): boolean {
  return /^\d+(?:\.\d+)?$/.test(value);
}

type RunIdentity = { group: string; injection: string; hplc: string | null };

/** Group, injection, and HPLC from the latest file name. A short name has no HPLC number. */
export function identityFromFileName(fileName: string | null | undefined): RunIdentity | null {
  if (!fileName?.trim()) return null;
  const stems = nameStems(fileName);
  for (const stem of stems) {
    const parts = splitPieces(stem);
    if (parts.length >= 15 && isGroup(parts[0]) && isDigits(parts[1]) && isDigits(parts[2])) {
      return { group: parts[0], injection: parts[1], hplc: parts[2] };
    }
  }
  for (const stem of stems) {
    const parts = splitPieces(stem);
    if ((parts.length === 3 || parts.length === 4) && isGroup(parts[0]) && isDigits(parts[1])) {
      return { group: parts[0], injection: parts[1], hplc: null };
    }
  }
  return null;
}

/**
 * Extracts the run's injection number as an integer from the file name
 * (or optionally inspects text/CSV content if the file name lacks it).
 * Returns null if no injection number can be determined.
 */
export function parseInjectionNumber(fileName: string, content?: string | ArrayBuffer): number | null {
  const fromString = (str: string): number | null => {
    const trimmed = str.trim();
    if (!trimmed) return null;

    // 1. Check standard identity from name
    const id = identityFromFileName(trimmed);
    if (id && id.injection) {
      const num = Number(id.injection);
      if (Number.isFinite(num) && num > 0) return Math.floor(num);
    }

    const base = trimmed.replace(/^.*[/\\]/, "").replace(/\.(csv|txt|xlsx)$/i, "");

    // 2. Explicit injection or run patterns:
    // e.g. "inj_05", "inj-5", "inj 5", "inj05", "injection_05", "run_05", "run-5", "run 5", "run05"
    const explicitMatch = base.match(/(?:^|[\s_\-./])(?:inj(?:ection)?|run)[\s_\-.:]*(\d+)/i);
    if (explicitMatch) {
      const num = Number(explicitMatch[1]);
      if (Number.isFinite(num) && num > 0) return Math.floor(num);
    }

    // 3. Group-injection pattern: e.g. "GR09_05", "GR09 05", "Group1-Inj2", "G02-04"
    const groupMatch = base.match(/(?:^|[\s_\-./])[A-Za-z]+\d*[\s_\-](\d+)/i);
    if (groupMatch) {
      const num = Number(groupMatch[1]);
      if (Number.isFinite(num) && num > 0) return Math.floor(num);
    }

    // 4. Leading number pattern: e.g. "05_chromatogram", "05-run", "5"
    const leadingMatch = base.match(/^(\d+)[\s_\-.](?!\d)/);
    if (leadingMatch) {
      const num = Number(leadingMatch[1]);
      // Exclude typical wavelength ranges (e.g. 190-400 nm) or year numbers
      if (Number.isFinite(num) && num > 0 && num < 200) return Math.floor(num);
    }

    return null;
  };

  const fromName = fromString(fileName);
  if (fromName != null) return fromName;

  if (content) {
    let text = "";
    if (typeof content === "string") {
      text = content.slice(0, 4096);
    } else if (content instanceof ArrayBuffer) {
      try {
        const slice = content.slice(0, 4096);
        text = new TextDecoder("utf-8", { fatal: false }).decode(slice);
      } catch {
        // ignore
      }
    }

    if (text) {
      const dataFileMatch = text.match(/Data File Name[,\t:= ]+([^\r\n]+)/i);
      if (dataFileMatch) {
        const val = dataFileMatch[1].trim();
        const base = val.replace(/^.*[/\\]/, "");
        const num = fromString(base) ?? fromString(val);
        if (num != null) return num;
      }

      const sampleNameMatch = text.match(/Sample Name[,\t:= ]+([^\r\n]+)/i);
      if (sampleNameMatch) {
        const val = sampleNameMatch[1].trim();
        const base = val.replace(/^.*[/\\]/, "");
        const num = fromString(base) ?? fromString(val);
        if (num != null) return num;
      }

      const injLineMatch = text.match(/(?:Injection(?: Number)?|Inj(?:[\s.]*No)?)[,\t:= ]+(\d+)/i);
      if (injLineMatch) {
        const num = Number(injLineMatch[1]);
        if (Number.isFinite(num) && num > 0) return Math.floor(num);
      }
    }
  }

  return null;
}

/**
 * Sorts an array of items by their parsed injection number in ascending order.
 * Items with an injection number come first, sorted numerically.
 * Items without an injection number retain their original relative order at the end.
 */
export function sortFilesByInjection<T extends { fileName: string; buffer?: ArrayBuffer | string }>(
  files: readonly T[],
): T[] {
  const decorated = files.map((file, originalIndex) => ({
    file,
    originalIndex,
    injection: parseInjectionNumber(file.fileName, file.buffer),
  }));

  decorated.sort((a, b) => {
    if (a.injection != null && b.injection != null) {
      if (a.injection !== b.injection) return a.injection - b.injection;
      return a.originalIndex - b.originalIndex;
    }
    if (a.injection != null && b.injection == null) return -1;
    if (a.injection == null && b.injection != null) return 1;
    return a.originalIndex - b.originalIndex;
  });

  return decorated.map((d) => d.file);
}

function nextInjection(raw: string): string {
  const value = Number(raw) + 1;
  const text = String(value);
  return text.length >= raw.length ? text : text.padStart(raw.length, "0");
}

function plainNumber(raw: string, fallback: string): string {
  const match = raw.trim().replace(/%$/, "").match(/(\d+(?:\.\d+)?)/);
  if (!match) return fallback;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return fallback;
  return Number.isInteger(value) ? String(value) : String(value);
}

function lettersToken(raw: string, fallback: string): string {
  const letters = raw.trim().match(/[A-Za-z]+/g)?.join("") ?? "";
  return letters || fallback;
}

function ligandToken(raw: string): string {
  const key = raw.trim().toLowerCase();
  if (!key) return "NA";
  return LIGAND_FILE_TOKENS.get(key) ?? lettersToken(raw, "NA");
}

function temperatureToken(raw: string): string {
  const cleaned = raw.trim().replace(/\s+/g, "").replace(/°/g, "");
  if (!cleaned || /^(amb|ambient)$/i.test(cleaned)) return "amb";
  const numbered = cleaned.match(/^t?(\d+(?:\.\d+)?)c?$/i);
  return numbered ? `T${plainNumber(numbered[1], numbered[1])}` : "amb";
}

/**
 * The file name for the run that has not been done yet.
 * Group and HPLC stay from the latest file. Injection is one higher.
 * The other pieces are the next run’s own details.
 */
export function nextRunFileName(latestFileName: string | null | undefined, next: RunDetails): string {
  const identity = identityFromFileName(latestFileName);
  const group = identity?.group ?? "GR";
  const injection = identity ? nextInjection(identity.injection) : "01";
  const hplc = identity?.hplc ?? "1";
  const pieces = [
    group,
    injection,
    hplc,
    lettersToken(next.solvent, "NA"),
    plainNumber(next.ph, "0"),
    lettersToken(next.method, "NA"),
    percentToken(next.percentB),
    plainNumber(next.flowRate, "0"),
    `${plainNumber(next.injectionVolume, "0")}u`,
    lettersToken(next.sampleType, "NA"),
    plainNumber(next.sampleConcentration, "0"),
    ligandToken(next.ligand),
    `${plainNumber(next.lengthMm, "0")}x${plainNumber(next.diameterMm, "0")}x${plainNumber(next.particleSize, "0")}`,
    temperatureToken(next.temperature),
    plainNumber(next.wavelength, "0"),
  ];
  return pieces.join("-");
}

/** %B in the name uses the same rounding as the rest of the page. A blank %B is 0. */
function percentToken(raw: string): string {
  const parsed = plainNumber(raw, "0");
  const value = Number(parsed);
  if (!Number.isFinite(value)) return "0";
  return formatPercentB(value);
}

/**
 * Copy name is only for a finished next-run name.
 * Before a solvent is picked, the solvent piece is NA and %B is 0.
 */
export function copyableNextRunFileName(latestFileName: string | null | undefined, next: RunDetails): string | null {
  const name = nextRunFileName(latestFileName, next);
  return nextFileNameIsCopyable(name) ? name : null;
}

export function nextFileNameIsCopyable(name: string): boolean {
  const pieces = name.split("-");
  if (pieces.length < 15) return false;
  const solvent = pieces[3] ?? "";
  const percent = Number(pieces[6]);
  if (!solvent || solvent.toUpperCase() === "NA") return false;
  if (!Number.isFinite(percent) || percent === 0) return false;
  return true;
}
