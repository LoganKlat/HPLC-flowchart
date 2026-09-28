import { LIGANDS, SOLVENTS } from "@/lib/selectivity";
import type { RunDetails } from "@/lib/run-details";

export const FILE_NAME_EXAMPLE =
  "GR09-05-3-ACN-3-ISO-90-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254";

/** Shown beside the Run 1 checkbox. One real name, broken into its pieces. */
export const FILE_NAME_CHECKBOX_LABEL =
  "Fill these details from the file name. Hyphens separate the pieces. Skip the first three, then read solvent, pH, method, %B, flow rate, injection volume, sample type, sample concentration, ligand, length x diameter x particle size, oven temperature, and wavelength. A shorter name fills only the pieces it includes. For example, " +
  FILE_NAME_EXAMPLE +
  " gives solvent ACN, pH 3, method ISO, 90% B, flow 1.5, injection volume 20, sample type CP, sample concentration 0.1, ligand C18aqP, length 150 mm, diameter 4.6 mm, particle size 5 µm, oven ambient, and wavelength 254.";

export const FILE_NAME_MISMATCH =
  "This file name does not follow that pattern, so the details you typed were left as they are.";

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

function nameStems(fileName: string): string[] {
  let stem = fileName.trim().replace(/^.*[/\\]/, "");
  stem = stem.replace(/\.(csv|txt|xlsx)$/i, "");
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
  const size = dimensions.match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/i);
  const temperature = ovenText(oven);
  if (
    !isGroup(group) ||
    !isDigits(injection) ||
    !isDigits(hplc) ||
    !/^[A-Za-z]+$/.test(solvent) ||
    !isNumber(ph) ||
    !/^[A-Za-z]+$/.test(method) ||
    !isNumber(percentB) ||
    !isNumber(flow) ||
    !/^\d+(?:\.\d+)?u?$/i.test(injectionVolume) ||
    !/^[A-Za-z]+$/.test(sampleType) ||
    !isNumber(concentration) ||
    !/^[A-Za-z0-9]+$/.test(ligand) ||
    !size ||
    !temperature ||
    !isDigits(wavelength)
  ) {
    return null;
  }

  const fields: Partial<RunDetails> = {
    ph,
    percentB,
    flowRate: flow,
    injectionVolume,
    sampleType,
    sampleConcentration: concentration,
    lengthMm: size[1],
    diameterMm: size[2],
    particleSize: size[3],
    temperature,
    wavelength,
  };
  const methodName = methodLabel(method);
  if (methodName) fields.method = methodName;
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

function solventLabelFor(token: string): string | null {
  const found = SOLVENTS.find(
    (solvent) => solvent.label.toLowerCase() === token.toLowerCase() || solvent.aliases.includes(token.toLowerCase()),
  );
  return found?.label ?? null;
}

function ovenText(token: string): string | null {
  if (/^(amb|ambient)$/i.test(token)) return "ambient";
  const degrees = token.match(/^(\d+(?:\.\d+)?)c?$/i);
  if (!degrees) return null;
  return degrees[1];
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
