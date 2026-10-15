import { describe, expect, it } from "vitest";
import { calculateAwesomeFloor } from "@/lib/awesome-calculator";

describe("Awesome Rainbow Calculator", () => {
  it("matches the reference values from the Awesome Rainbow Calculator spreadsheet", () => {
    // Inputs from column E of media_1792041071392_5c4a7fef.xlsx:
    // L1 = 150, ID = 4.6, PS = 5, F = 1.5, SPP = 1.0
    // t0 = 1.15 min, tR = 20.03 min, BP = 2600 psi, Rs = 2.17
    // tRspec = 15 min, BPspec = 4000 psi, Rsspec = 1.39
    const res = calculateAwesomeFloor({
      column: { lengthMm: 150, diameterMm: 4.6, particleSize: 5, flowRate: 1.5, sppFactor: 1.0 },
      t0Min: 1.15,
      tRMin: 20.03,
      backPressurePsi: 2600,
      resolution: 2.17,
      specTimeMin: 15,
      specPressurePsi: 4000,
      specResolution: 1.39,
    });

    // Check linear velocity u (E46: 2.1739130434782608)
    expect(res.uMmPerSec).toBeCloseTo(2.173913, 5);

    // Check HETP1 (E67: 17.03217391304348)
    expect(res.hetp1Um).toBeCloseTo(17.032174, 5);

    // Check N1 (E63: 8806.861693980702)
    expect(res.n1).toBeCloseTo(8806.86, 2);

    // Check Headroom HR (E106: 1.0733675870273112)
    expect(res.headroom).toBeCloseTo(1.073368, 5);

    // Check Nmax FPP (E108: 11331.843125211548)
    expect(res.nMaxFpp).toBeCloseTo(11331.84, 2);

    // Check Nmax SPP (E109: 16997.764687817322)
    expect(res.nMaxSpp).toBeCloseTo(16997.76, 2);

    // Check Rs floor FPP (E110: 1.2253921996887256)
    expect(res.rsFloorFpp).toBeCloseTo(1.22539, 4);

    // Check Rs floor SPP (E111: 1.0005285413413498)
    expect(res.rsFloorSpp).toBeCloseTo(1.00053, 4);

    // Check verdict at Rs = 2.17 (E112: "OK, reachable with a fully porous column")
    expect(res.verdict).toBe("fpp-reachable");
    expect(res.verdictText).toBe("OK, reachable with a fully porous column");

    // Check optimal column parameters:
    // VF (E115: 1.4333035178771363)
    expect(res.optimum.velocityFactor).toBeCloseTo(1.4333, 4);
    // PSopt (E116: 2.678874285855831)
    expect(res.optimum.particleSizeUm).toBeCloseTo(2.6789, 4);
    // Lopt (E117: 86.26250484475754)
    expect(res.optimum.lengthMm).toBeCloseTo(86.26, 2);
    // Fopt (E118: 1.151891981360329)
    expect(res.optimum.flowRateMlPerMin).toBeCloseTo(1.1519, 4);
  });

  it("identifies when resolution needs an SPP bead (between SPP and FPP floor)", () => {
    const res = calculateAwesomeFloor({
      column: { lengthMm: 150, diameterMm: 4.6, particleSize: 5, flowRate: 1.5, sppFactor: 1.0 },
      t0Min: 1.15,
      tRMin: 20.03,
      backPressurePsi: 2600,
      resolution: 1.1, // 1.00053 <= 1.1 < 1.22539
      specTimeMin: 15,
      specPressurePsi: 4000,
      specResolution: 1.39,
    });
    expect(res.verdict).toBe("spp-needed");
    expect(res.verdictText).toBe("Needs an SPP bead, out of reach fully porous");
  });

  it("identifies when resolution is impossible by column geometry (below SPP floor)", () => {
    const res = calculateAwesomeFloor({
      column: { lengthMm: 150, diameterMm: 4.6, particleSize: 5, flowRate: 1.5, sppFactor: 1.0 },
      t0Min: 1.15,
      tRMin: 20.03,
      backPressurePsi: 2600,
      resolution: 0.85, // 0.85 < 1.00053
      specTimeMin: 15,
      specPressurePsi: 4000,
      specResolution: 1.39,
    });
    expect(res.verdict).toBe("impossible-selectivity-needed");
    expect(res.verdictText).toBe("IMPOSSIBLE by column geometry, must change selectivity");
  });
});
