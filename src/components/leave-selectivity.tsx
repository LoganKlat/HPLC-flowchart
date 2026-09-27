import type { EfficiencyAsk } from "@/lib/selectivity";

const choiceClass =
  "flex h-10 min-w-0 cursor-pointer items-center justify-center rounded-lg border px-3 text-sm font-medium";

export function LeaveSelectivityAsk({
  ask,
  ifNo,
  onYes,
  onNo,
}: {
  ask: EfficiencyAsk;
  ifNo: string;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <div className="flex flex-col gap-4" id="leave-selectivity-ask">
      <section id="next-change" className="scroll-mt-16 rounded-xl bg-[#e7f3ee] px-4 py-4 text-[#144237]">
        <h2 className="font-heading text-base">Next change</h2>
        <p className="mt-1 text-sm leading-relaxed">{ask.question}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" className={`${choiceClass} border-primary bg-accent text-foreground`} onClick={onYes}>
            Yes
          </button>
          <button
            type="button"
            className={`${choiceClass} border-input bg-background text-foreground`}
            onClick={onNo}
          >
            No
          </button>
        </div>
      </section>
      <section className="rounded-xl bg-card px-4 py-4 ring-1 ring-foreground/10">
        <h2 className="font-heading text-base">Why</h2>
        <p className="mt-1 text-sm leading-relaxed text-foreground">
          If you say no, the next chromatogram would be: {ifNo}
        </p>
      </section>
    </div>
  );
}

export function LeaveSelectivityDone({ duringRetention }: { duringRetention: boolean }) {
  const nextChange = duringRetention
    ? "Retention and selectivity are finished. Efficiency is next. That stage is not built yet."
    : "Selectivity is finished. Efficiency is next. That stage is not built yet.";
  return (
    <div className="flex flex-col gap-4" id="leave-selectivity-done">
      <section id="next-change" className="scroll-mt-16 rounded-xl bg-[#e7f3ee] px-4 py-4 text-[#144237]">
        <h2 className="font-heading text-base">Next change</h2>
        <p className="mt-1 text-sm leading-relaxed">{nextChange}</p>
      </section>
      <section className="rounded-xl bg-card px-4 py-4 ring-1 ring-foreground/10">
        <h2 className="font-heading text-base">Why</h2>
        <p className="mt-1 text-sm leading-relaxed text-foreground">
          You chose to move on to efficiency. No further solvent, temperature, or column change is recommended.
          Efficiency and gradient are not built yet.
        </p>
      </section>
    </div>
  );
}
