import { ChromatogramChart } from "@/components/chromatogram-chart";
import type { ResultRow } from "@/lib/evaluate";
import type { LabFileRead } from "@/lib/lab-file";
import { cn } from "@/lib/utils";

const statusLabel = {
  met: "Met",
  "not-met": "Not met",
  "not-set": "not set",
} as const;

type ResultsPanelProps = {
  fileName: string;
  read: LabFileRead;
  rows: ResultRow[];
};

export function ResultsPanel({ fileName, read, rows }: ResultsPanelProps) {
  const rowNotes = new Set(rows.map((row) => row.note).filter((note): note is string => Boolean(note)));
  const extraNotes = read.notes.filter((note) => !rowNotes.has(note));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Showing <span className="font-medium text-foreground">{fileName}</span>
      </p>
      {read.chromatogram && read.chromatogramMissingMessage == null ? (
        <ChromatogramChart
          points={read.chromatogram}
          yLabel={read.chromatogramYAxis}
          peakTimesMin={read.peakTimesMin}
        />
      ) : (
        <div className="rounded-xl bg-card px-4 py-6 text-sm ring-1 ring-foreground/10" role="status">
          {read.chromatogramMissingMessage ??
            "The picture could not be drawn because the chromatogram (Detector A) was not in this file."}
        </div>
      )}
      {extraNotes.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {extraNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
      <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
        <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
          <caption className="px-4 py-3 text-left font-heading text-base text-foreground">
            Does this run meet the rules?
          </caption>
          <thead>
            <tr className="border-t border-border text-xs tracking-wide text-muted-foreground uppercase">
              <th className="px-4 py-2 font-medium">Check</th>
              <th className="px-4 py-2 font-medium">From the file</th>
              <th className="px-4 py-2 font-medium">Your rule</th>
              <th className="px-4 py-2 font-medium">Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-border align-top">
                <th className="px-4 py-3 font-medium text-foreground" scope="row">
                  {row.label}
                  {row.note ? (
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">{row.note}</span>
                  ) : null}
                </th>
                <td className="px-4 py-3">{row.measured}</td>
                <td className="px-4 py-3">{row.rule}</td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                      row.status === "met" && "bg-emerald-100 text-emerald-900",
                      row.status === "not-met" && "bg-orange-100 text-orange-950",
                      row.status === "not-set" && "bg-muted text-muted-foreground",
                    )}
                  >
                    {statusLabel[row.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
