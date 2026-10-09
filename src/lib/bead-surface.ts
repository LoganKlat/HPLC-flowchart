export const SURFACE_SPOTS = 100;

export type BeadSurface = {
  ligands: number;
  silanols: number;
  ligandAt: boolean[];
};

/**
 * Carbon load is how many of the 100 surface spots are ligands. The rest are SiOH.
 * Spots are filled in a fixed order, so raising the load only adds ligands
 * and lowering it removes the newest ones. The spots that stay do not move.
 */
export function beadSurface(carbonLoadPercent: number): BeadSurface {
  const ligands = Math.max(0, Math.min(SURFACE_SPOTS, Math.round(carbonLoadPercent)));
  const ligandAt = Array.from({ length: SURFACE_SPOTS }, (_, index) => index < ligands);
  return { ligands, silanols: SURFACE_SPOTS - ligands, ligandAt };
}
