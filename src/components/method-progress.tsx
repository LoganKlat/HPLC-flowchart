import { Check } from "lucide-react";
import { METHOD_STAGES, type MethodStage } from "@/lib/method-stage";

/** Compact session tracker. Sits above this run / next run. */
export function MethodProgress({ stage }: { stage: MethodStage }) {
  const current = METHOD_STAGES.indexOf(stage);
  return (
    <nav
      id="method-progress"
      aria-label="Method development"
      className="shrink-0 overflow-x-auto rounded-lg bg-card px-2 py-1.5 ring-1 ring-foreground/10"
    >
      <ol className="flex w-max min-w-full items-center gap-1">
        {METHOD_STAGES.map((name, index) => {
          const done = index < current;
          const active = index === current;
          return (
            <li key={name} className="flex items-center gap-1">
              {index > 0 ? (
                <span aria-hidden="true" className="px-0.5 text-[10px] leading-none text-muted-foreground">
                  →
                </span>
              ) : null}
              <span
                aria-current={active ? "step" : undefined}
                className={
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap " +
                  (active
                    ? "bg-[#0f6b56] text-[#f7fffb]"
                    : done
                      ? "bg-[#e7f3ee] text-[#0f6b56]"
                      : "text-muted-foreground ring-1 ring-foreground/15")
                }
              >
                {done ? <Check className="size-3 shrink-0" aria-hidden="true" /> : null}
                {name}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
