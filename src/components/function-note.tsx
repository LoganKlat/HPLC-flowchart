export type FunctionNote = {
  does: string;
  sets: string;
  range: string;
  changes: string;
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
      {title ? <p className="font-medium">{title}</p> : null}
      {sections.map(([key, heading]) => (
        <section key={key}>
          <h3 className="text-sm font-semibold text-[#0f6b56]">{heading}</h3>
          <p className="mt-1">{note[key]}</p>
        </section>
      ))}
    </div>
  );
}
