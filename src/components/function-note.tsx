import { cn } from "@/lib/utils";

export type ControlType = "Mechanical" | "Chemical" | "Both";

export type FunctionNote = {
  does: string;
  sets: string;
  range: string;
  changes: string;
  controlType?: ControlType;
  controlledParameters?: string;
};

export function FunctionNoteView({ title, note }: { title?: string; note: FunctionNote }) {
  return (
    <div className="flex flex-col gap-3">
      {title ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
          <p className="font-heading text-sm font-bold text-foreground">{title}</p>
          {note.controlType ? (
            <span
              className={cn(
                "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide",
                note.controlType === "Chemical"
                  ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  : note.controlType === "Mechanical"
                  ? "border border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400"
                  : "border border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-400"
              )}
            >
              {note.controlType === "Both" ? "Mechanical & Chemical" : `${note.controlType} Control`}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Description */}
      <p className="text-xs leading-relaxed text-foreground/90">{note.does}</p>

      {/* Operating parameters and typical range */}
      {note.controlledParameters || note.range ? (
        <div className="flex flex-col gap-1.5 rounded-lg border border-border/60 bg-muted/20 p-2.5 text-xs">
          {note.controlledParameters ? (
            <div>
              <span className="font-semibold text-foreground">Parameters: </span>
              <span className="text-muted-foreground">{note.controlledParameters}</span>
            </div>
          ) : null}
          {note.range ? (
            <div>
              <span className="font-semibold text-foreground">Typical range: </span>
              <span className="text-muted-foreground">{note.range}</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Chromatographic effect */}
      {note.changes ? (
        <div className="rounded-lg border border-border/70 bg-muted/30 p-2.5 text-xs leading-relaxed">
          <span className="font-semibold text-foreground">Chromatographic effect: </span>
          <span className="text-muted-foreground">{note.changes}</span>
        </div>
      ) : null}
    </div>
  );
}
