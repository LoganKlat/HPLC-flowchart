import * as XLSX from "xlsx";

/**
 * Ligands and coatings a person would pick from the column workbook.
 * Internal codes (1a, 8ub) stay out. Particle size is not part of the name.
 */
export const SHEET_COLUMNS = [
  "C18",
  "C18aq",
  "PFPP",
  "C8",
  "biphenyl",
  "IBD",
  "APS-2-HYPERSIL",
  "C18 Acquity BEH",
  "C18 Bondapak",
  "C18 Kinetex Polar",
  "C18 Luna",
  "C18 Nova-Pak",
  "C18 Nucleosil",
  "C18 Spherisorb ODSi",
  "C18 Symmetry",
  "C8 Inertsil",
  "C8 Symmetry",
  "CN",
  "F5 Kinetex",
  "Force biphenyl",
  "Force C18",
  "Force PFPP",
  "Phenyl",
  "Pinnacle DB biphenyl",
  "Pinnacle DB C18",
  "Pinnacle DB C18aq",
  "Pinnacle DB C8",
  "Pinnacle DB IBD",
  "Pinnacle DB PFPP",
  "Pursuit 100A C18",
  "Pursuit 200A C8",
  "Pursuit C8",
  "Pursuit XR 200A C18",
  "Pursuit XR 200A C8",
  "Raptor biphenyl",
  "Raptor C18",
  "Raptor PFPP",
  "Spherisorb NH2",
  "Ultra biphenyl",
  "Ultra C18",
  "Ultra C18aq",
  "Ultra C8",
  "Ultra IBD",
  "Ultra PFPP",
] as const;

const PHASES: Record<string, string> = {
  c18: "C18",
  c8: "C8",
  c18aq: "C18aq",
  ibd: "IBD",
  pfpp: "PFPP",
  pfp: "PFPP",
  bip: "biphenyl",
};

const CANONICAL = ["C18", "C18aq", "PFPP", "C8", "biphenyl", "IBD"];

export function columnKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

export function columnsFromWorkbook(workbook: XLSX.WorkBook): string[] {
  const found: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const phase = PHASES[sheetName.trim().toLowerCase()];
    if (!phase) continue;
    addColumn(found, phase);
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(workbook.Sheets[sheetName], {
      header: 1,
      defval: "",
    });
    const header = rows.find((row) => row.some((cell) => String(cell).trim() === "Name"));
    if (!header) continue;
    const index = header.findIndex((cell) => String(cell).trim() === "Name");
    for (const row of rows) {
      const raw = String(row[index] ?? "").trim();
      if (!raw || raw === "Name" || isJunk(raw) || isCode(raw)) continue;
      const brand = brandClean(raw);
      if (!brand || isJunk(brand)) continue;
      const normalized = normalizePhaseWords(brand);
      const hasPhase = /\b(C18aq|C18|C8|PFPP|biphenyl|IBD|Phenyl)\b/.test(normalized);
      addColumn(found, hasPhase ? normalized : `${brand} ${phase}`);
    }
  }

  const other = workbook.Sheets["Other columns"];
  if (other) {
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(other, { header: 1, defval: "" });
    for (const row of rows.slice(1)) {
      const raw = String(row[1] ?? "").trim();
      if (raw) addColumn(found, raw);
    }
  }

  const data = workbook.Sheets["HPLC Column Data"];
  if (data) {
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(data, { header: 1, defval: "" });
    for (const row of rows) {
      for (const cell of row) {
        const raw = String(cell ?? "").trim();
        if (!raw || isCode(raw) || isJunk(raw)) continue;
        if (!/[A-Za-z]{2,}/.test(raw)) continue;
        addColumn(found, raw);
      }
    }
  }

  return uniqueColumns(found);
}

function addColumn(found: string[], name: string) {
  const next = stripSize(normalizePhaseWords(name));
  if (!next || isJunk(next) || isCode(next) || !/[A-Za-z]/.test(next)) return;
  found.push(next);
}

function uniqueColumns(found: string[]): string[] {
  const order = new Map(CANONICAL.map((name, index) => [name.toLowerCase(), index]));
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const name of found) {
    const key = columnKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(name);
  }
  unique.sort((left, right) => {
    const leftOrder = order.get(left.toLowerCase()) ?? 100;
    const rightOrder = order.get(right.toLowerCase()) ?? 100;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return left.localeCompare(right);
  });
  return unique;
}

function cleanSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizePhaseWords(value: string): string {
  let text = cleanSpaces(value);
  text = text.replace(/pinaccle/gi, "Pinnacle");
  text = text.replace(/flourophenyl/gi, "Fluorophenyl");
  text = text.replace(/\bfluorophenyl\b/gi, "PFPP");
  text = text.replace(/\bpfp\b/gi, "PFPP");
  text = text.replace(/\bpfpp\b/gi, "PFPP");
  text = text.replace(/\bbiph\b/gi, "biphenyl");
  text = text.replace(/\bbiphenyl\b/gi, "biphenyl");
  text = text.replace(/\bc18aq\b/gi, "C18aq");
  text = text.replace(/\baq\s+c18\b/gi, "C18aq");
  text = text.replace(/\bc18\s*aq\b/gi, "C18aq");
  text = text.replace(/\bAQ\b/g, "C18aq");
  text = text.replace(/\bC18\b/g, "C18");
  text = text.replace(/\bC8\b/g, "C8");
  text = text.replace(/\bIBD\b/gi, "IBD");
  text = text.replace(/\bphenyl\b/gi, "Phenyl");
  text = text.replace(/\bbipPhenyl\b/g, "biphenyl");
  text = cleanSpaces(text);
  text = text.replace(/\bC18aq\s+C18\b/g, "C18aq");
  text = text.replace(/\bC18\s+C18aq\b/g, "C18aq");
  return text;
}

function stripSize(value: string): string {
  let text = value;
  text = text.replace(/\s*\d+(?:\.\d+)?\s*(?:µm|μm|um)\b/gi, "");
  text = text.replace(/\s+\d+(?:\.\d+)?$/g, "");
  text = text.replace(/\s(?:1\.7|1\.8|1\.9|2\.6|2\.7|3|4|5|10)(?=\s|$)/g, "");
  return cleanSpaces(text);
}

function isCode(value: string): boolean {
  return /^[0-9]+[a-z]{0,3}$/i.test(value) || /^[0-9.]+$/.test(value) || /serial/i.test(value);
}

function isJunk(value: string): boolean {
  const low = value.toLowerCase();
  if (!value || value.length > 60) return true;
  if (/https?:/i.test(value) || low.includes("http")) return true;
  if (/[.]/.test(value) && value.split(" ").length > 4) return true;
  if (
    ["name", "length", "diameter", "code", "serial numbers", "particle size", "column 1", "column 2", "ref #"].includes(
      low,
    )
  ) {
    return true;
  }
  if (low.includes("rules") || low.includes("different columns") || low.includes("same columns") || low.includes("columns for")) {
    return true;
  }
  if (low.startsWith("sum of") || low.includes("study") || low.includes("<--")) return true;
  if (["longer column", "found", "ma", "broken"].includes(low)) return true;
  return false;
}

function brandClean(value: string): string {
  return cleanSpaces(value).replace(/\s+NEW$/i, "").replace(/\s+OLD$/i, "").replace(/pinaccle/gi, "Pinnacle");
}
