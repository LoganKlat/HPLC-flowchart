import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  applySizeChoice,
  coatingsFromColumns,
  columnsFromWorkbook,
  parseColumnSpec,
  sizeChoices,
} from "@/lib/column-catalog";
import { SHEET_COLUMNS } from "@/lib/sheet-columns";
import { recommendLigand } from "@/lib/selectivity";
import { CHART_SOLVENT_NOTE, MENU_SOLVENTS } from "@/lib/solvent-menu";

describe("column workbook", () => {
  const workbook = XLSX.read(readFileSync(path.join(process.cwd(), "fixtures/columns/column-list.xlsx")), {
    type: "buffer",
  });
  const parsed = columnsFromWorkbook(workbook);

  it("keeps two columns that share a coating and differ in length", () => {
    expect(parsed).toEqual(SHEET_COLUMNS);
    const force = parsed.filter((column) => column.product === "Force" && column.coating === "PFPP");
    expect(force.map((column) => column.lengthMm).sort((left, right) => left - right)).toEqual([100, 150]);
    expect(force.map((column) => column.label)).toEqual([
      "Force PFPP, 100 × 4.6 mm, 5 µm",
      "Force PFPP, 150 × 4.6 mm, 5 µm",
    ]);
    expect(parsed.some((column) => column.label.includes("1a") || column.label.includes("8ub"))).toBe(false);
    expect(parsed.some((column) => column.coating === "C18aq" && column.lengthMm === 150 && column.diameterMm === 4.6 && column.particleUm === 5)).toBe(true);
  });

  it("limits each size menu to columns that match the other chosen sizes", () => {
    const pick = { coating: "C18aq", lengthMm: "", diameterMm: "", particleUm: "", poreA: "" };
    expect(sizeChoices(parsed, pick, "lengthMm")).toEqual(["100", "150"]);
    const longer = applySizeChoice(parsed, pick, "lengthMm", "150");
    expect(sizeChoices(parsed, longer, "diameterMm")).toEqual(["4.6"]);
    expect(sizeChoices(parsed, longer, "particleUm")).toEqual(["3", "5"]);
    const pfpp = { coating: "PFPP", lengthMm: "", diameterMm: "", particleUm: "", poreA: "" };
    expect(sizeChoices(parsed, pfpp, "lengthMm")).toEqual(["50", "100", "150"]);
    expect(coatingsFromColumns(parsed).slice(0, 6)).toEqual(["C18", "C18aq", "PFPP", "C8", "biphenyl", "IBD"]);
  });

  it("reads a typed column spec", () => {
    const typed = parseColumnSpec("PFPP, 100 × 4.6 mm, 5 µm");
    expect(typed?.coating).toBe("PFPP");
    expect(typed?.lengthMm).toBe(100);
    expect(typed?.diameterMm).toBe(4.6);
    expect(typed?.particleUm).toBe(5);
    expect(parseColumnSpec("just a name")).toBeNull();
  });
});

describe("session lists", () => {
  it("does not recommend a column that is not on the list", () => {
    expect(recommendLigand(["C18"], ["C18", "Phenyl"])).toBe("Phenyl");
    expect(recommendLigand(["C18", "Phenyl"], ["C18", "Phenyl"])).toBeNull();
    expect(recommendLigand(["Not on the list"], ["C18"])).toBe("C18");
    expect(recommendLigand(["C18", "C18aq", "PFPP", "C8", "biphenyl", "IBD"])).toBeNull();
  });

  it("starts solvents with the chart three and other common HPLC solvents", () => {
    expect(MENU_SOLVENTS.slice(0, 3)).toEqual(["ACN", "MeOH", "THF"]);
    expect(MENU_SOLVENTS).toEqual(
      expect.arrayContaining(["Ethanol", "Isopropanol", "Acetone", "Propanol", "Butanol", "Ethyl acetate", "Hexane"]),
    );
    expect(CHART_SOLVENT_NOTE).toBe("The chart only covers ACN, MeOH, and THF. Pick one of those.");
  });
});
