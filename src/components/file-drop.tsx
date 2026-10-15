"use client";

import { useId, useState } from "react";
import { UploadCloud } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type DroppedFile = {
  fileName: string;
  buffer: ArrayBuffer;
};

type FileDropProps = {
  prompt: string;
  reading: boolean;
  onBegin: (fileName: string) => void;
  onBuffer: (fileName: string, buffer: ArrayBuffer) => void;
  onProblem: (fileName: string, message: string) => void;
  onBatch?: (files: DroppedFile[]) => void;
};

export function FileDrop({ prompt, reading, onBegin, onBuffer, onProblem, onBatch }: FileDropProps) {
  const inputId = useId();
  const [dragging, setDragging] = useState(false);

  async function takeFiles(fileList: FileList | File[] | null | undefined) {
    if (!fileList || reading) return;
    const rawFiles = Array.from(fileList);
    if (rawFiles.length === 0) return;

    const validFiles: File[] = [];
    for (const file of rawFiles) {
      const lower = file.name.toLowerCase();
      if (!lower.endsWith(".csv") && !lower.endsWith(".txt") && !lower.endsWith(".xlsx")) {
        onProblem(file.name, "Choose a LabSolutions export. It should be a .csv, .txt, or .xlsx file.");
        continue;
      }
      if (file.size === 0) {
        onProblem(file.name, "This file is empty.");
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    if (onBatch) {
      const items: DroppedFile[] = [];
      for (const file of validFiles) {
        try {
          const buffer = await file.arrayBuffer();
          items.push({ fileName: file.name, buffer });
        } catch {
          onProblem(file.name, "This file could not be opened. Please try again.");
        }
      }
      if (items.length > 0) {
        onBatch(items);
      }
      return;
    }

    const first = validFiles[0];
    onBegin(first.name);
    try {
      const buffer = await first.arrayBuffer();
      onBuffer(first.name, buffer);
    } catch {
      onProblem(first.name, "This file could not be opened. Please try again.");
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
          event.stopPropagation();
          setDragging(false);
          void takeFiles(event.dataTransfer.files);
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
              LabSolutions export (.csv, .txt, or .xlsx). Drag and drop one or multiple files here, or click to browse.{" "}
              <span className="font-bold text-red-600 dark:text-red-400">
                Multiple files are automatically sorted by injection number.
              </span>
            </p>
          </div>
          <div
            className={cn(
              buttonVariants({ variant: "outline" }),
              "pointer-events-none mt-2 h-10 px-5 font-semibold transition-all",
              reading && "opacity-50",
            )}
          >
            <span>{reading ? "Processing file(s)…" : "Choose file(s)"}</span>
          </div>
        </div>
        <input
          id={inputId}
          type="file"
          multiple
          accept=".csv,.txt,.xlsx,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          aria-label="Choose file(s)"
          disabled={reading}
          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
          onChange={(event) => {
            void takeFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
