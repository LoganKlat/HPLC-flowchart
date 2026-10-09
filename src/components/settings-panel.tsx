"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SettingsPanel({
  onOpenNav,
  columns,
  solvents,
  onAddColumn,
  onRemoveColumn,
  onAddSolvent,
  onRemoveSolvent,
}: {
  onOpenNav: () => void;
  columns: readonly { label: string; locked: boolean }[];
  solvents: readonly string[];
  onAddColumn: (name: string) => boolean | "invalid";
  onRemoveColumn: (name: string) => void;
  onAddSolvent: (name: string) => boolean;
  onRemoveSolvent: (name: string) => void;
}) {
  return (
    <div id="settings-page" className="flex flex-col gap-8">
      <div className="md:hidden">
        <Button type="button" variant="outline" className="h-10 px-3" onClick={onOpenNav}>
          Sections
        </Button>
      </div>
      <header className="flex max-w-3xl flex-col gap-2">
        <p className="text-xs tracking-[0.16em] text-[#0f6b56] uppercase">This session</p>
        <h1 className="font-heading text-3xl text-foreground sm:text-4xl">Settings</h1>
        <p className="text-base text-muted-foreground">
          Each column is one real column: the coating and its sizes. Adding or removing one changes the run menus
          immediately. The lists last until you reload the page.
        </p>
      </header>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <NameList
          id="settings-columns"
          title="Columns"
          description="The coating and the sizes from the column workbook. A PFPP 100 × 4.6 is not a PFPP 150 × 4.6. An Ultra column stays on this list, shown in grey, and cannot be chosen."
          items={columns.map((column) => ({ name: column.label, locked: column.locked }))}
          empty="No columns yet. Add one to use it in Run details."
          addLabel="Add a column"
          inputId="add-column"
          placeholder="PFPP, 100 × 4.6 mm, 5 µm"
          removeLabel={(name) => `Remove ${name}`}
          onAdd={onAddColumn}
          onRemove={onRemoveColumn}
        />
        <NameList
          id="settings-solvents"
          title="Solvents"
          description="The solvent menu uses this list. The chart still only covers ACN, MeOH, and THF."
          items={solvents.map((name) => ({ name }))}
          empty="No solvents yet. Add one to use it in Run details."
          addLabel="Add a solvent"
          inputId="add-solvent"
          placeholder="Solvent name"
          removeLabel={(name) => `Remove ${name}`}
          onAdd={onAddSolvent}
          onRemove={onRemoveSolvent}
        />
      </div>
    </div>
  );
}

function NameList({
  id,
  title,
  description,
  items,
  empty,
  addLabel,
  inputId,
  placeholder,
  removeLabel,
  onAdd,
  onRemove,
}: {
  id: string;
  title: string;
  description: string;
  items: readonly { name: string; locked?: boolean }[];
  empty: string;
  addLabel: string;
  inputId: string;
  placeholder: string;
  removeLabel: (name: string) => string;
  onAdd: (name: string) => boolean | "invalid";
  onRemove: (name: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const added = onAdd(draft);
    if (added === "invalid") {
      setError("Type the coating and the sizes, such as PFPP, 100 × 4.6 mm, 5 µm.");
      return;
    }
    if (!added) {
      setError(draft.trim() ? "That name is already on the list." : "Type a name first.");
      return;
    }
    setDraft("");
    setError(null);
  }

  return (
    <section id={id} className="flex flex-col gap-3 rounded-xl bg-card px-4 py-4 ring-1 ring-foreground/10">
      <div>
        <h2 className="font-heading text-xl text-[#144237]">{title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={submit}>
        <Input
          id={inputId}
          value={draft}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
        />
        <Button type="submit" className="h-8 shrink-0">
          {addLabel}
        </Button>
      </form>
      {error ? (
        <p className="text-sm text-red-700" role="status">
          {error}
        </p>
      ) : null}
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex max-h-[28rem] flex-col gap-1 overflow-y-auto">
          {items.map((item) => (
            <li
              key={item.name}
              data-ultra={item.locked ? "true" : undefined}
              className={`flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 ${item.locked ? "" : "hover:bg-[#e7f3ee]"}`}
            >
              <span
                className={`min-w-0 text-sm ${item.locked ? "text-neutral-400" : "text-foreground"}`}
                aria-disabled={item.locked || undefined}
              >
                {item.name}
              </span>
              <Button
                type="button"
                variant="outline"
                className="h-7 shrink-0 px-2 text-xs"
                aria-label={removeLabel(item.name)}
                onClick={() => onRemove(item.name)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
