import { describe, expect, it } from "vitest";
import { beadSurface } from "@/lib/bead-surface";

describe("bead surface", () => {
  it("turns 10% carbon load into 10 ligands and 90 SiOH", () => {
    const at = beadSurface(10);
    expect(at.ligands).toBe(10);
    expect(at.silanols).toBe(90);
    expect(at.ligandAt.filter(Boolean)).toHaveLength(10);
  });

  it("is all SiOH at 0% and all ligands at 100%", () => {
    const bare = beadSurface(0);
    expect(bare.ligands).toBe(0);
    expect(bare.silanols).toBe(100);
    expect(bare.ligandAt.some(Boolean)).toBe(false);
    const full = beadSurface(100);
    expect(full.ligands).toBe(100);
    expect(full.silanols).toBe(0);
    expect(full.ligandAt.every(Boolean)).toBe(true);
  });

  it("places 40 ligands when the carbon load is 40%", () => {
    const at = beadSurface(40);
    expect(at.ligands).toBe(40);
    expect(at.silanols).toBe(60);
    expect(at.ligandAt.filter(Boolean)).toHaveLength(40);
  });

  it("keeps the ligands already drawn when carbon load rises from 10% to 40%", () => {
    const low = beadSurface(10);
    const high = beadSurface(40);
    const again = beadSurface(10);
    expect(low.ligandAt.filter(Boolean)).toHaveLength(10);
    expect(high.ligandAt.filter(Boolean)).toHaveLength(40);
    low.ligandAt.forEach((occupied, index) => {
      if (occupied) expect(high.ligandAt[index]).toBe(true);
    });
    const added = high.ligandAt.filter((occupied, index) => occupied && !low.ligandAt[index]);
    expect(added).toHaveLength(30);
    expect(again.ligandAt).toEqual(low.ligandAt);
  });
});
