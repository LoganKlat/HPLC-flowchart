"use client";

import { useMemo, useState } from "react";
import { FileDrop } from "@/components/file-drop";
import { LaterChangeNote, RetentionDecisionView } from "@/components/retention-decision";
import { ResultsPanel } from "@/components/results-panel";
import { RunForm } from "@/components/run-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { evaluateRun, parseUserCount, parseUserNumber, type RuleNumbers } from "@/lib/evaluate";
import { readLabFile, type LabFileRead } from "@/lib/lab-file";
import { decideRetention, formatPercentB, type RetentionSample } from "@/lib/retention";
import { emptyRuleInputs, emptyRunDetails, type RuleInputs, type RunDetails } from "@/lib/run-details";

type RunState = {
  percentB: string;
  percentEdited: boolean;
  afterRetention: boolean;
  status: "empty" | "reading" | "ready" | "error";
  fileName: string | null;
  read: LabFileRead | null;
  message: string | null;
};

function emptyRun(): RunState {
  return {
    percentB: "",
    percentEdited: false,
    afterRetention: false,
    status: "empty",
    fileName: null,
    read: null,
    message: null,
  };
}

export function HplcApp() {
  const [active, setActive] = useState(0);
  const [details, setDetails] = useState<RunDetails>(emptyRunDetails);
  const [rules, setRules] = useState<RuleInputs>(emptyRuleInputs);
  const [runs, setRuns] = useState<RunState[]>([emptyRun()]);

  const checks = useMemo(() => toRuleNumbers(rules), [rules]);
  const retentionRules = useMemo(
    () => ({
      requiredPeaks: checks.requiredPeaks,
      lastPeakTimeMin: checks.lastPeakTimeMin,
      maxBackPressurePsi: checks.maxBackPressurePsi,
    }),
    [checks],
  );
  const syncedRuns = syncNextRun(runs, retentionRules);
  if (syncedRuns !== runs) {
    setRuns(syncedRuns);
  }
  const shown = Math.min(active, Math.max(0, syncedRuns.length - 1));

  function onDetails(next: RunDetails) {
    setDetails(next);
    setRuns((current) => {
      if (current[0].percentB === next.percentB) return current;
      const copy = current.slice();
      copy[0] = { ...copy[0], percentB: next.percentB, percentEdited: true };
      return copy;
    });
  }

  function setRunPercent(index: number, value: string) {
    setRuns((current) => {
      const copy = current.slice();
      copy[index] = { ...copy[index], percentB: value, percentEdited: true };
      return copy;
    });
  }

  function patchRun(index: number, patch: Partial<RunState>) {
    setRuns((current) => {
      const copy = current.slice();
      copy[index] = { ...copy[index], ...patch };
      return copy;
    });
  }

  function beginRead(index: number, fileName: string) {
    patchRun(index, { status: "reading", fileName, read: null, message: null });
  }

  async function acceptBuffer(index: number, fileName: string, buffer: ArrayBuffer) {
    patchRun(index, { status: "reading", fileName, read: null, message: null });
    await new Promise((resolve) => setTimeout(resolve, 30));
    try {
      const read = readLabFile(buffer);
      if (read.blockingMessage) {
        patchRun(index, { status: "error", fileName, read: null, message: read.blockingMessage });
        return;
      }
      patchRun(index, { status: "ready", fileName, read, message: null });
    } catch {
      patchRun(index, {
        status: "error",
        fileName,
        read: null,
        message: "This file could not be read.",
      });
    }
  }

  function acceptProblem(index: number, fileName: string, message: string) {
    patchRun(index, { status: "error", fileName, read: null, message });
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-5">
        <p className="text-xs tracking-[0.16em] text-[#0f6b56] uppercase">Composite sample</p>
        <h1 className="mt-1 font-heading text-3xl text-foreground sm:text-4xl">HPLC run check</h1>
        <p className="mt-2 max-w-2xl text-base text-muted-foreground">
          See whether this chromatogram meets the rules you set. While retention is still the step,
          the page says what %B to run next.
        </p>
      </header>

      <Tabs
        value={String(shown)}
        onValueChange={(value) => {
          const index = Number(value);
          if (index >= 0 && index < syncedRuns.length) setActive(index);
        }}
      >
        <div className="sticky top-0 z-20 -mx-4 mb-5 border-b border-border bg-background/95 px-4 backdrop-blur sm:-mx-6 sm:px-6">
          <div className="overflow-x-auto">
            <TabsList variant="line" className="h-11 w-max min-w-full justify-start gap-1 bg-transparent p-0">
              {syncedRuns.map((_, index) => (
                <TabsTrigger key={index} value={String(index)} className="h-11 px-4 text-base">
                  Run {index + 1}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </div>

        {syncedRuns.map((run, index) => (
          <TabsContent key={index} value={String(index)} className="flex flex-col gap-5">
            <RunPane
              index={index}
              run={run}
              runs={syncedRuns}
              details={details}
              rules={rules}
              checks={checks}
              retentionRules={retentionRules}
              onDetails={onDetails}
              onRules={setRules}
              onPercent={(value) => setRunPercent(index, value)}
              onBegin={beginRead}
              onBuffer={acceptBuffer}
              onProblem={acceptProblem}
              onOpen={(next) => setActive(next)}
            />
          </TabsContent>
        ))}
      </Tabs>

      <footer className="mt-10 border-t border-border pt-4 text-xs text-muted-foreground">
        Work for Logan Klat.
      </footer>
    </div>
  );
}

function RunPane({
  index,
  run,
  runs,
  details,
  rules,
  checks,
  retentionRules,
  onDetails,
  onRules,
  onPercent,
  onBegin,
  onBuffer,
  onProblem,
  onOpen,
}: {
  index: number;
  run: RunState;
  runs: RunState[];
  details: RunDetails;
  rules: RuleInputs;
  checks: RuleNumbers;
  retentionRules: {
    requiredPeaks: number | null;
    lastPeakTimeMin: number | null;
    maxBackPressurePsi: number | null;
  };
  onDetails: (details: RunDetails) => void;
  onRules: (rules: RuleInputs) => void;
  onPercent: (value: string) => void;
  onBegin: (index: number, fileName: string) => void;
  onBuffer: (index: number, fileName: string, buffer: ArrayBuffer) => void;
  onProblem: (index: number, fileName: string, message: string) => void;
  onOpen: (index: number) => void;
}) {
  if (run.afterRetention) {
    return <LaterChangeNote />;
  }

  const decision = decisionFor(runs, index, retentionRules);
  const rows = run.read ? evaluateRun(run.read, checks) : null;
  const next = runs[index + 1];

  return (
    <>
      {index === 0 ? (
        <RunForm details={details} rules={rules} onDetails={onDetails} onRules={onRules} />
      ) : (
        <>
          <ColumnReminder details={details} />
          <RulesReminder rules={rules} />
          <Card>
            <CardHeader>
              <CardTitle>%B for this run</CardTitle>
              <CardDescription>
                Filled in from the last recommendation. Change it if this chromatogram was run at a
                different %B.
              </CardDescription>
            </CardHeader>
            <CardContent className="max-w-xs">
              <Label htmlFor={`run-${index + 1}-percent-b`}>%B</Label>
              <Input
                id={`run-${index + 1}-percent-b`}
                value={run.percentB}
                inputMode="decimal"
                className="mt-1.5 h-10"
                onChange={(event) => onPercent(event.target.value)}
              />
            </CardContent>
          </Card>
        </>
      )}

      <section
        className={
          "flex min-h-[28rem] flex-col gap-4 rounded-xl border-2 bg-card p-4 sm:p-5 " +
          (run.status === "ready" ? "border-solid border-border" : "border-dashed border-border")
        }
      >
        {run.status === "ready" && run.read && rows && run.fileName ? (
          <>
            <ResultsPanel fileName={run.fileName} read={run.read} rows={rows} />
            {decision ? <RetentionDecisionView decision={decision} /> : null}
            {next ? (
              <div className="mt-auto flex flex-col gap-2">
                <Button
                  type="button"
                  className="h-16 w-full text-lg font-semibold tracking-wide"
                  onClick={() => onOpen(index + 1)}
                >
                  NEXT RUN
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  {next.afterRetention
                    ? "Retention is finished. The next kind of change is not built yet."
                    : `Run ${index + 2} opens with ${next.percentB ? `${next.percentB}% B` : "the %B"} filled in.`}
                </p>
              </div>
            ) : null}
          </>
        ) : (
          <div aria-live="polite" className="flex flex-1 flex-col gap-4">
            <FileDrop
              prompt={
                index === 0
                  ? "Drop in the lab file from the first run."
                  : "Drop in the lab file from the run at this %B."
              }
              reading={run.status === "reading"}
              onBegin={(fileName) => onBegin(index, fileName)}
              onBuffer={(fileName, buffer) => void onBuffer(index, fileName, buffer)}
              onProblem={(fileName, message) => onProblem(index, fileName, message)}
            />
            {run.status === "empty" && run.percentB.trim() ? (
              <p className="text-center text-sm text-muted-foreground">
                This run is set to {run.percentB}% B. Change it if the file you upload was run at a
                different %B.
              </p>
            ) : null}
            {run.status === "reading" ? (
              <p className="text-center text-sm text-foreground" role="status">
                Reading the file…
              </p>
            ) : null}
            {run.status === "error" && run.message ? (
              <div
                className="rounded-xl bg-orange-50 px-4 py-3 text-sm text-orange-950 ring-1 ring-orange-200"
                role="alert"
              >
                {run.fileName ? <span className="mb-1 block font-medium">{run.fileName}</span> : null}
                {run.message}
              </div>
            ) : null}
          </div>
        )}
      </section>
    </>
  );
}

function ColumnReminder({ details }: { details: RunDetails }) {
  const bits = [
    details.ligand.trim() && `Ligand ${details.ligand.trim()}`,
    details.lengthMm.trim() && details.diameterMm.trim()
      ? `${details.lengthMm.trim()} × ${details.diameterMm.trim()} mm`
      : "",
    details.particleSize.trim() && `${details.particleSize.trim()} µm`,
    details.solvent.trim(),
    details.flowRate.trim() && `${details.flowRate.trim()} mL/min`,
  ].filter((bit): bit is string => Boolean(bit));

  return (
    <p className="rounded-xl bg-card px-4 py-3 text-sm ring-1 ring-foreground/10">
      Column and the other starting details stay with every run. Change them on Run 1.
      {bits.length > 0 ? ` ${bits.join(" · ")}.` : ""}
    </p>
  );
}

function RulesReminder({ rules }: { rules: RuleInputs }) {
  const bits = [
    rules.requiredPeaks.trim() ? `${rules.requiredPeaks.trim()} peaks` : "peak count not set",
    rules.lastPeakTimeMin.trim()
      ? `last peak at or after ${rules.lastPeakTimeMin.trim()} min`
      : "last peak time not set",
    rules.minResolution.trim()
      ? `resolution at least ${rules.minResolution.trim()}`
      : "resolution not set",
    rules.maxBackPressurePsi.trim()
      ? `back-pressure at or below ${rules.maxBackPressurePsi.trim()} psi`
      : "back-pressure not set",
  ];

  return (
    <p className="rounded-xl bg-card px-4 py-3 text-sm ring-1 ring-foreground/10">
      <span className="font-medium">Rules set on Run 1. </span>
      {bits.join(" · ")}
    </p>
  );
}

function decisionFor(
  runs: RunState[],
  index: number,
  rules: {
    requiredPeaks: number | null;
    lastPeakTimeMin: number | null;
    maxBackPressurePsi: number | null;
  },
) {
  const run = runs[index];
  if (!run || run.status !== "ready" || !run.read) return null;
  for (let i = 0; i < index; i++) {
    if (runs[i].status !== "ready" || !runs[i].read) return null;
  }
  return decideRetention(runs.slice(0, index + 1).map(toSample), rules);
}

function syncNextRun(
  runs: RunState[],
  rules: {
    requiredPeaks: number | null;
    lastPeakTimeMin: number | null;
    maxBackPressurePsi: number | null;
  },
): RunState[] {
  const count = readyPrefix(runs);
  if (count === 0) return runs;
  const decision = decideRetention(runs.slice(0, count).map(toSample), rules);
  const next = runs[count];

  if (decision.status === "blocked") {
    if (!next || next.status !== "empty" || next.percentEdited) return runs;
    if (runs.length !== count + 1) return runs;
    return runs.slice(0, count);
  }

  const prefill =
    decision.status === "recommend" && decision.nextPercentB != null
      ? formatPercentB(decision.nextPercentB)
      : "";
  const afterRetention = decision.status === "finished";

  if (!next) {
    if (runs.length !== count) return runs;
    return [...runs, { ...emptyRun(), percentB: prefill, percentEdited: false, afterRetention }];
  }
  if (next.status !== "empty") return runs;
  if (next.percentEdited) {
    if (next.afterRetention === afterRetention) return runs;
    const copy = runs.slice();
    copy[count] = { ...next, afterRetention };
    return copy;
  }
  if (next.percentB === prefill && next.afterRetention === afterRetention) return runs;
  const copy = runs.slice();
  copy[count] = { ...next, percentB: prefill, afterRetention };
  return copy;
}

function readyPrefix(runs: RunState[]): number {
  let count = 0;
  for (const run of runs) {
    if (run.status !== "ready" || !run.read) break;
    count += 1;
  }
  return count;
}

function toSample(run: RunState): RetentionSample {
  return {
    percentB: parseUserNumber(run.percentB),
    peakCount: run.read?.peakCount ?? null,
    lastPeakTimeMin: run.read?.lastPeakTimeMin ?? null,
    firstPeakTimeMin: run.read?.firstPeakTimeMin ?? null,
    minResolutionExcludingFirst: run.read?.minResolutionExcludingFirst ?? null,
    maxBackPressurePsi: run.read?.maxBackPressurePsi ?? null,
  };
}

function toRuleNumbers(rules: RuleInputs): RuleNumbers {
  return {
    requiredPeaks: parseUserCount(rules.requiredPeaks),
    lastPeakTimeMin: parseUserNumber(rules.lastPeakTimeMin),
    minResolution: parseUserNumber(rules.minResolution),
    maxBackPressurePsi: parseUserNumber(rules.maxBackPressurePsi),
  };
}
