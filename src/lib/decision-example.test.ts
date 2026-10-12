import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DECISION_EXAMPLE_FILES } from "./decision-example";
import { readLabFile } from "./lab-file";
import { parseRunFileName } from "./filename-details";

describe("preloaded decision example", () => {
  it("contains all 18 unique uploaded runs in development order", () => {
    expect(DECISION_EXAMPLE_FILES).toHaveLength(18);
    expect(new Set(DECISION_EXAMPLE_FILES).size).toBe(18);
    expect(DECISION_EXAMPLE_FILES[0]).toContain("ISO-90");
    expect(DECISION_EXAMPLE_FILES[17]).toContain("ISO-37");
  });
  for (const fileName of DECISION_EXAMPLE_FILES) {
    it(`reads results and conditions for ${fileName}`, () => {
      const read = readLabFile(readFileSync(`public/decision-example/${fileName}`));
      expect(read.blockingMessage).toBeNull();
      expect(read.peakCount).toBeGreaterThan(0);
      expect(read.chromatogram?.length).toBeGreaterThan(0);
      expect(parseRunFileName(fileName).ok).toBe(true);
      const cached = JSON.parse(readFileSync("public/decision-example/results.json", "utf8"));
      expect(cached.find((item: { fileName: string }) => item.fileName === fileName).read).toEqual(JSON.parse(JSON.stringify(read)));
    }, 30000);
  }
});
