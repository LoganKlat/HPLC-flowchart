"use client";

import { ChoiceSelect } from "@/components/choice-select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseUserCount, parseUserNumber } from "@/lib/evaluate";
import type { RuleInputs, RunDetails } from "@/lib/run-details";
import { LIGANDS, SOLVENTS } from "@/lib/selectivity";

type RunFormProps = {
  details: RunDetails;
  rules: RuleInputs;
  onDetails: (details: RunDetails) => void;
  onRules: (rules: RuleInputs) => void;
};

export function RunForm({ details, rules, onDetails, onRules }: RunFormProps) {
  function setDetail<K extends keyof RunDetails>(key: K, value: RunDetails[K]) {
    onDetails({ ...details, [key]: value });
  }

  function setRule<K extends keyof RuleInputs>(key: K, value: string) {
    onRules({ ...rules, [key]: value });
  }

  return (
    <div id="setup-boxes" className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">
      <Card className="@container h-full">
        <CardHeader>
          <CardTitle>Initial run details</CardTitle>
          <CardDescription>Saved with this session, even if a check does not use them yet.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-x-4 gap-y-3 @min-[28rem]:grid-cols-2">
          <ChoiceField
            label="Solvent"
            value={details.solvent}
            placeholder="Choose a solvent"
            options={SOLVENTS.map((solvent) => ({ value: solvent.label, label: solvent.label }))}
            onChange={(value) => setDetail("solvent", value)}
          />
          <TextField
            label="pH"
            value={details.ph}
            onChange={(value) => setDetail("ph", value)}
            inputMode="decimal"
          />
          <ChoiceField
            label="Method"
            value={details.method}
            placeholder="select a method"
            placeholderInList={false}
            options={[
              { value: "GRA", label: "GRA" },
              { value: "ISO", label: "ISO" },
            ]}
            onChange={(value) => setDetail("method", value === "GRA" || value === "ISO" ? value : "")}
          />
          <TextField
            label="%B"
            value={details.percentB}
            onChange={(value) => setDetail("percentB", value)}
            inputMode="decimal"
            hint="Saved on Run 1. Each later run keeps its own %B."
          />
          <TextField
            label="Flow rate (mL/min)"
            value={details.flowRate}
            onChange={(value) => setDetail("flowRate", value)}
            inputMode="decimal"
          />
          <TextField
            label="Injection volume"
            value={details.injectionVolume}
            onChange={(value) => setDetail("injectionVolume", value)}
          />
          <ChoiceField
            label="Sample type"
            value={details.sampleType === "CP" || details.sampleType === "BLANK" ? details.sampleType : ""}
            placeholder="select a sample type"
            placeholderInList={false}
            options={[
              { value: "CP", label: "CP" },
              { value: "BLANK", label: "BLANK" },
            ]}
            onChange={(value) => setDetail("sampleType", value === "CP" || value === "BLANK" ? value : "")}
          />
          <TextField
            label="Sample concentration (mg/mL)"
            value={details.sampleConcentration}
            onChange={(value) => setDetail("sampleConcentration", value)}
          />
          <ChoiceField
            label="Ligand"
            value={details.ligand}
            placeholder="select a ligand"
            options={LIGANDS.map((name) => ({ value: name, label: name }))}
            onChange={(value) => setDetail("ligand", value)}
          />
          <ChoiceField
            label="Core shell"
            value={details.coreShell}
            placeholder="select an option"
            placeholderInList={false}
            options={[
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ]}
            onChange={(value) =>
              setDetail("coreShell", value === "yes" || value === "no" ? value : "")
            }
          />
          <TextField
            label="Pore size (Å)"
            value={details.poreSize}
            onChange={(value) => setDetail("poreSize", value)}
            inputMode="decimal"
          />
          <TextField
            label="Carbon load (%)"
            value={details.carbonLoad}
            onChange={(value) => setDetail("carbonLoad", value)}
            inputMode="decimal"
          />
          <TextField
            label="Length (mm)"
            value={details.lengthMm}
            onChange={(value) => setDetail("lengthMm", value)}
            inputMode="decimal"
          />
          <TextField
            label="Diameter (mm)"
            value={details.diameterMm}
            onChange={(value) => setDetail("diameterMm", value)}
            inputMode="decimal"
          />
          <TextField
            label="Particle size (µm)"
            value={details.particleSize}
            onChange={(value) => setDetail("particleSize", value)}
            inputMode="decimal"
          />
          <TextField
            label="Temperature (°C)"
            value={details.temperature}
            onChange={(value) => setDetail("temperature", value)}
            inputMode="decimal"
          />
          <TextField
            label="Wavelength (nm)"
            value={details.wavelength}
            onChange={(value) => setDetail("wavelength", value)}
            inputMode="decimal"
          />
        </CardContent>
      </Card>

      <Card className="h-full">
        <CardHeader>
          <CardTitle>Rules to meet</CardTitle>
          <CardDescription>Leave a box empty if you are not checking it yet.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <TextField
            label="Number of peaks to separate"
            value={rules.requiredPeaks}
            onChange={(value) => setRule("requiredPeaks", value)}
            inputMode="numeric"
            hint={
              rules.requiredPeaks.trim() && parseUserCount(rules.requiredPeaks) == null
                ? "Use a whole number."
                : "Met when the file has at least this many peaks."
            }
            invalid={rules.requiredPeaks.trim() !== "" && parseUserCount(rules.requiredPeaks) == null}
          />
          <TextField
            label="Last peak time (minutes)"
            value={rules.lastPeakTimeMin}
            onChange={(value) => setRule("lastPeakTimeMin", value)}
            inputMode="decimal"
            hint={
              rules.lastPeakTimeMin.trim() && parseUserNumber(rules.lastPeakTimeMin) == null
                ? "Use a number."
                : "Met when the last peak comes out at or before this many minutes. Later than that is not met."
            }
            invalid={
              rules.lastPeakTimeMin.trim() !== "" && parseUserNumber(rules.lastPeakTimeMin) == null
            }
          />
          <TextField
            label="Minimum resolution"
            value={rules.minResolution}
            onChange={(value) => setRule("minResolution", value)}
            inputMode="decimal"
            hint={
              rules.minResolution.trim() && parseUserNumber(rules.minResolution) == null
                ? "Use a number."
                : "Met when the smallest resolution, leaving out the t0 peak, is at least this number. If the file has fewer peaks than the specification, this shows NA and is not met."
            }
            invalid={rules.minResolution.trim() !== "" && parseUserNumber(rules.minResolution) == null}
          />
          <TextField
            label="Max back-pressure (psi)"
            value={rules.maxBackPressurePsi}
            onChange={(value) => setRule("maxBackPressurePsi", value)}
            inputMode="decimal"
            hint={
              rules.maxBackPressurePsi.trim() && parseUserNumber(rules.maxBackPressurePsi) == null
                ? "Use a number."
                : "Met when the highest pressure is at or below this number."
            }
            invalid={
              rules.maxBackPressurePsi.trim() !== "" &&
              parseUserNumber(rules.maxBackPressurePsi) == null
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}

function ChoiceField({
  label,
  value,
  onChange,
  options,
  placeholder,
  placeholderInList,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  placeholder: string;
  placeholderInList?: boolean;
}) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id} className="h-auto whitespace-normal leading-snug">
        {label}
      </Label>
      <ChoiceSelect
        id={id}
        value={value}
        onChange={onChange}
        options={options}
        placeholder={placeholder}
        placeholderInList={placeholderInList}
      />
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  hint,
  inputMode,
  invalid,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  inputMode?: "decimal" | "numeric" | "text";
  invalid?: boolean;
}) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id} className="h-auto whitespace-normal leading-snug">
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        inputMode={inputMode}
        aria-invalid={invalid || undefined}
        className="h-10"
        onChange={(event) => onChange(event.target.value)}
      />
      {hint ? <p className="text-xs leading-snug text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
