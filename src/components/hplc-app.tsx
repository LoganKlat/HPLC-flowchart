"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { FileDrop } from "@/components/file-drop";
import { ResultsPanel } from "@/components/results-panel";
import { RunForm } from "@/components/run-form";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { evaluateRun, parseUserCount, parseUserNumber, type RuleNumbers } from "@/lib/evaluate";
import { EXAMPLE_FILES } from "@/lib/examples";
import { readLabFile, type LabFileRead } from "@/lib/lab-file";
import { emptyRuleInputs, emptyRunDetails, type RuleInputs, type RunDetails } from "@/lib/run-details";

const STAGES = [
  { id: "retention", label: "Retention" },
  { id: "selectivity", label: "Selectivity" },
  { id: "efficiency", label: "Efficiency" },
  { id: "gradient", label: "Gradient" },
] as const;

type StageId = (typeof STAGES)[number]["id"];

type StageLoad = {
  status: "empty" | "reading" | "ready" | "error";
  fileName: string | null;
  read: LabFileRead | null;
  message: string | null;
};

function emptyLoad(): StageLoad {
  return { status: "empty", fileName: null, read: null, message: null };
}

export function HplcApp() {
  const [stage, setStage] = useState<StageId>("retention");
  const [details, setDetails] = useState<RunDetails>(emptyRunDetails);
  const [rules, setRules] = useState<RuleInputs>(emptyRuleInputs);
  const [loads, setLoads] = useState<Record<StageId, StageLoad>>({
    retention: emptyLoad(),
    selectivity: emptyLoad(),
    efficiency: emptyLoad(),
    gradient: emptyLoad(),
  });

  const ruleNumbers = toRuleNumbers(rules);

  function beginRead(stageId: StageId, fileName: string) {
    setLoads((current) => ({
      ...current,
      [stageId]: { status: "reading", fileName, read: null, message: null },
    }));
  }

  async function acceptBuffer(stageId: StageId, fileName: string, buffer: ArrayBuffer) {
    setLoads((current) => ({
      ...current,
      [stageId]: { status: "reading", fileName, read: null, message: null },
    }));
    await new Promise((resolve) => setTimeout(resolve, 30));
    try {
      const read = readLabFile(buffer);
      if (read.blockingMessage) {
        setLoads((current) => ({
          ...current,
          [stageId]: { status: "error", fileName, read: null, message: read.blockingMessage },
        }));
        return;
      }
      setLoads((current) => ({
        ...current,
        [stageId]: { status: "ready", fileName, read, message: null },
      }));
    } catch {
      setLoads((current) => ({
        ...current,
        [stageId]: {
          status: "error",
          fileName,
          read: null,
          message: "This file could not be read.",
        },
      }));
    }
  }

  function acceptProblem(stageId: StageId, fileName: string, message: string) {
    setLoads((current) => ({
      ...current,
      [stageId]: { status: "error", fileName, read: null, message },
    }));
  }

  function goNext() {
    const index = STAGES.findIndex((item) => item.id === stage);
    const next = STAGES[index + 1];
    if (next) setStage(next.id);
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-5">
        <p className="text-xs tracking-[0.16em] text-[#0f6b56] uppercase">Composite sample</p>
        <h1 className="mt-1 font-heading text-3xl text-foreground sm:text-4xl">HPLC run check</h1>
        <p className="mt-2 max-w-2xl text-base text-muted-foreground">
          See whether this chromatogram meets the specs you set. Start with retention. You can move
          between stages and come back.
        </p>
      </header>

      <Tabs
        value={stage}
        onValueChange={(value) => {
          if (typeof value === "string" && STAGES.some((item) => item.id === value)) {
            setStage(value as StageId);
          }
        }}
      >
        <div className="sticky top-0 z-20 -mx-4 mb-5 border-b border-border bg-background/95 px-4 backdrop-blur sm:-mx-6 sm:px-6">
          <div className="overflow-x-auto">
            <TabsList variant="line" className="h-11 w-max min-w-full justify-start gap-1 bg-transparent p-0">
              {STAGES.map((item) => (
                <TabsTrigger key={item.id} value={item.id} className="h-11 px-4 text-base">
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </div>

        <TabsContent value="retention" className="flex flex-col gap-5">
          <RunForm details={details} rules={rules} onDetails={setDetails} onRules={setRules} />
          <StageBody
            stageId="retention"
            prompt="Drop in the lab file from the first run."
            load={loads.retention}
            ruleNumbers={ruleNumbers}
            rules={rules}
            showRulesReminder={false}
            laterStage={false}
            nextLabel="Selectivity"
            onBegin={beginRead}
            onBuffer={acceptBuffer}
            onProblem={acceptProblem}
            onNext={goNext}
          />
        </TabsContent>

        <TabsContent value="selectivity" className="flex flex-col gap-5">
          <StageBody
            stageId="selectivity"
            prompt="Drop in the lab file from the run at the new settings."
            load={loads.selectivity}
            ruleNumbers={ruleNumbers}
            rules={rules}
            showRulesReminder
            laterStage={false}
            nextLabel="Efficiency"
            onBegin={beginRead}
            onBuffer={acceptBuffer}
            onProblem={acceptProblem}
            onNext={goNext}
          />
        </TabsContent>

        <TabsContent value="efficiency" className="flex flex-col gap-5">
          <StageBody
            stageId="efficiency"
            prompt="Drop in the lab file from the run at the new settings."
            load={loads.efficiency}
            ruleNumbers={ruleNumbers}
            rules={rules}
            showRulesReminder
            laterStage
            nextLabel="Gradient"
            onBegin={beginRead}
            onBuffer={acceptBuffer}
            onProblem={acceptProblem}
            onNext={goNext}
          />
        </TabsContent>

        <TabsContent value="gradient" className="flex flex-col gap-5">
          <StageBody
            stageId="gradient"
            prompt="Drop in the lab file from the run at the new settings."
            load={loads.gradient}
            ruleNumbers={ruleNumbers}
            rules={rules}
            showRulesReminder
            laterStage
            nextLabel={null}
            onBegin={beginRead}
            onBuffer={acceptBuffer}
            onProblem={acceptProblem}
            onNext={goNext}
          />
        </TabsContent>
      </Tabs>

      <footer className="mt-10 border-t border-border pt-4 text-xs text-muted-foreground">
        Work for Logan Klat.
      </footer>
    </div>
  );
}

function StageBody({
  stageId,
  prompt,
  load,
  ruleNumbers,
  rules,
  showRulesReminder,
  laterStage,
  nextLabel,
  onBegin,
  onBuffer,
  onProblem,
  onNext,
}: {
  stageId: StageId;
  prompt: string;
  load: StageLoad;
  ruleNumbers: RuleNumbers;
  rules: RuleInputs;
  showRulesReminder: boolean;
  laterStage: boolean;
  nextLabel: string | null;
  onBegin: (stageId: StageId, fileName: string) => void;
  onBuffer: (stageId: StageId, fileName: string, buffer: ArrayBuffer) => void;
  onProblem: (stageId: StageId, fileName: string, message: string) => void;
  onNext: () => void;
}) {
  const rows = load.read ? evaluateRun(load.read, ruleNumbers) : null;

  return (
    <>
      {laterStage ? (
        <p className="rounded-xl bg-[#e7f3ee] px-4 py-3 text-sm text-[#144237]" role="status">
          This stage comes later. The page is here so the path is ready.
        </p>
      ) : null}
      {showRulesReminder ? <RulesReminder rules={rules} /> : null}
      {stageId !== "retention" ? (
        <Placeholder
          title="Next change"
          body="This will say what to change on the machine. That part is not built yet."
        />
      ) : null}
      <FileDrop
        prompt={prompt}
        examples={EXAMPLE_FILES}
        reading={load.status === "reading"}
        onBegin={(fileName) => onBegin(stageId, fileName)}
        onBuffer={(fileName, buffer) => void onBuffer(stageId, fileName, buffer)}
        onProblem={(fileName, message) => onProblem(stageId, fileName, message)}
      />
      <div aria-live="polite" className="flex flex-col gap-4">
        {load.status === "empty" ? (
          <p className="text-sm text-muted-foreground">No file yet. Drop in the lab file to see the chromatogram and the checks.</p>
        ) : null}
        {load.status === "reading" ? (
          <p className="text-sm text-foreground" role="status">
            Reading the file…
          </p>
        ) : null}
        {load.status === "error" && load.message ? (
          <div className="rounded-xl bg-orange-50 px-4 py-3 text-sm text-orange-950 ring-1 ring-orange-200" role="alert">
            {load.fileName ? <span className="mb-1 block font-medium">{load.fileName}</span> : null}
            {load.message}
          </div>
        ) : null}
        {load.status === "ready" && load.read && rows && load.fileName ? (
          <ResultsPanel fileName={load.fileName} read={load.read} rows={rows} />
        ) : null}
      </div>
      {stageId === "retention" ? (
        <Placeholder
          title="Next change"
          body="This will say what to change on the machine. That part is not built yet."
        />
      ) : null}
      {load.status === "ready" && load.read ? (
        <Placeholder title="Why" body="This will say why. That part is not built yet." />
      ) : null}
      {nextLabel ? (
        <div>
          <Button type="button" className="h-10 px-4" onClick={onNext}>
            Next stage
            <ArrowRight />
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">Opens {nextLabel}.</p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">This is the last stage.</p>
      )}
    </>
  );
}

function RulesReminder({ rules }: { rules: RuleInputs }) {
  const bits = [
    rules.requiredPeaks.trim()
      ? `${rules.requiredPeaks.trim()} peaks`
      : "peak count not set",
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
      <span className="font-medium">Rules from Retention. </span>
      {bits.join(" · ")}
    </p>
  );
}

function Placeholder({ title, body }: { title: string; body: string }) {
  return (
    <section className="rounded-xl border border-dashed border-border bg-card/70 px-4 py-4">
      <h2 className="font-heading text-base">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </section>
  );
}

function toRuleNumbers(rules: RuleInputs): RuleNumbers {
  return {
    requiredPeaks: parseUserCount(rules.requiredPeaks),
    lastPeakTimeMin: parseUserNumber(rules.lastPeakTimeMin),
    minResolution: parseUserNumber(rules.minResolution),
    maxBackPressurePsi: parseUserNumber(rules.maxBackPressurePsi),
  };
}
