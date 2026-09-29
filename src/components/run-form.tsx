"use client";

import { useState } from "react";
import { ChoiceSelect } from "@/components/choice-select";
import { FunctionNoteView, type FunctionNote } from "@/components/function-note";
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

type Explained = { title: string; note: FunctionNote };

const runNotes = {
  solvent: {
    title: "Solvent",
    note: {
      does: "The organic solvent in the mix that carries the sample. The choices are ACN, MeOH, and THF.",
      sets: "The solvent bottles, blended by the pump. This menu records which organic solvent Run 1 uses.",
      range: "ACN, MeOH, or THF. A name, not a number. The menu only offers those three.",
      changes:
        "A solvent change is a selectivity change: peaks can pull apart or change order. The chart %B keeps the retention time similar when the solvent changes. It does not change efficiency by itself.",
    },
  },
  method: {
    title: "Method",
    note: {
      does: "ISO holds one %B steady for the whole run. GRA is a gradient: %B changes while the run is going.",
      sets: "The pump method. This menu records ISO or GRA for Run 1.",
      range: "ISO or GRA only. Not a number, so there are no units.",
      changes:
        "A gradient changes retention during the run. Compounds that would stay a long time at low %B are pushed off as %B rises. Peaks can also pull apart or change order, which is a selectivity change. It does not by itself set efficiency, which is how narrow each peak is.",
    },
  },
  percentB: {
    title: "%B",
    note: {
      does: "%B is the percent of organic solvent in the liquid that carries the sample.",
      sets: "The pump blends it. This box records the %B for Run 1. Each later run keeps its own %B.",
      range:
        "0–100%. Calculated %B and an in-between %B are held inside 0–100. This box does not enforce a maximum. It accepts what is typed.",
      changes:
        "A higher %B lowers retention (k). A lower %B raises retention, quickly. %B is not the selectivity change. Selectivity is temperature, then solvent, then the ligand. %B does not change efficiency by itself.",
    },
  },
  flow: {
    title: "Flow rate",
    note: {
      does: "How fast the pump pushes liquid through the column.",
      sets: "The pump. This box records the flow for Run 1.",
      range:
        "mL/min. A usual range for these columns is about 0.2–2 mL/min on a 4.6 mm column, and lower on a 2.1 mm column. The page does not enforce a pump maximum. The box accepts what is typed.",
      changes:
        "Flow changes the clock time of the chromatogram and the back-pressure. It does not change retention factor k, because the unretained peak and the retained peaks speed up together. It does not change selectivity. Efficiency does change with flow: far from a usual flow for that column width, peaks get wider.",
    },
  },
  injection: {
    title: "Injection volume",
    note: {
      does: "How much sample is loaded onto the column in one injection.",
      sets: "The manual injector or the autosampler. This box records the volume for Run 1.",
      range: "µL. The page does not enforce a maximum. The box accepts what is typed.",
      changes:
        "It does not change retention (k) or selectivity. A small injection does not change efficiency. A very large injection can widen peaks, which lowers efficiency.",
    },
  },
  ligand: {
    title: "Ligand",
    note: {
      does: "The ligand is the coating bonded on the silica. It is the group the compounds stick to.",
      sets: "The column coating. This menu records it for Run 1. The Beads tab uses the same list.",
      range: "C18, C18aq, PFPP, C8, biphenyl, or IBD. A name, not a number. No units.",
      changes:
        "The ligand is the coating and is the last selectivity change. Peaks can pull apart or change order. Retention also changes, because a different coating holds compounds more or less strongly. It does not by itself change efficiency.",
    },
  },
  coreShell: {
    title: "Core shell",
    note: {
      does: "Yes means a core-shell particle, a solid core with a thin porous layer. No means fully porous, porous all the way through.",
      sets: "The column particle. This menu records the choice for Run 1. The Beads tab has the same two choices.",
      range: "Yes or No. Not a number. No units.",
      changes:
        "Core shell means a shorter path, narrower peaks, and often less retention. Narrower peaks are higher efficiency. Fully porous means more surface, more retention, and peaks that can be wider. Selectivity does not change from this choice alone.",
    },
  },
  pore: {
    title: "Pore size",
    note: {
      does: "Pore size is the width of the channels inside the bead. A wider pore lets larger compounds in. A narrower pore has more surface for small compounds.",
      sets: "The column packing. This box records it for Run 1. The Beads tab slider draws the same width.",
      range:
        "The Beads slider runs from 60–300 Å and starts at 100 Å. This box does not enforce that maximum. It accepts what is typed. The unit is Å.",
      changes:
        "If a compound is too big for the pore, it cannot reach the coating inside, so retention and selectivity can change. For small compounds that fit, a narrower pore means more surface and often more retention. Pore size does not change efficiency the way particle size does.",
    },
  },
  carbon: {
    title: "Carbon load",
    note: {
      does: "Carbon load is the share of the bead that is carbon from the bonded ligands. A higher percent means more of the surface is coated and fewer free SiOH groups are left. On the Beads picture, the percent is that share out of 100 spots. At 10%, 10 spots are ligands and 90 are still SiOH.",
      sets: "The column packing. This box records it for Run 1. The carbon-load slider on the Beads tab sets the picture.",
      range:
        "The Beads slider runs from 0–100% and starts at 10%. This box does not enforce that maximum. It accepts what is typed. The unit is percent.",
      changes:
        "A higher carbon load holds oily compounds longer on a coating such as C18, and bases tail less because fewer free silanols are left to grab them. A lower carbon load leaves more SiOH. Polar compounds and bases can stick to those silanols, so peaks can tail, and oily compounds are usually held less strongly. Holding longer is retention. Tailing is wider peaks, which is lower efficiency. Bases and polar compounds sticking to free SiOH, instead of the ligand, is a selectivity change.",
    },
  },
  length: {
    title: "Length",
    note: {
      does: "Length is how long the column tube is.",
      sets: "The column. This box records it for Run 1. The length slider on the Column tab draws the same length.",
      range:
        "The Column slider runs from 50–250 mm and starts at 150 mm. This box does not enforce that maximum. It accepts what is typed. The unit is mm.",
      changes:
        "A longer column: retention and back-pressure rise in line with length, and resolution rises about with the square root of length. Selectivity does not change. A shorter column does the opposite.",
    },
  },
  diameter: {
    title: "Diameter",
    note: {
      does: "Diameter here is the internal diameter, the width of the column tube inside.",
      sets: "The column. This box records it for Run 1. The width slider on the Column tab draws the same internal diameter.",
      range:
        "The Column slider runs from 2.1–4.6 mm and starts at 4.6 mm. This box does not enforce that maximum. It accepts what is typed. The unit is mm.",
      changes:
        "A wider column: retention time rises with the square of the width, resolution drops a lot, and back-pressure falls with 1 over the square of the width. Selectivity does not change. A narrower column does the opposite, until system peaks.",
    },
  },
  particle: {
    title: "Particle size",
    note: {
      does: "Particle size is the diameter of the bead.",
      sets: "The column packing. This box records it for Run 1. The particle-size slider on the Beads tab uses the same diameter.",
      range:
        "The Beads slider runs from 1.5–10 µm and starts at 5 µm. This box does not enforce that maximum. It accepts what is typed. The unit is µm.",
      changes:
        "Smaller particles give narrower peaks and higher back-pressure. Narrower peaks are higher efficiency. Larger particles give wider peaks and lower back-pressure. Selectivity does not change. Retention factor k does not change from particle size alone.",
    },
  },
  temperature: {
    title: "Oven temperature",
    note: {
      does: "The temperature the oven holds the column at.",
      sets: "The oven. This box records it for Run 1.",
      range:
        "°C. This class uses about 25°C, then 40°C and 60°C. The page does not enforce an oven maximum. The box accepts what is typed.",
      changes:
        "Temperature changes selectivity and usually shortens retention. The same %B is kept after a temperature change, so the solvent strength stays the same. It is not an efficiency change.",
    },
  },
  wavelength: {
    title: "Wavelength",
    note: {
      does: "The wavelength the detector uses to see the sample.",
      sets: "The UV or PDA detector. This box records it for Run 1.",
      range: "nm. The page does not enforce a detector maximum. The box accepts what is typed.",
      changes:
        "Detector wavelength does not change retention (k), selectivity, or efficiency. It changes whether the peak is visible.",
    },
  },
} satisfies Record<string, Explained>;

export function RunForm({ details, rules, onDetails, onRules }: RunFormProps) {
  const [hoverNote, setHoverNote] = useState<Explained | null>(null);
  const [focusNote, setFocusNote] = useState<Explained | null>(null);
  const fieldNote = hoverNote ?? focusNote;

  function setDetail<K extends keyof RunDetails>(key: K, value: RunDetails[K]) {
    onDetails({ ...details, [key]: value });
  }

  function setRule<K extends keyof RuleInputs>(key: K, value: string) {
    onRules({ ...rules, [key]: value });
  }

  function explain(note: Explained) {
    return {
      onMouseEnter: () => setHoverNote(note),
      onMouseLeave: () => setHoverNote((current) => (current === note ? null : current)),
      onFocus: () => setFocusNote(note),
      onBlur: () => setFocusNote((current) => (current === note ? null : current)),
    };
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
            explain={explain(runNotes.solvent)}
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
            explain={explain(runNotes.method)}
          />
          <TextField
            label="%B"
            value={details.percentB}
            onChange={(value) => setDetail("percentB", value)}
            inputMode="decimal"
            hint="Saved on Run 1. Each later run keeps its own %B."
            explain={explain(runNotes.percentB)}
          />
          <TextField
            label="Flow rate (mL/min)"
            value={details.flowRate}
            onChange={(value) => setDetail("flowRate", value)}
            inputMode="decimal"
            explain={explain(runNotes.flow)}
          />
          <TextField
            label="Injection volume"
            value={details.injectionVolume}
            onChange={(value) => setDetail("injectionVolume", value)}
            explain={explain(runNotes.injection)}
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
            explain={explain(runNotes.ligand)}
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
            explain={explain(runNotes.coreShell)}
          />
          <TextField
            label="Pore size (Å)"
            value={details.poreSize}
            onChange={(value) => setDetail("poreSize", value)}
            inputMode="decimal"
            explain={explain(runNotes.pore)}
          />
          <TextField
            label="Carbon load (%)"
            value={details.carbonLoad}
            onChange={(value) => setDetail("carbonLoad", value)}
            inputMode="decimal"
            explain={explain(runNotes.carbon)}
          />
          <TextField
            label="Length (mm)"
            value={details.lengthMm}
            onChange={(value) => setDetail("lengthMm", value)}
            inputMode="decimal"
            explain={explain(runNotes.length)}
          />
          <TextField
            label="Diameter (mm)"
            value={details.diameterMm}
            onChange={(value) => setDetail("diameterMm", value)}
            inputMode="decimal"
            explain={explain(runNotes.diameter)}
          />
          <TextField
            label="Particle size (µm)"
            value={details.particleSize}
            onChange={(value) => setDetail("particleSize", value)}
            inputMode="decimal"
            explain={explain(runNotes.particle)}
          />
          <TextField
            label="Temperature (°C)"
            value={details.temperature}
            onChange={(value) => setDetail("temperature", value)}
            inputMode="decimal"
            explain={explain(runNotes.temperature)}
          />
          <TextField
            label="Wavelength (nm)"
            value={details.wavelength}
            onChange={(value) => setDetail("wavelength", value)}
            inputMode="decimal"
            explain={explain(runNotes.wavelength)}
          />
          <div
            id="run-field-note"
            className="rounded-lg bg-card px-3 py-3 text-sm leading-relaxed text-foreground ring-1 ring-foreground/10 @min-[28rem]:col-span-2"
          >
            {fieldNote ? (
              <FunctionNoteView title={fieldNote.title} note={fieldNote.note} />
            ) : (
              <p className="text-muted-foreground">
                Focus or hover a setting to read what it does, the part that sets it, the range and units,
                and what it changes.
              </p>
            )}
          </div>
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
  explain,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  placeholder: string;
  placeholderInList?: boolean;
  explain?: {
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    onFocus: () => void;
    onBlur: () => void;
  };
}) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <div className="flex min-w-0 flex-col gap-1.5" {...explain}>
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
  explain,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  inputMode?: "decimal" | "numeric" | "text";
  invalid?: boolean;
  explain?: {
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    onFocus: () => void;
    onBlur: () => void;
  };
}) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <div className="flex min-w-0 flex-col gap-1.5" {...explain}>
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
