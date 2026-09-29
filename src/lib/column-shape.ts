const REF_LENGTH_MM = 150;
const REF_WIDTH_MM = 4.6;

export type ColumnMultiples = {
  resolution: number;
  retentionTime: number;
  backPressure: number;
};

/**
 * Multiples of a 150 mm × 4.6 mm column at the same flow and particle size.
 * Resolution eases off the raw 1/ID² gain as the column gets narrow, so the
 * instrument's own peak width (system peaks) keeps it from climbing without limit.
 * Back-pressure stays 1/ID², the fixed-flow case, not 1/ID⁴.
 */
export function columnMultiples(lengthMm: number, widthMm: number): ColumnMultiples {
  const lengthRatio = lengthMm / REF_LENGTH_MM;
  const rawWidth = (REF_WIDTH_MM / widthMm) ** 2;
  const extra = rawWidth - 1;
  const resolutionWidth = rawWidth > 1 ? 1 + extra / (1 + extra / 2.5) : rawWidth;
  return {
    resolution: Math.sqrt(lengthRatio) * resolutionWidth,
    retentionTime: lengthRatio * (widthMm / REF_WIDTH_MM) ** 2,
    backPressure: lengthRatio * rawWidth,
  };
}
