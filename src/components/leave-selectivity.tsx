import { Button } from "@/components/ui/button";
import { KnowMoreToggle } from "@/components/know-more";
import { BACKWARDS_REDO, backwardsWhy, EFFICIENCY_CONTINUE, EFFICIENCY_MOVE_ON, type BackwardsPair } from "@/lib/retention";

const choiceClass =
  "flex h-8 min-w-0 cursor-pointer select-none items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-bold shadow-xs transition-all duration-150 active:translate-y-0.5 active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

export function EfficiencyChoiceButtons({
  onEfficiency,
  onContinue,
  onContinueRetention,
  inSelectivity = false,
}: {
  onEfficiency: () => void;
  onContinue: () => void;
  onContinueRetention?: () => void;
  inSelectivity?: boolean;
}) {
  return (
    <div id="efficiency-or-selectivity" className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
      <Button
        type="button"
        id="choose-efficiency"
        className="h-auto w-full cursor-pointer flex-col items-start gap-0.5 whitespace-normal px-3 py-1.5 text-left transition-all duration-150 hover:brightness-105 hover:shadow-xs active:translate-y-0.5 active:scale-[0.99]"
        style={{
          height: "auto",
          whiteSpace: "normal",
          backgroundColor: "var(--hp-brand)",
          color: "var(--hp-on-brand)",
          borderColor: "var(--hp-brand)",
        }}
        onClick={onEfficiency}
      >
        <span className="text-[9px] font-bold tracking-wider uppercase opacity-90">Recommended</span>
        <span className="text-xs font-semibold leading-tight">{EFFICIENCY_MOVE_ON}</span>
      </Button>
      <Button
        type="button"
        id="choose-continue"
        variant="outline"
        className="h-auto w-full cursor-pointer flex-col items-start gap-0.5 whitespace-normal px-3 py-1.5 text-left transition-all duration-150 hover:border-[var(--hp-brand)] hover:bg-[var(--hp-soft)] hover:text-[var(--hp-brand)] hover:shadow-xs active:translate-y-0.5 active:scale-[0.99]"
        style={{ height: "auto", whiteSpace: "normal" }}
        onClick={onContinue}
      >
        <span className="text-[9px] font-bold tracking-wider uppercase text-muted-foreground">Selectivity</span>
        <span className="text-xs font-semibold leading-tight">
          {inSelectivity ? "Stay in selectivity" : EFFICIENCY_CONTINUE}
        </span>
      </Button>
      {!inSelectivity && onContinueRetention ? (
        <Button
          type="button"
          id="continue-retention"
          variant="outline"
          className="h-auto w-full cursor-pointer py-1 px-3 text-xs sm:col-span-2 text-center transition-all duration-150 hover:border-[var(--hp-brand)] hover:bg-[var(--hp-soft)] hover:text-[var(--hp-brand)] active:scale-[0.99]"
          style={{ height: "auto" }}
          onClick={onContinueRetention}
        >
          Stay in retention
        </Button>
      ) : null}
    </div>
  );
}

export function EfficiencyChoiceView({ why }: { why: string }) {
  const paragraphs = why.split("\n\n").map((p) => p.trim()).filter(Boolean);
  const hasConditionTag = paragraphs[0]?.startsWith("Condition: (");
  let lead: string[];
  let more: string[];
  if (hasConditionTag && paragraphs.length >= 2) {
    lead = [paragraphs[0], paragraphs[1]];
    more = paragraphs.slice(2);
  } else {
    const leadIdx = paragraphs.findIndex(
      (p) => p.startsWith("Efficiency is next") || p.startsWith("Why efficiency"),
    );
    const summary = leadIdx >= 0 ? paragraphs[leadIdx] : paragraphs[0] ?? why;
    lead = [summary];
    more = paragraphs.filter((_, i) => (leadIdx >= 0 ? i !== leadIdx : i !== 0));
  }
  return (
    <div className="contents" id="efficiency-choice">
      <section className="rounded-xl bg-card px-4 py-4 ring-1 ring-foreground/10">
        <h2 className="font-heading text-base">Why</h2>
        <div className="mt-3 flex flex-col gap-2 text-sm leading-relaxed text-foreground">
          {lead.map((p, idx) => (
            <p key={idx} className={idx === 0 && !hasConditionTag ? "font-medium" : ""}>
              {p}
            </p>
          ))}
          {more.length > 0 ? (
            <KnowMoreToggle>
              {more.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </KnowMoreToggle>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export function LeaveSelectivityButtons({ onYes, onNo }: { onYes: () => void; onNo: () => void }) {
  return (
    <div id="leave-selectivity-buttons" className="grid grid-cols-2 gap-1.5">
      <button
        type="button"
        id="leave-selectivity-yes"
        className={`${choiceClass} border-[var(--hp-brand)] bg-[var(--hp-brand)] text-[var(--hp-on-brand)] ring-2 ring-[var(--hp-brand)]/20 hover:bg-[var(--hp-brand-hover)] hover:shadow-xs`}
        onClick={onYes}
      >
        Yes
      </button>
      <button
        type="button"
        id="leave-selectivity-no"
        className={`${choiceClass} border-border bg-card text-foreground hover:border-[var(--hp-brand)] hover:bg-[var(--hp-soft)] hover:text-[var(--hp-brand)] hover:shadow-xs`}
        onClick={onNo}
      >
        No
      </button>
    </div>
  );
}

export function LeaveSelectivityAsk({
  ask,
}: {
  ask: { question: string; why: string; steps?: string[] };
}) {
  const paragraphs = ask.why.split("\n\n").filter(Boolean);
  return (
    <div className="contents" id="leave-selectivity-ask">
      <section className="rounded-xl bg-card px-4 py-4 ring-1 ring-foreground/10">
        <h2 className="font-heading text-base">Why</h2>
        <div className="mt-3 flex flex-col gap-2 text-sm leading-relaxed text-foreground">
          <p className="font-medium">{ask.question}</p>
          {ask.steps && ask.steps.length > 0 ? (
            <ol id="selectivity-steps" className="list-decimal space-y-2 pl-5">
              {ask.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          ) : null}
          {paragraphs.length > 0 ? (
            <KnowMoreToggle>
              {paragraphs.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </KnowMoreToggle>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export function BackwardsChoiceButtons({
  onContinue,
  onRedo,
}: {
  onContinue: () => void;
  onRedo: () => void;
}) {
  return (
    <div id="backwards-choices" className="grid grid-cols-2 gap-1.5">
      <Button
        type="button"
        id="backwards-continue"
        className="h-8 cursor-pointer px-2.5 text-xs font-bold transition-all duration-150 hover:brightness-105 hover:shadow-xs active:translate-y-0.5 active:scale-[0.99]"
        style={{ backgroundColor: "var(--hp-brand)", color: "var(--hp-on-brand)", borderColor: "var(--hp-brand)" }}
        onClick={onContinue}
      >
        Continue steps
      </Button>
      <Button
        type="button"
        id="backwards-redo"
        variant="outline"
        className="h-8 cursor-pointer border-border bg-card px-2.5 text-xs font-bold text-foreground transition-all duration-150 hover:border-[var(--hp-brand)] hover:bg-[var(--hp-soft)] hover:text-[var(--hp-brand)] hover:shadow-xs active:translate-y-0.5 active:scale-[0.99]"
        onClick={onRedo}
      >
        Re-do runs
      </Button>
    </div>
  );
}

export function BackwardsRetentionView({
  pair,
  choice,
}: {
  pair: BackwardsPair;
  choice: "redo" | null;
}) {
  const warning = backwardsWhy(pair);
  const paragraphs = warning.split("\n\n").filter(Boolean);
  const lead = paragraphs[0] ?? warning;
  const details = paragraphs.slice(1);
  return (
    <div className="contents" id="backwards-retention">
      <section className="rounded-xl bg-card px-4 py-4 ring-1 ring-foreground/10">
        <h2 className="font-heading text-base">Why</h2>
        <div className="mt-3 flex flex-col gap-2 text-sm leading-relaxed text-foreground">
          <p>{lead}</p>
          {choice === "redo" ? <p>{BACKWARDS_REDO}</p> : null}
          {details.length > 0 ? (
            <KnowMoreToggle>
              {details.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </KnowMoreToggle>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export function LeaveSelectivityDone({
  duringRetention,
  onUndo,
}: {
  duringRetention: boolean;
  onUndo?: () => void;
}) {
  const nextChange = duringRetention
    ? "Retention and selectivity are finished. Efficiency is next. That stage is not built yet."
    : "Selectivity is finished. Efficiency is next. That stage is not built yet.";
  return (
    <div className="contents" id="leave-selectivity-done">
      <section className="rounded-xl bg-card px-4 py-4 ring-1 ring-foreground/10">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-heading text-base">Why</h2>
          {onUndo ? (
            <Button
              type="button"
              id="undo-leave-selectivity"
              variant="outline"
              className="h-7 cursor-pointer px-2.5 text-xs font-semibold"
              onClick={onUndo}
            >
              Back to choices
            </Button>
          ) : null}
        </div>
        <div className="mt-1 flex flex-col gap-2 text-sm leading-relaxed text-foreground">
          <p className="font-medium">{nextChange}</p>
          <KnowMoreToggle>
            <p>
              Moving on to efficiency was chosen. Chemical selectivity (α) and retention (k) are considered established.
              Efficiency optimizations focus on the physical dispersion of analyte bands—governed by the Purnell resolution equation
              (Rs = (√N / 4) × ((α − 1) / α) × (k / (1 + k))). Increasing theoretical plate count (N) through flow velocity
              optimization along the van Deemter curve, smaller particle sizes, or column dimensions sharpens peak widths without
              requiring changes to mobile phase chemistry. Gradient elution or column dimension changes belong to this stage.
            </p>
          </KnowMoreToggle>
        </div>
      </section>
    </div>
  );
}
