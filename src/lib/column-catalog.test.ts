import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { SHEET_COLUMNS, columnKey, columnsFromWorkbook } from "@/lib/column-catalog";
import { recommendLigand } from "@/lib/selectivity";
import { CHART_SOLVENT_NOTE, MENU_SOLVENTS } from "@/lib/solvent-menu";

describe("column workbook", () => {
  const workbook = XLSX.read(readFileSync(path.join(process.cwd(), "fixtures/columns/column-list.xlsx")), {
    type: "buffer",
  });
  const parsed = columnsFromWorkbook(workbook);

  it("uses the readable coatings from the sheet, not internal codes", () => {
    expect(parsed).toEqual([...SHEET_COLUMNS]);
    expect(parsed).toHaveLength(44);
    expect(parsed.slice(0, 6)).toEqual(["C18", "C18aq", "PFPP", "C8", "biphenyl", "IBD"]);
    expect(parsed).toContain("Phenyl");
    expect(parsed).toContain("Pinnacle DB C18");
    expect(parsed).toContain("Raptor biphenyl");
    expect(parsed.some((name) => columnKey(name) === "1a" || columnKey(name) === "8ub")).toBe(false);
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
