import type { ReactNode } from "react";
import { ChromatogramChart } from "@/components/chromatogram-chart";
import { Button } from "@/components/ui/button";
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
  aside?: ReactNode;
  onRemove?: () => void;
};

export function ResultsPanel({ fileName, read, rows, aside, onRemove }: ResultsPanelProps) {
  const rowNotes = new Set(rows.map((row) => row.note).filter((note): note is string => Boolean(note)));
  const extraNotes = read.notes.filter((note) => !rowNotes.has(note));

  return (
    <div className="flex flex-col gap-4">
      {read.chromatogram && read.chromatogramMissingMessage == null ? (
        <ChromatogramChart
          points={read.chromatogram}
          yLabel={read.chromatogramYAxis}
          peakTimesMin={read.peakTimesMin}
          fileName={fileName}
          onRemove={onRemove}
        />
      ) : (
        <div className="rounded-xl bg-card text-sm ring-1 ring-foreground/10" role="status">
          <FileBar fileName={fileName} onRemove={onRemove} />
          <p className="px-4 py-4">
            {read.chromatogramMissingMessage ??
              "The picture could not be drawn because the chromatogram (Detector A) was not in this file."}
          </p>
        </div>
      )}
      {extraNotes.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {extraNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
      <div className="@container">
      <div
        className={cn(
          "grid grid-cols-1 items-stretch gap-4",
          aside &&
            "@min-[26rem]:grid-cols-[minmax(0,1.15fr)_minmax(11.5rem,0.9fr)] @min-[26rem]:gap-x-0",
        )}
      >
      <div
        className={cn(
          "min-w-0 overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10",
          aside &&
            "@min-[26rem]:col-start-1 @min-[26rem]:row-start-1 @min-[26rem]:h-full @min-[26rem]:rounded-r-none @min-[26rem]:ring-0 @min-[26rem]:border @min-[26rem]:border-r-0 @min-[26rem]:border-foreground/10",
        )}
      >
        <table className="w-full min-w-[20rem] border-collapse text-left text-sm">
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
      {aside ? <div className="contents">{aside}</div> : null}
      </div>
      </div>
    </div>
  );
}

function FileBar({ fileName, onRemove }: { fileName: string; onRemove?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 pt-3">
      <p className="min-w-0 text-sm font-medium text-foreground">{fileName}</p>
      {onRemove ? (
        <Button type="button" variant="outline" className="h-8 shrink-0 px-3" onClick={onRemove}>
          Remove file
        </Button>
      ) : null}
    </div>
  );
}
