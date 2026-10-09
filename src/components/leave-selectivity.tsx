import { decisionBesideClass, decisionUnderClass, nextChangeValueClass } from "@/components/decision-layout";
import { Button } from "@/components/ui/button";
import { NO_CHANGE_YET } from "@/lib/change-label";
import { BACKWARDS_REDO, backwardsWhy, EFFICIENCY_CONTINUE, EFFICIENCY_MOVE_ON, type BackwardsPair } from "@/lib/retention";

const choiceClass =
  "flex h-10 min-w-0 cursor-pointer items-center justify-center rounded-lg border px-3 text-sm font-medium";

export function EfficiencyChoiceView({
  why,
  onEfficiency,
  onContinue,
  onContinueRetention,
}: {
  why: string;
  onEfficiency: () => void;
  onContinue: () => void;
  onContinueRetention?: () => void;
}) {
  return (
    <div className="contents" id="efficiency-choice">
      <section id="next-change" className={`flex flex-col scroll-mt-16 rounded-xl bg-[#e7f3ee] px-4 py-4 text-[#144237] ${decisionBesideClass}`}>
        <h2 className="font-heading text-base">Next change</h2>
        <p className={nextChangeValueClass}>{NO_CHANGE_YET}</p>
        <div id="efficiency-or-selectivity" className="mt-3 flex flex-col gap-2">
          <Button
            type="button"
            id="choose-efficiency"
            className="h-auto w-full flex-col items-start gap-1 whitespace-normal px-4 py-3 text-left"
            style={{
              height: "auto",
              whiteSpace: "normal",
              backgroundColor: "#0f6b56",
              color: "#f7fffb",
              borderColor: "#0f6b56",
            }}
            onClick={onEfficiency}
          >
            <span className="text-xs tracking-[0.14em] uppercase">Recommended</span>
            <span>{EFFICIENCY_MOVE_ON}</span>
          </Button>
          <Button
            type="button"
            id="choose-continue"
            variant="outline"
            className="h-auto w-full whitespace-normal px-4 py-3 text-left"
            style={{ height: "auto", whiteSpace: "normal" }}
            onClick={onContinue}
          >
            {EFFICIENCY_CONTINUE}
          </Button>
          {onContinueRetention ? (
            <Button
              type="button"
              id="continue-retention"
              variant="outline"
              className="h-auto w-full whitespace-normal px-4 py-3 text-left"
              style={{ height: "auto", whiteSpace: "normal" }}
              onClick={onContinueRetention}
            >
              Continue retention
            </Button>
          ) : null}
        </div>
      </section>
      <section className={`rounded-xl bg-card px-4 py-4 ring-1 ring-foreground/10 ${decisionUnderClass}`}>
        <h2 className="font-heading text-base">Why</h2>
        <div className="mt-1 flex flex-col gap-2 text-sm leading-relaxed text-foreground">
          <p>{EFFICIENCY_MOVE_ON}</p>
          {why.split("\n\n").map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      </section>
    </div>
  );
}

export function LeaveSelectivityAsk({
  ask,
  onYes,
  onNo,
}: {
  ask: { question: string; why: string; steps?: string[] };
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <div className="contents" id="leave-selectivity-ask">
      <section id="next-change" className={`flex flex-col scroll-mt-16 rounded-xl bg-[#e7f3ee] px-4 py-4 text-[#144237] ${decisionBesideClass}`}>
        <h2 className="font-heading text-base">Next change</h2>
        <p className={nextChangeValueClass}>{NO_CHANGE_YET}</p>
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
      <section className={`rounded-xl bg-card px-4 py-4 ring-1 ring-foreground/10 ${decisionUnderClass}`}>
        <h2 className="font-heading text-base">Why</h2>
        <div className="mt-1 flex flex-col gap-2 text-sm leading-relaxed text-foreground">
          <p>{ask.question}</p>
          {ask.steps && ask.steps.length > 0 ? (
            <ol id="selectivity-steps" className="list-decimal space-y-2 pl-5">
              {ask.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          ) : null}
          {ask.why.split("\n\n").map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      </section>
    </div>
  );
}

export function BackwardsRetentionView({
  pair,
  choice,
  onContinue,
  onRedo,
}: {
  pair: BackwardsPair;
  choice: "redo" | null;
  onContinue: () => void;
  onRedo: () => void;
}) {
  const warning = backwardsWhy(pair);
  const nextChange = choice === "redo" ? "Re-do the runs" : NO_CHANGE_YET;
  return (
    <div className="contents" id="backwards-retention">
      <section id="next-change" className={`flex flex-col scroll-mt-16 rounded-xl bg-[#e7f3ee] px-4 py-4 text-[#144237] ${decisionBesideClass}`}>
        <h2 className="font-heading text-base">Next change</h2>
        <p className={nextChangeValueClass}>{nextChange}</p>
        <div id="backwards-choices" className="mt-3 flex flex-col gap-2">
          <Button
            type="button"
            id="backwards-continue"
            className="h-auto w-full whitespace-normal px-4 py-3 text-left"
            style={{ height: "auto", whiteSpace: "normal", backgroundColor: "#0f6b56", color: "#f7fffb", borderColor: "#0f6b56" }}
            onClick={onContinue}
          >
            Continue with the normal steps
          </Button>
          <Button
            type="button"
            id="backwards-redo"
            variant="outline"
            className="h-auto w-full whitespace-normal px-4 py-3 text-left"
            style={{ height: "auto", whiteSpace: "normal" }}
            onClick={onRedo}
          >
            Re-do the runs
          </Button>
        </div>
      </section>
      <section className={`rounded-xl bg-card px-4 py-4 ring-1 ring-foreground/10 ${decisionUnderClass}`}>
        <h2 className="font-heading text-base">Why</h2>
        <div className="mt-1 flex flex-col gap-2 text-sm leading-relaxed text-foreground">
          <p>{warning}</p>
          {choice === "redo" ? <p>{BACKWARDS_REDO}</p> : null}
        </div>
      </section>
    </div>
  );
}

export function LeaveSelectivityDone({ duringRetention }: { duringRetention: boolean }) {
  const nextChange = duringRetention
    ? "Retention and selectivity are finished. Efficiency is next. That stage is not built yet."
    : "Selectivity is finished. Efficiency is next. That stage is not built yet.";
  return (
    <div className="contents" id="leave-selectivity-done">
      <section id="next-change" className={`flex flex-col scroll-mt-16 rounded-xl bg-[#e7f3ee] px-4 py-4 text-[#144237] ${decisionBesideClass}`}>
        <h2 className="font-heading text-base">Next change</h2>
        <p className={nextChangeValueClass}>{NO_CHANGE_YET}</p>
      </section>
      <section className={`rounded-xl bg-card px-4 py-4 ring-1 ring-foreground/10 ${decisionUnderClass}`}>
        <h2 className="font-heading text-base">Why</h2>
        <div className="mt-1 flex flex-col gap-2 text-sm leading-relaxed text-foreground">
          <p>{nextChange}</p>
          <p>
            Moving on to efficiency was chosen. No further solvent, temperature, or column change is recommended.
            Efficiency can make the peaks narrower without a new solvent or a new coating. Gradient changes %B
            while the run is going. Those stages are not built yet.
          </p>
        </div>
      </section>
    </div>
  );
}
