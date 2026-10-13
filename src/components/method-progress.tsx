import { Check } from "lucide-react";
import { METHOD_STAGES, type MethodStage } from "@/lib/method-stage";

/** Compact session tracker. Sits above this run / next run. */
export function MethodProgress({ stage }: { stage: MethodStage }) {
  const current = METHOD_STAGES.indexOf(stage);
  return (
    <nav
      id="method-progress"
      aria-label="Method development"
      className="shrink-0 border-b border-foreground/10 bg-card px-2 py-1.5"
    >
      <ol className="flex w-full items-stretch gap-1">
        {METHOD_STAGES.flatMap((name, index) => {
          const done = index < current;
          const active = index === current;
          const chip = (
            <li key={name} className="flex min-w-0 flex-1">
              <span
                aria-current={active ? "step" : undefined}
                className={
                  "flex w-full min-w-0 items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap " +
                  (active
                    ? "bg-[var(--hp-brand)] text-[var(--hp-on-brand)]"
                    : done
                      ? "bg-[var(--hp-soft)] text-[var(--hp-brand)]"
                      : "text-muted-foreground ring-1 ring-foreground/15")
                }
              >
                {done ? <Check className="size-3 shrink-0" aria-hidden="true" /> : null}
                {name}
              </span>
            </li>
          );
          if (index === 0) return [chip];
          return [
            <li
              key={`${name}-next`}
              aria-hidden="true"
              className="flex shrink-0 items-center text-[10px] leading-none text-muted-foreground"
            >
              →
            </li>,
            chip,
          ];
        })}
      </ol>
    </nav>
  );
}
