"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseUserCount, parseUserNumber } from "@/lib/evaluate";
import type { RuleInputs, RunDetails } from "@/lib/run-details";

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
    <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Initial run details</CardTitle>
          <CardDescription>Saved with this session, even if a check does not use them yet.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <TextField
            label="Ligand"
            value={details.ligand}
            onChange={(value) => setDetail("ligand", value)}
          />
          <TextField
            label="Bead type"
            value={details.beadType}
            onChange={(value) => setDetail("beadType", value)}
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="core-shell">Core shell</Label>
            <Select
              value={details.coreShell === "" ? null : details.coreShell}
              onValueChange={(value) => setDetail("coreShell", value === "yes" || value === "no" ? value : "")}
            >
              <SelectTrigger id="core-shell" className="h-10 w-full">
                <SelectValue placeholder="Not set" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">Yes</SelectItem>
                <SelectItem value="no">No</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
            label="Solvent"
            value={details.solvent}
            onChange={(value) => setDetail("solvent", value)}
          />
          <TextField
            label="%B"
            value={details.percentB}
            onChange={(value) => setDetail("percentB", value)}
            inputMode="decimal"
          />
          <TextField
            label="Flow rate (mL/min)"
            value={details.flowRate}
            onChange={(value) => setDetail("flowRate", value)}
            inputMode="decimal"
          />
          <TextField
            label="Sample concentration"
            value={details.sampleConcentration}
            onChange={(value) => setDetail("sampleConcentration", value)}
            hint="Text is fine. Include the units if you want, such as 20 µM."
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

      <Card>
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
                : "Met when the last peak comes out at or after this many minutes. Longer is fine."
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
                : "Met when the smallest resolution, leaving out the first peak, is at least this number. If the file has fewer peaks than you asked for, this shows NA and is not met."
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
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
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
