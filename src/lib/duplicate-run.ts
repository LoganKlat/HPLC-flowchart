import type { LabFileRead } from "./lab-file";

const signatures = new WeakMap<LabFileRead, string>();
function signature(read: LabFileRead): string {
  let value = signatures.get(read);
  if (value === undefined) {
    // Compare exported measurements, not filenames or UI notes. Cache immutable reads.
    const { notes: _notes, ...measurements } = read;
    void _notes;
    value = JSON.stringify(measurements);
    signatures.set(read, value);
  }
  return value;
}
export function duplicateRunIndex(read: LabFileRead | null, earlier: readonly (LabFileRead | null)[]): number | null {
  if (!read?.chromatogram?.length) return null;
  const key = signature(read);
  const index = earlier.findIndex(item => item?.chromatogram?.length && signature(item) === key);
  return index < 0 ? null : index;
}
