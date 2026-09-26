export type ExampleFile = {
  id: string;
  shortName: string;
  fileName: string;
};

export const EXAMPLE_FILES: ExampleFile[] = [
  {
    id: "gr41-06",
    shortName: "GR41-06",
    fileName:
      "GR41-06-5-ACN-3-ISO-70-1.5-20u-CP-0.1-BiphP-150x4.6x5-amb-254 (3).csv",
  },
  {
    id: "gr41-07",
    shortName: "GR41-07",
    fileName:
      "GR41-07-5-ACN-3-ISO-60-1.5-20u-CP-0.1-BiphP-150x4.6x5-amb-254 (2).csv",
  },
];

export function exampleUrl(file: ExampleFile): string {
  return `/examples/${encodeURIComponent(file.fileName)}`;
}
