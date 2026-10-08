"use client";

import { useEffect, useState } from "react";
import { NO_CHANGE_YET, retentionChangeLabel } from "@/lib/change-label";
import { decisionBesideClass, decisionUnderClass, nextChangeValueClass } from "@/components/decision-layout";
import {
  formatPercentB,
  minimumPercentNote,
  refitMinimumPercent,
  type FitCatalogRun,
  type MinimumFit,
  type RetentionDecision,
  type RetentionFit,
} from "@/lib/retention";
import { PERCENT_B_SENTENCE, SELECTIVITY_ORDER } from "@/lib/setting-kind";

export function RetentionDecisionView({
  decision,
  onLinePercent,
  onPickPercent,
  pickedPercent = null,
}: {
  decision: RetentionDecision;
  onLinePercent?: (percent: number | null) => void;
  onPickPercent?: (percent: number) => void;
  pickedPercent?: number | null;
}) {
  const fit = decision.fit;
  const initial = fit?.catalog.filter((run) => run.included).map((run) => run.runNumber) ?? [];
  const signature = fit
    ? `${fit.rawPercentB}|${fit.catalog.map((run) => `${run.runNumber}${run.included ? "i" : "o"}`).join(",")}`
    : "";
  const [tracked, setTracked] = useState(signature);
  const [selected, setSelected] = useState<number[]>(initial);
  if (tracked !== signature) {
    setTracked(signature);
    setSelected(initial);
  }
  const overridden = fit != null && !sameRunSet(selected, initial);
  const solved = fit ? refitMinimumPercent(fit.catalog, selected, fit.specifiedTimeMin, fit.usedPercentB) : null;
  const reported = overridden && solved ? solved.nextPercentB : null;
  useEffect(() => {
    onLinePercent?.(reported);
  }, [onLinePercent, reported]);
  const shownPercent = overridden && solved ? solved.nextPercentB : (pickedPercent ?? decision.nextPercentB);
  const label = retentionChangeLabel(
    shownPercent === decision.nextPercentB ? decision : { ...decision, nextPercentB: shownPercent },
    shownPercent,
  );

  return (
    <div className="contents" id="retention-decision">
      <section
        id="next-change"
        className={`flex flex-col scroll-mt-16 rounded-xl bg-card px-4 py-4 ring-1 ring-foreground/10 ${decisionBesideClass}`}
      >
        <h2 className="font-heading text-base">Next change</h2>
        <p className={nextChangeValueClass}>{label}</p>
        {decision.bChoices && decision.bChoices.length > 1 ? (
          <div id="percent-choices" className="mt-3 flex flex-col gap-2">
            {decision.bChoices.map((choice) => (
              <button
                key={choice.id}
                type="button"
                className="rounded-lg border border-[#0f6b56] bg-white px-3 py-2 text-left text-sm font-semibold text-[#144237]"
                onClick={() => onPickPercent?.(choice.percentB)}
              >
                {`%B ${formatPercentB(choice.percentB)}`}
              </button>
            ))}
          </div>
        ) : null}
      </section>
      <section id="min-b-note" className={`rounded-xl bg-card px-4 py-4 ring-1 ring-foreground/10 ${decisionUnderClass}`}>
        <h2 className="font-heading text-base">Why</h2>
        <div className="mt-1 flex flex-col gap-2 text-sm leading-relaxed text-foreground">
          {whyParagraphs(decision.why).map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
          {decision.bChoices && decision.bChoices.length > 1
            ? decision.bChoices.map((choice) => <p key={choice.id}>{choice.sentence}</p>)
            : null}
        </div>
        {fit ? (
          <MinimumPercentFit
            fit={fit}
            selected={selected}
            overridden={overridden}
            solved={solved}
            onToggle={(runNumber) =>
              setSelected((current) =>
                current.includes(runNumber) ? current.filter((item) => item !== runNumber) : [...current, runNumber],
              )
            }
          />
        ) : null}
      </section>
    </div>
  );
}

export function StartHighBNote() {
  return (
    <section
      id="start-high-b"
      className="scroll-mt-16 rounded-xl bg-[#e7f3ee] px-4 py-4 text-[#144237]"
    >
      <h2 className="font-heading text-base">What we’re doing</h2>
      <div className="mt-1 flex flex-col gap-2 text-sm leading-relaxed">
        <p>
          The main goal is to separate the compounds in a composite sample, so each compound shows
          up as its own peak.
        </p>
        <p>
          First, change %B so the last peak comes out by the time that was set. That step does not
          have to make the peak count match the specification.
        </p>
        <p>
          Next, change the conditions — temperature, then the solvent, then the column coating —
          until the peak count meets the specification. You do not have to use all of those changes.
        </p>
        <p>
          After that, make the peaks narrower. Last, change %B while the run is going. Those last two
          stages are not built yet.
        </p>
        <p>Start the first run around 90–100% B. A higher %B lets the decision engine work better.</p>
        <p>Enter the initial run details. They update automatically after each decision.</p>
      </div>
    </section>
  );
}

export function LaterChangeNote({ decision }: { decision: RetentionDecision | null }) {
  const explanation =
    decision?.nextChange ?? "Retention is finished. The next kind of change is not built yet.";
  const label = decision ? retentionChangeLabel(decision) : NO_CHANGE_YET;
  return (
    <div className="flex flex-col gap-4">
      <section
        id="next-change"
        className="@container scroll-mt-16 rounded-xl bg-[#e7f3ee] px-4 py-4 text-[#144237]"
      >
        <h2 className="font-heading text-base">Next change</h2>
        <p className="mt-1 text-base font-semibold">{label}</p>
      </section>
      <section className="rounded-xl bg-card px-4 py-4 ring-1 ring-foreground/10">
        <h2 className="font-heading text-base">Why</h2>
        <div className="mt-1 flex flex-col gap-2 text-sm leading-relaxed text-foreground">
          {(decision?.why?.trim() ? whyParagraphs(decision.why) : [explanation]).map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      </section>
    </div>
  );
}

function whyParagraphs(why: string): string[] {
  const parts = why
    .split("\n\n")
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0 && !isOtherStage(paragraph));
  return parts.length > 0 ? parts : [NO_CHANGE_YET];
}

/** The pump range and the later selectivity sequence stay off this step. */
function isOtherStage(paragraph: string): boolean {
  if (paragraph.includes(SELECTIVITY_ORDER)) return true;
  if (paragraph.includes(PERCENT_B_SENTENCE)) return true;
  if (paragraph.startsWith("The order is")) return true;
  if (paragraph.startsWith("After 40°C") || paragraph.startsWith("After 60°C") || paragraph.startsWith("After the solvent")) {
    return true;
  }
  return false;
}

function MinimumPercentFit({
  fit,
  selected,
  overridden,
  solved,
  onToggle,
}: {
  fit: RetentionFit;
  selected: number[];
  overridden: boolean;
  solved: MinimumFit | null;
  onToggle: (runNumber: number) => void;
}) {
  const chosen = new Set(selected);
  return (
    <div id="min-b-fit" className="mt-4 flex flex-col gap-4">
      <div className="flex flex-col gap-2 text-sm leading-relaxed text-foreground">
        {overridden ? <p>{selectedLine(fit.catalog, selected)}</p> : null}
        {solved ? (
          minimumPercentNote(solved, fit.specifiedTimeMin).map((paragraph, index) => <p key={index}>{paragraph}</p>)
        ) : (
          <p>
            {selected.length < 2
              ? "Fewer than two runs are selected, so the line cannot be drawn yet."
              : "The line cannot be drawn yet. At least two selected runs need a %B and a last peak after the t0 peak."}
          </p>
        )}
      </div>
      <div className="overflow-x-auto">
        <table id="min-b-runs" className="w-full min-w-[44rem] border-collapse text-left text-sm">
          <caption className="pb-2 text-left font-medium text-foreground">
            Every uploaded run. A check puts that run on the line. The checks start from the runs the Q-test and the
            separation rules kept.
          </caption>
          <thead>
            <tr className="border-t border-border text-xs tracking-wide text-muted-foreground uppercase">
              <th className="px-2 py-2 font-medium">On the line</th>
              <th className="px-2 py-2 font-medium">Run</th>
              <th className="px-2 py-2 font-medium">%B</th>
              <th className="px-2 py-2 font-medium">t0 (min)</th>
              <th className="px-2 py-2 font-medium">Last peak (min)</th>
              <th className="px-2 py-2 font-medium">Line</th>
            </tr>
          </thead>
          <tbody>
            {fit.catalog.map((run) => {
              const onLine = chosen.has(run.runNumber);
              return (
                <tr key={run.runNumber} className="border-t border-border" data-run={run.runNumber}>
                  <td className="px-2 py-2">
                    <input
                      type="checkbox"
                      className="size-4 accent-[#0f6b56]"
                      checked={onLine}
                      aria-label={`Run ${run.runNumber} on the line`}
                      onChange={() => onToggle(run.runNumber)}
                    />
                  </td>
                  <th className="px-2 py-2 font-medium" scope="row">
                    Run {run.runNumber}
                  </th>
                  <td className="px-2 py-2">{run.percentB == null ? "—" : formatPercentB(run.percentB)}</td>
                  <td className="px-2 py-2">{showMinutes(run.t0)}</td>
                  <td className="px-2 py-2">{showMinutes(run.tR)}</td>
                  <td className="px-2 py-2">{onLine ? "Included" : "Left out"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function selectedLine(catalog: readonly FitCatalogRun[], selected: readonly number[]): string {
  const chosen = new Set(selected);
  const labels = catalog
    .filter((run) => chosen.has(run.runNumber))
    .map((run) =>
      run.percentB == null ? `Run ${run.runNumber}` : `Run ${run.runNumber} at ${formatPercentB(run.percentB)}% B`,
    );
  if (labels.length === 0) return "The line is using the runs you selected. None are selected.";
  if (labels.length === 1) return `The line is using the runs you selected: ${labels[0]}.`;
  const last = labels[labels.length - 1];
  return `The line is using the runs you selected: ${labels.slice(0, -1).join(", ")} and ${last}.`;
}

function sameRunSet(left: readonly number[], right: readonly number[]): boolean {
  if (left.length !== right.length) return false;
  const chosen = new Set(left);
  return right.every((run) => chosen.has(run));
}

function showMinutes(value: number | null): string {
  return value == null || !Number.isFinite(value) ? "—" : value.toFixed(3);
}

