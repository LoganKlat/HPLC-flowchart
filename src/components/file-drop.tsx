"use client";

import { useId, useState } from "react";
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
    if (!file) return;
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
    const buffer = await file.arrayBuffer();
    onBuffer(file.name, buffer);
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
        className={cn(
          "relative flex min-h-[24rem] flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center transition-colors",
          dragging && "rounded-xl bg-accent",
        )}
      >
        <p className="font-heading text-2xl text-foreground sm:text-3xl">{prompt}</p>
        <p className="max-w-md text-sm text-muted-foreground">
          LabSolutions export (.csv, .txt, or .xlsx). Drag it here, or choose it from your computer.
        </p>
        <div
          className={cn(
            buttonVariants({ variant: "outline" }),
            "pointer-events-none h-10 px-4",
            reading && "opacity-50",
          )}
        >
          <span>Choose a file</span>
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
