"use client";

import { useEffect, useState } from "react";
import { NO_CHANGE_YET, retentionChangeLabel } from "@/lib/change-label";
import { NextFileNameLine } from "@/components/next-file-name";
import { decisionBesideClass, decisionUnderClass, nextChangeValueClass } from "@/components/decision-layout";
import {
  formatPercentB,
  formatRSquared,
  lineEquation,
  MINIMUM_PERCENT_SENTENCE,
  minimumPercentHeading,
  minimumPercentNote,
  refitMinimumPercent,
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
  nextFileName = null,
}: {
  decision: RetentionDecision;
  onLinePercent?: (percent: number | null) => void;
  onPickPercent?: (percent: number | null) => void;
  pickedPercent?: number | null;
  nextFileName?: string | null;
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
        {decision.choosePercent && decision.nextPercentB != null ? (
          <SecondPercentChoice
            recommended={decision.nextPercentB}
            picked={pickedPercent}
            onPick={(percent) => onPickPercent?.(percent)}
          />
        ) : null}
        {nextFileName ? <NextFileNameLine name={nextFileName} /> : null}
      </section>
      <section
        id="min-b-note"
        className={`rounded-xl bg-card px-4 py-4 ring-1 ring-foreground/10 ${decisionUnderClass}`}
      >
        {fit ? (
          <MinimumPercentFit
            fit={fit}
            brief={decision.brief ?? []}
            selected={selected}
            solved={solved}
            onToggle={(runNumber) =>
              setSelected((current) =>
                current.includes(runNumber) ? current.filter((item) => item !== runNumber) : [...current, runNumber],
              )
            }
          />
        ) : (
          <>
            <h2 className="font-heading text-base">Why</h2>
            <div className="mt-1 flex flex-col gap-2 text-sm leading-relaxed text-foreground">
              {whyParagraphs(decision.why).map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
              {decision.bChoices && decision.bChoices.length > 1
                ? decision.bChoices.map((choice) => <p key={choice.id}>{choice.sentence}</p>)
                : null}
            </div>
          </>
        )}
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

export function SecondPercentChoice({
  recommended,
  picked,
  onPick,
}: {
  recommended: number;
  picked: number | null;
  onPick: (percent: number | null) => void;
}) {
  const typed = picked != null && Number.isFinite(picked) && Math.abs(picked - recommended) > 1e-6;
  const [mode, setMode] = useState<"recommended" | "typed">(typed ? "typed" : "recommended");
  const [draft, setDraft] = useState(typed ? String(picked) : "");
  return (
    <div id="second-min-choice" className="mt-3 flex flex-col gap-2">
      <button
        type="button"
        id="use-recommended-b"
        className="rounded-lg border border-[#0f6b56] bg-white px-3 py-2 text-left text-sm font-semibold text-[#144237]"
        onClick={() => {
          setMode("recommended");
          setDraft("");
          onPick(null);
        }}
      >
        {`Use ${formatPercentB(recommended)}% B`}
      </button>
      <button
        type="button"
        id="choose-other-b"
        className="rounded-lg border border-[#0f6b56] bg-white px-3 py-2 text-left text-sm font-semibold text-[#144237]"
        onClick={() => setMode("typed")}
      >
        Choose another %B
      </button>
      {mode === "typed" ? (
        <label className="flex flex-col gap-1 text-sm" htmlFor="typed-percent-b">
          %B for the 40°C run
          <input
            id="typed-percent-b"
            type="number"
            min={0}
            max={100}
            step="any"
            inputMode="decimal"
            value={draft}
            className="h-10 rounded-lg border border-input bg-white px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            onChange={(event) => {
              const text = event.target.value;
              setDraft(text);
              const value = Number(text);
              if (Number.isFinite(value) && value >= 0 && value <= 100) onPick(value);
            }}
          />
        </label>
      ) : null}
    </div>
  );
}

function MinimumPercentFit({
  fit,
  brief,
  selected,
  solved,
  onToggle,
}: {
  fit: RetentionFit;
  brief: string[];
  selected: number[];
  solved: MinimumFit | null;
  onToggle: (runNumber: number) => void;
}) {
  const chosen = new Set(selected);
  const percent = solved?.nextPercentB ?? fit.nextPercentB;
  return (
    <div id="min-b-fit" className="flex flex-col gap-4">
      <div>
        <h2 className="font-heading text-base">{minimumPercentHeading(percent)}</h2>
        <div className="mt-1 flex flex-col gap-2 text-sm leading-relaxed text-foreground">
          {brief.map((line) => (
            <p key={line}>{line}</p>
          ))}
          <p>{MINIMUM_PERCENT_SENTENCE}</p>
        </div>
      </div>
      <div>
        <h3 className="font-heading text-sm">Calculation</h3>
        <div className="mt-1 flex flex-col gap-2 text-sm leading-relaxed text-foreground">
          {solved ? (
            minimumPercentNote(solved, fit.specifiedTimeMin, fit.qtestSentence).map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))
          ) : (
            <p>
              {selected.length < 2
                ? "Fewer than two runs are selected, so the line cannot be drawn yet."
                : "The line cannot be drawn yet. At least two selected runs need a %B and a last peak after the t0 peak."}
            </p>
          )}
        </div>
      </div>
      {solved ? <LogKGraph fit={solved} /> : null}
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

function LogKGraph({ fit }: { fit: MinimumFit }) {
  const points = fit.rows.map((row) => ({ x: row.percentB, y: row.logK, run: row.runNumber }));
  const mark = { x: fit.rawPercentB, y: fit.logKTarget };
  const xs = [...points.map((point) => point.x), mark.x];
  const ys = [...points.map((point) => point.y), mark.y];
  let minX = Math.min(...xs);
  let maxX = Math.max(...xs);
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(0.05, maxY - minY);
  minX -= spanX * 0.18;
  maxX += spanX * 0.12;
  minY -= spanY * 0.22;
  maxY += spanY * 0.28;
  const width = 640;
  const height = 300;
  const left = 52;
  const right = 16;
  const top = 48;
  const bottom = 36;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const sx = (value: number) => left + ((value - minX) / (maxX - minX)) * plotW;
  const sy = (value: number) => top + ((maxY - value) / (maxY - minY)) * plotH;
  const yOnLine = (percent: number) => fit.m * percent + fit.c;
  const lineStart = sx(minX);
  const lineEnd = sx(maxX);
  const equation = lineEquation(fit.m, fit.c);
  const r2 = formatRSquared(fit.rSquared);
  return (
    <figure id="min-b-graph">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label={`${equation}. ${r2}. The unrounded %B is marked where the target logK meets the line.`}
      >
        <line x1={left} y1={top} x2={left} y2={top + plotH} stroke="#144237" strokeWidth="1" />
        <line x1={left} y1={top + plotH} x2={left + plotW} y2={top + plotH} stroke="#144237" strokeWidth="1" />
        <text x={left + plotW / 2} y={height - 8} textAnchor="middle" fill="#144237" fontSize="12">
          %B
        </text>
        <text x="14" y={top + plotH / 2} textAnchor="middle" fill="#144237" fontSize="12" transform={`rotate(-90 14 ${top + plotH / 2})`}>
          logK
        </text>
        <line
          x1={lineStart}
          y1={sy(yOnLine(minX))}
          x2={lineEnd}
          y2={sy(yOnLine(maxX))}
          stroke="#0f6b56"
          strokeWidth="2"
        />
        <line
          x1={left}
          y1={sy(mark.y)}
          x2={sx(mark.x)}
          y2={sy(mark.y)}
          stroke="#c2410c"
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />
        <line
          x1={sx(mark.x)}
          y1={sy(mark.y)}
          x2={sx(mark.x)}
          y2={top + plotH}
          stroke="#c2410c"
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />
        {points.map((point) => (
          <circle key={point.run} cx={sx(point.x)} cy={sy(point.y)} r="4.5" fill="#144237" />
        ))}
        <circle id="min-b-mark" cx={sx(mark.x)} cy={sy(mark.y)} r="5.5" fill="#c2410c" />
        <text x={sx(mark.x)} y={sy(mark.y) - 10} textAnchor="middle" fill="#c2410c" fontSize="12">
          {formatPercentB(mark.x)}% B
        </text>
        <text id="min-b-equation" x={left + plotW} y={16} textAnchor="end" fill="#144237" fontSize="13">
          {equation}
        </text>
        <text id="min-b-r2" x={left + plotW} y={34} textAnchor="end" fill="#144237" fontSize="13">
          {r2}
        </text>
      </svg>
    </figure>
  );
}

function sameRunSet(left: readonly number[], right: readonly number[]): boolean {
  if (left.length !== right.length) return false;
  const chosen = new Set(left);
  return right.every((run) => chosen.has(run));
}

function showMinutes(value: number | null): string {
  return value == null || !Number.isFinite(value) ? "—" : value.toFixed(3);
}

