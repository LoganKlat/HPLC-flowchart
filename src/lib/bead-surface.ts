export const SURFACE_SPOTS = 100;

export type BeadSurface = {
  ligands: number;
  silanols: number;
  ligandAt: boolean[];
};

/** Carbon load is how many of the 100 surface spots are ligands. The rest are SiOH. */
export function beadSurface(carbonLoadPercent: number): BeadSurface {
  const ligands = Math.max(0, Math.min(SURFACE_SPOTS, Math.round(carbonLoadPercent)));
  const ligandAt = Array.from({ length: SURFACE_SPOTS }, () => false);
  let debt = 0;
  for (let index = 0; index < SURFACE_SPOTS; index++) {
    debt += ligands;
    if (debt >= SURFACE_SPOTS) {
      ligandAt[index] = true;
      debt -= SURFACE_SPOTS;
    }
  }
  return { ligands, silanols: SURFACE_SPOTS - ligands, ligandAt };
}
