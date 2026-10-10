import { formatPercentB } from "@/lib/retention";
import type { RunDetails } from "@/lib/run-details";
import { LIGANDS, SOLVENTS } from "@/lib/selectivity";

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
  const details = { ...current };
  for (const key of FILE_NAME_DETAIL_KEYS) {
    details[key] = parsed.fields[key] ?? "";
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
  let stem = seed.replace(/\.(csv|txt|xlsx)$/i, "");
  stem = stem.replace(/\s+\(\d+\)$/, "");
  const stems = [stem];
  const withoutUploadSuffix = stem.replace(/_[A-Za-z0-9]+$/, "");
  if (withoutUploadSuffix !== stem) stems.push(withoutUploadSuffix);
  return stems.flatMap((value) => {
    const parts = splitPieces(value);
    if (parts.at(-1)?.toLowerCase() === "good" && parts.length > 1) {
      return [value, parts.slice(0, -1).join("-")];
    }
    return [value];
  });
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
  if (ligandName) fields.ligand = ligandName;
  return fields;
}

function methodLabel(token: string): "GRA" | "ISO" | null {
  if (/^gra$/i.test(token)) return "GRA";
  if (/^iso$/i.test(token)) return "ISO";
  return null;
}

function sampleTypeLabel(token: string): "CP" | "BLANK" | null {
  if (/^cp$/i.test(token)) return "CP";
  if (/^blank$/i.test(token)) return "BLANK";
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
