"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export function KnowMoreToggle({
  children,
  label = "Do you want to know more?",
  hideLabel = "Hide detailed explanation",
  defaultOpen = false,
}: {
  children: ReactNode;
  label?: string;
  hideLabel?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mt-2 flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex w-fit cursor-pointer select-none items-center gap-1.5 rounded-lg border border-[var(--hp-brand)]/35 bg-[var(--hp-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--hp-brand)] shadow-2xs transition-all duration-150 hover:border-[var(--hp-brand)] hover:bg-[var(--hp-soft-2)] active:translate-y-px focus-visible:ring-2 focus-visible:ring-ring/50 outline-none"
      >
        <span>{open ? hideLabel : label}</span>
        {open ? (
          <ChevronUp className="size-3.5 shrink-0" aria-hidden="true" />
        ) : (
          <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />
        )}
      </button>
      {open ? (
        <div className="flex flex-col gap-2 rounded-lg border-l-2 border-[var(--hp-brand)]/40 bg-muted/25 py-2 pl-3 pr-2.5 text-sm leading-relaxed text-foreground">
          {children}
        </div>
      ) : null}
    </div>
  );
}
