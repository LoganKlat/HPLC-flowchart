export type ControlType = "Mechanical" | "Chemical" | "Both";

export type FunctionNote = {
  does: string;
  sets: string;
  range: string;
  changes: string;
  controlType?: ControlType;
  controlledParameters?: string;
};

const sections = [
  ["does", "What it does"],
  ["sets", "The part that sets it"],
  ["range", "Range and units"],
  ["changes", "What it changes"],
] as const;

export function FunctionNoteView({ title, note }: { title?: string; note: FunctionNote }) {
  return (
    <div className="flex flex-col gap-3">
      {title ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
          <p className="font-heading text-base font-bold text-foreground">{title}</p>
          {note.controlType ? (
            <span
              className={
                "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wide uppercase " +
                (note.controlType === "Chemical"
                  ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  : note.controlType === "Mechanical"
                  ? "border border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400"
                  : "border border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-400")
              }
            >
              {note.controlType === "Both" ? "Both (Mech. & Chem.)" : `${note.controlType} Control`}
            </span>
          ) : null}
        </div>
      ) : null}

      {note.controlledParameters ? (
        <div className="rounded-lg border border-[var(--hp-brand)]/20 bg-[var(--hp-soft)]/30 p-2.5">
          <h4 className="text-[11px] font-bold tracking-wider text-[var(--hp-brand)] uppercase">
            Controlled Parameters
          </h4>
          <p className="mt-1 text-xs font-medium text-foreground leading-relaxed">
            {note.controlledParameters}
          </p>
        </div>
      ) : null}

      {sections.map(([key, heading]) => (
        <section key={key}>
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--hp-brand)]">{heading}</h3>
          <p className="mt-1 text-xs leading-relaxed text-foreground/90">{note[key]}</p>
        </section>
      ))}
    </div>
  );
}
