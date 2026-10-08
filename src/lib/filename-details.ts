import { LIGANDS, SOLVENTS } from "@/lib/selectivity";
import type { RunDetails } from "@/lib/run-details";

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
