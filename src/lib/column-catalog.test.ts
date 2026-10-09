import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  applySizeChoice,
  coatingsFromColumns,
  columnsFromWorkbook,
  isUltraColumn,
  parseColumnSpec,
  sizeChoices,
  ultraOnlyPick,
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
    expect(sizeChoices(parsed, longer, "particleUm")).toEqual(["5"]);
    const pfpp = { coating: "PFPP", lengthMm: "", diameterMm: "", particleUm: "", poreA: "" };
    expect(sizeChoices(parsed, pfpp, "lengthMm")).toEqual(["50", "100", "150"]);
    expect(coatingsFromColumns(parsed).slice(0, 6)).toEqual(["C18", "C18aq", "PFPP", "C8", "biphenyl", "IBD"]);
  });

  it("keeps Ultra columns off the run menus", () => {
    const ultra = parsed.filter(isUltraColumn);
    expect(ultra).toHaveLength(17);
    expect(ultra.every((column) => /ultra/i.test(`${column.product} ${column.label}`))).toBe(true);
    const c18aq = { coating: "C18aq", lengthMm: "150", diameterMm: "4.6", particleUm: "", poreA: "" };
    expect(sizeChoices(parsed, c18aq, "particleUm")).toEqual(["5"]);
    expect(sizeChoices(parsed, c18aq, "particleUm")).not.toContain("3");
    const narrow = { coating: "C18", lengthMm: "100", diameterMm: "", particleUm: "", poreA: "" };
    expect(sizeChoices(parsed, narrow, "diameterMm")).not.toContain("3");
    const ultraOnly = { coating: "C18", lengthMm: "100", diameterMm: "3", particleUm: "3", poreA: "" };
    expect(ultraOnlyPick(parsed, ultraOnly)).toBe(true);
    const shared = { coating: "C18", lengthMm: "150", diameterMm: "4.6", particleUm: "5", poreA: "" };
    expect(ultraOnlyPick(parsed, shared)).toBe(false);
    const typed = parseColumnSpec("ULTRA PFPP, 33 × 2.1 mm, 1.9 µm");
    expect(typed && isUltraColumn(typed)).toBe(true);
    const withTyped = typed ? [...parsed, typed] : parsed;
    expect(sizeChoices(withTyped, { coating: "PFPP", lengthMm: "", diameterMm: "", particleUm: "", poreA: "" }, "lengthMm")).not.toContain("33");
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
