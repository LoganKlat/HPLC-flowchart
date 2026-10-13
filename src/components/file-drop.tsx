"use client";

import { useId, useState } from "react";
import { UploadCloud } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FileDropProps = {
  prompt: string;
  reading: boolean;
  onBegin: (fileName: string) => void;
  onBuffer: (fileName: string, buffer: ArrayBuffer) => void;
  onProblem: (fileName: string, message: string) => void;
};

export function FileDrop({ prompt, reading, onBegin, onBuffer, onProblem }: FileDropProps) {
  const inputId = useId();
  const [dragging, setDragging] = useState(false);

  async function takeFile(file: File | undefined) {
    if (!file || reading) return;
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".csv") && !lower.endsWith(".txt") && !lower.endsWith(".xlsx")) {
      onProblem(file.name, "Choose a LabSolutions export. It should be a .csv, .txt, or .xlsx file.");
      return;
    }
    if (file.size === 0) {
      onProblem(file.name, "This file is empty.");
      return;
    }
    onBegin(file.name);
    try {
      const buffer = await file.arrayBuffer();
      onBuffer(file.name, buffer);
    } catch {
      onProblem(file.name, "This file could not be opened. Please try again.");
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <div
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          setDragging(true);
        }}
        onDragLeave={(event) => {
          const next = event.relatedTarget;
          if (next instanceof Node && event.currentTarget.contains(next)) return;
          setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void takeFile(event.dataTransfer.files?.[0]);
        }}
        className="relative flex min-h-[24rem] flex-1 flex-col items-center justify-center p-4 sm:p-8 text-center transition-all"
      >
        <div
          className={cn(
            "flex w-full max-w-xl flex-col items-center justify-center gap-4 rounded-2xl border-[3px] border-dashed border-border/80 bg-background/50 p-8 sm:p-12 transition-all duration-200",
            dragging
              ? "border-[var(--hp-brand)] bg-[var(--hp-soft)] ring-4 ring-[var(--hp-brand)]/20 scale-[1.01]"
              : "hover:border-[var(--hp-brand)]/70 hover:bg-card/90",
          )}
        >
          <div className="flex size-16 items-center justify-center rounded-full bg-[var(--hp-soft)] text-[var(--hp-brand)] ring-1 ring-[var(--hp-brand)]/30">
            <UploadCloud className="size-8" aria-hidden="true" />
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="font-heading text-xl font-bold text-foreground sm:text-2xl">
              {reading ? "Reading your chromatogram…" : prompt}
            </p>
            <p className="max-w-md text-xs sm:text-sm text-muted-foreground">
              LabSolutions export (.csv, .txt, or .xlsx). Drag and drop your file here, or click to browse.
            </p>
          </div>
          <div
            className={cn(
              buttonVariants({ variant: "outline" }),
              "pointer-events-none mt-2 h-10 px-5 font-semibold transition-all",
              reading && "opacity-50",
            )}
          >
            <span>{reading ? "Processing file…" : "Choose a file"}</span>
          </div>
        </div>
        <input
          id={inputId}
          type="file"
          accept=".csv,.txt,.xlsx,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          aria-label="Choose a file"
          disabled={reading}
          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
          onChange={(event) => {
            void takeFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
