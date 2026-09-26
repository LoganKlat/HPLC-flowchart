"use client";

import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { exampleUrl, type ExampleFile } from "@/lib/examples";
import { cn } from "@/lib/utils";

type FileDropProps = {
  prompt: string;
  examples: ExampleFile[];
  reading: boolean;
  onBegin: (fileName: string) => void;
  onBuffer: (fileName: string, buffer: ArrayBuffer) => void;
  onProblem: (fileName: string, message: string) => void;
};

export function FileDrop({ prompt, examples, reading, onBegin, onBuffer, onProblem }: FileDropProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  async function takeFile(file: File | undefined) {
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".csv") && !lower.endsWith(".txt")) {
      onProblem(file.name, "Choose a LabSolutions export. It should be a .csv or .txt file.");
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

  async function loadExample(example: ExampleFile) {
    onBegin(example.fileName);
    try {
      const response = await fetch(exampleUrl(example));
      if (!response.ok) {
        onProblem(example.fileName, "That example file could not be opened.");
        return;
      }
      onBuffer(example.fileName, await response.arrayBuffer());
    } catch {
      onProblem(example.fileName, "That example file could not be opened.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void takeFile(event.dataTransfer.files?.[0]);
        }}
        className={cn(
          "flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors",
          dragging ? "border-primary bg-accent" : "border-border bg-card",
        )}
      >
        <p className="font-heading text-lg text-foreground">{prompt}</p>
        <p className="max-w-md text-sm text-muted-foreground">
          LabSolutions export (.csv or .txt). Drag it here, or choose it from your computer.
        </p>
        <Button
          type="button"
          variant="outline"
          className="h-10 px-4"
          disabled={reading}
          onClick={() => inputRef.current?.click()}
        >
          Choose a file
        </Button>
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          className="sr-only"
          onChange={(event) => {
            void takeFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>
      <div className="rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">
        <p className="text-sm text-foreground">
          Or load a real export already saved with this app.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          These are real LabSolutions files, not made-up data.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          {examples.map((example) => (
            <Button
              key={example.id}
              type="button"
              variant="secondary"
              className="h-auto min-h-10 flex-1 flex-col items-start gap-0.5 px-3 py-2 text-left whitespace-normal"
              disabled={reading}
              onClick={() => void loadExample(example)}
            >
              <span>Load {example.shortName}</span>
              <span className="text-xs font-normal text-muted-foreground">{example.fileName}</span>
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
