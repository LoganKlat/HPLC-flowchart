"use client";

import type { ReactNode } from "react";
import { ChoiceSelect } from "@/components/choice-select";
import { FunctionNoteView, type FunctionNote } from "@/components/function-note";
import { NotePop } from "@/components/note-pop";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { applySizeChoice, sizeChoices, type ColumnSpec, type SizeField, type SizePick } from "@/lib/column-catalog";
import { parseUserCount, parseUserNumber } from "@/lib/evaluate";
import { FILE_NAME_CHECKBOX_LABEL, FILE_NAME_STRUCTURE_NOTE } from "@/lib/filename-details";
import type { RuleInputs, RunDetails } from "@/lib/run-details";

type FileNameFill = {
  checked: boolean;
  onToggle: (checked: boolean) => void;
};

type RunFormProps = {
  title: string;
  details: RunDetails;
  rules: RuleInputs;
  columns: readonly ColumnSpec[];
  solvents: readonly string[];
  onDetails: (details: RunDetails) => void;
  onRules: (rules: RuleInputs) => void;
  /** Run 1 only. Later runs omit it. */
  fileNameFill?: FileNameFill | null;
  /** Shown on every run when the latest file name does not match. */
  fileNote?: string | null;
};

type Explained = { title: string; note: FunctionNote };

/** The notes that used to open from these fields. Click the question mark to read them. */
const runNotes = {
  solvent: {
    title: "Solvent",
    note: {
      does: "The organic solvent in the mix that carries the sample.",
      sets: "The solvent bottles, blended by the pump. This menu records which organic solvent Run 1 uses. Settings chooses the list.",
      range: "The Settings list. A name, not a number. The chart covers ACN, MeOH, THF, Ethanol, IPA, Acetone, Propanol, and Butanol.",
      changes:
        "A solvent change is a selectivity change: peaks can pull apart or change order. The chart %B keeps the retention time similar when the solvent changes. It does not change efficiency by itself.",
    },
  },
  ph: {
    title: "pH",
    note: {
      does: "The pH of the water-based solvent. One bottle is usually water, sometimes with a set pH.",
      sets: "The aqueous solvent. This box records the pH for Run 1.",
      range: "A number, such as 3. No unit. The page does not enforce a maximum. The box accepts what is typed.",
      changes:
        "This page saves the pH with Run 1. The next-run steps do not read it, so this box does not change retention, selectivity, or efficiency here.",
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
  sampleType: {
    title: "Sample type",
    note: {
      does: "Which sample was injected. The menu is CP or BLANK.",
      sets: "The injection. This menu records the sample type for Run 1.",
      range: "CP or BLANK only. A name, not a number. No units.",
      changes:
        "This page saves the sample type with Run 1. The next-run steps do not read it, so this choice does not change retention, selectivity, or efficiency here.",
    },
  },
  concentration: {
    title: "Sample concentration",
    note: {
      does: "How much sample is dissolved in the liquid that is injected.",
      sets: "The sample preparation. This box records it for Run 1.",
      range: "mg/mL. The page does not enforce a maximum. The box accepts what is typed.",
      changes:
        "This page saves the concentration with Run 1. The next-run steps do not read it, so this number does not change retention, selectivity, or efficiency here.",
    },
  },
  ligand: {
    title: "Ligand",
    note: {
      does: "The ligand is the coating bonded on the silica. It is the group the compounds stick to.",
      sets: "The column coating. This menu records it for Run 1. Settings and the Beads tab use the same list.",
      range: "The Settings list. A name, not a number. No units.",
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

function DetailNote({ explained }: { explained: Explained }) {
  return (
    <NotePop label={explained.title}>
      <FunctionNoteView title={explained.title} note={explained.note} />
    </NotePop>
  );
}

const cardTitleClass = "font-heading text-xl! leading-tight font-bold!";

export function RunForm({ title, details, rules, columns, solvents, onDetails, onRules, fileNameFill, fileNote }: RunFormProps) {
  function setDetail<K extends keyof RunDetails>(key: K, value: RunDetails[K]) {
    onDetails({ ...details, [key]: value });
  }

  function setSize(field: SizeField, value: string) {
    const next = applySizeChoice(columns, sizePick(details), field, value);
    onDetails({
      ...details,
      ligand: next.coating,
      lengthMm: next.lengthMm,
      diameterMm: next.diameterMm,
      particleSize: next.particleUm,
      poreSize: next.poreA,
    });
  }

  const pick = sizePick(details);
  const coatingOptions = sizeChoices(columns, pick, "coating").map((value) => ({ value, label: value }));
  const lengthOptions = sizeChoices(columns, pick, "lengthMm").map((value) => ({ value, label: `${value} mm` }));
  const diameterOptions = sizeChoices(columns, pick, "diameterMm").map((value) => ({ value, label: `${value} mm` }));
  const particleOptions = sizeChoices(columns, pick, "particleUm").map((value) => ({ value, label: `${value} µm` }));
  const poreOptions = sizeChoices(columns, pick, "poreA").map((value) => ({ value, label: `${value} Å` }));

  function setRule<K extends keyof RuleInputs>(key: K, value: string) {
    onRules({ ...rules, [key]: value });
  }

  return (
    <div id="setup-boxes" className="flex min-h-full flex-col gap-2">
      <Card size="sm" className="shrink-0" style={{ ["--card-spacing" as string]: "0.5rem" }}>
        <CardHeader className="pb-2">
          <CardTitle className={cardTitleClass}>Rules to meet</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1.5">
          <TextField
            label="Number of peaks"
            value={rules.requiredPeaks}
            onChange={(value) => setRule("requiredPeaks", value)}
            inputMode="numeric"
            note="Met when the file has at least this many peaks."
            hint={
              rules.requiredPeaks.trim() && parseUserCount(rules.requiredPeaks) == null
                ? "Use a whole number."
                : undefined
            }
            invalid={rules.requiredPeaks.trim() !== "" && parseUserCount(rules.requiredPeaks) == null}
          />
          <TextField
            label="Last peak time"
            unit="minutes"
            value={rules.lastPeakTimeMin}
            onChange={(value) => setRule("lastPeakTimeMin", value)}
            inputMode="decimal"
            note="Met when the last peak comes out at or before this many minutes. Later than that is not met."
            hint={
              rules.lastPeakTimeMin.trim() && parseUserNumber(rules.lastPeakTimeMin) == null
                ? "Use a number."
                : undefined
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
            note="Met when the smallest resolution, leaving out the t0 peak, is at least this number. If the file has fewer peaks than the specification, this shows NA and is not met."
            hint={
              rules.minResolution.trim() && parseUserNumber(rules.minResolution) == null
                ? "Use a number."
                : undefined
            }
            invalid={rules.minResolution.trim() !== "" && parseUserNumber(rules.minResolution) == null}
          />
          <TextField
            label="Max back-pressure"
            unit="psi"
            value={rules.maxBackPressurePsi}
            onChange={(value) => setRule("maxBackPressurePsi", value)}
            inputMode="decimal"
            note="Met when the highest pressure is at or below this number."
            hint={
              rules.maxBackPressurePsi.trim() && parseUserNumber(rules.maxBackPressurePsi) == null
                ? "Use a number."
                : undefined
            }
            invalid={
              rules.maxBackPressurePsi.trim() !== "" &&
              parseUserNumber(rules.maxBackPressurePsi) == null
            }
          />
        </CardContent>
      </Card>

      <Card size="sm" className="min-h-min flex-1" style={{ ["--card-spacing" as string]: "0.5rem" }}>
        <CardHeader className="pb-2">
          <CardTitle id="run-details-title" className={cardTitleClass}>
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-y-1.5">
          {fileNameFill ? (
            <div id="filename-fill" className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2 gap-y-1 pb-1">
              <input
                id="fill-from-filename"
                type="checkbox"
                className="col-start-1 row-start-1 mt-0.5 size-4 accent-[#0f6b56]"
                checked={fileNameFill.checked}
                onChange={(event) => fileNameFill.onToggle(event.target.checked)}
              />
              <label
                htmlFor="fill-from-filename"
                className="col-start-2 row-start-1 min-w-0 text-sm leading-snug text-foreground"
              >
                {FILE_NAME_CHECKBOX_LABEL}
              </label>
              <div className="col-start-3 row-start-1">
                <NotePop text={FILE_NAME_STRUCTURE_NOTE} label="Autofill from file name" />
              </div>
            </div>
          ) : null}
          {fileNote ? (
            <p id="filename-note" className="text-sm text-red-700" role="status">
              {fileNote}
            </p>
          ) : null}
          <ChoiceField
            label="Solvent"
            note={<DetailNote explained={runNotes.solvent} />}
            value={details.solvent}
            placeholder="Choose a solvent"
            options={solvents.map((solvent) => ({ value: solvent, label: solvent }))}
            onChange={(value) => setDetail("solvent", value)}
          />
          <TextField
            label="pH"
            note={<DetailNote explained={runNotes.ph} />}
            value={details.ph}
            onChange={(value) => setDetail("ph", value)}
            inputMode="decimal"
          />
          <ChoiceField
            label="Method"
            note={<DetailNote explained={runNotes.method} />}
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
            unit="%"
            note={<DetailNote explained={runNotes.percentB} />}
            value={details.percentB}
            onChange={(value) => setDetail("percentB", value)}
            inputMode="decimal"
          />
          <TextField
            label="Flow rate"
            unit="mL/min"
            note={<DetailNote explained={runNotes.flow} />}
            value={details.flowRate}
            onChange={(value) => setDetail("flowRate", value)}
            inputMode="decimal"
          />
          <TextField
            label="Injection volume"
            unit="µL"
            note={<DetailNote explained={runNotes.injection} />}
            value={details.injectionVolume}
            onChange={(value) => setDetail("injectionVolume", value)}
          />
          <ChoiceField
            label="Sample type"
            note={<DetailNote explained={runNotes.sampleType} />}
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
            label="Sample concentration"
            unit="mg/mL"
            note={<DetailNote explained={runNotes.concentration} />}
            value={details.sampleConcentration}
            onChange={(value) => setDetail("sampleConcentration", value)}
          />
          <ChoiceField
            label="Coating"
            note={<DetailNote explained={runNotes.ligand} />}
            value={details.ligand}
            placeholder="select a coating"
            options={coatingOptions}
            onChange={(value) => setSize("coating", value)}
          />
          <ChoiceField
            label="Core shell"
            note={<DetailNote explained={runNotes.coreShell} />}
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
          <ChoiceField
            label="Pore size"
            note={<DetailNote explained={runNotes.pore} />}
            value={details.poreSize}
            placeholder="select a pore size"
            options={poreOptions}
            onChange={(value) => setSize("poreA", value)}
          />
          <TextField
            label="Carbon load"
            unit="%"
            note={<DetailNote explained={runNotes.carbon} />}
            value={details.carbonLoad}
            onChange={(value) => setDetail("carbonLoad", value)}
            inputMode="decimal"
          />
          <ChoiceField
            label="Length"
            note={<DetailNote explained={runNotes.length} />}
            value={details.lengthMm}
            placeholder="select a length"
            options={lengthOptions}
            onChange={(value) => setSize("lengthMm", value)}
          />
          <ChoiceField
            label="Diameter"
            note={<DetailNote explained={runNotes.diameter} />}
            value={details.diameterMm}
            placeholder="select a diameter"
            options={diameterOptions}
            onChange={(value) => setSize("diameterMm", value)}
          />
          <ChoiceField
            label="Particle size"
            note={<DetailNote explained={runNotes.particle} />}
            value={details.particleSize}
            placeholder="select a particle size"
            options={particleOptions}
            onChange={(value) => setSize("particleUm", value)}
          />
          <TextField
            label="Temperature"
            unit="°C"
            note={<DetailNote explained={runNotes.temperature} />}
            value={details.temperature}
            onChange={(value) => setDetail("temperature", value)}
            inputMode="decimal"
          />
          <TextField
            label="Wavelength"
            unit="nm"
            note={<DetailNote explained={runNotes.wavelength} />}
            value={details.wavelength}
            onChange={(value) => setDetail("wavelength", value)}
            inputMode="decimal"
          />
        </CardContent>
      </Card>
    </div>
  );
}

function sizePick(details: RunDetails): SizePick {
  return {
    coating: details.ligand,
    lengthMm: details.lengthMm,
    diameterMm: details.diameterMm,
    particleUm: details.particleSize,
    poreA: details.poreSize,
  };
}

function ChoiceField({
  label,
  value,
  onChange,
  options,
  placeholder,
  placeholderInList,
  note,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  placeholder: string;
  placeholderInList?: boolean;
  note?: ReactNode;
}) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <FieldRow id={id} label={label} note={note} control={
      <ChoiceSelect
        className="h-8"
        id={id}
        value={value}
        onChange={onChange}
        options={options}
        placeholder={placeholder}
        placeholderInList={placeholderInList}
      />
    } />
  );
}

function TextField({
  label,
  value,
  onChange,
  hint,
  note,
  inputMode,
  invalid,
  unit,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  note?: ReactNode;
  inputMode?: "decimal" | "numeric" | "text";
  invalid?: boolean;
  unit?: string;
}) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const noteNode = typeof note === "string" ? <NotePop text={note} label={label} /> : note;
  return (
    <FieldRow
      id={id}
      label={label}
      note={noteNode}
      hint={hint}
      control={
        <UnitInput
          id={id}
          value={value}
          unit={unit}
          inputMode={inputMode}
          invalid={invalid}
          onChange={onChange}
        />
      }
    />
  );
}

function FieldRow({
  id,
  label,
  note,
  hint,
  control,
}: {
  id: string;
  label: string;
  note?: ReactNode;
  hint?: string;
  control: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="grid grid-cols-[minmax(0,1fr)_10.5rem] items-center gap-x-2">
        <div className="flex min-w-0 items-start gap-1.5">
          <Label htmlFor={id} className="h-auto whitespace-normal text-sm leading-snug">
            {label}
          </Label>
          {note}
        </div>
        {control}
      </div>
      {hint ? <p className="text-xs leading-snug text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function UnitInput({
  id,
  value,
  unit,
  inputMode,
  invalid,
  onChange,
}: {
  id: string;
  value: string;
  unit?: string;
  inputMode?: "decimal" | "numeric" | "text";
  invalid?: boolean;
  onChange: (value: string) => void;
}) {
  if (!unit) {
    return (
      <Input
        id={id}
        value={value}
        inputMode={inputMode}
        aria-invalid={invalid || undefined}
        className="h-8 text-sm"
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  return (
    <div
      className={
        "flex h-8 min-w-0 items-stretch overflow-hidden rounded-lg border bg-transparent " +
        (invalid
          ? "border-destructive ring-3 ring-destructive/20"
          : "border-input focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50")
      }
    >
      <Input
        id={id}
        value={value}
        inputMode={inputMode}
        aria-invalid={invalid || undefined}
        aria-describedby={`${id}-unit`}
        className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-2 text-sm shadow-none focus-visible:border-transparent focus-visible:ring-0 aria-invalid:border-transparent aria-invalid:ring-0"
        onChange={(event) => onChange(event.target.value)}
      />
      <span
        id={`${id}-unit`}
        className="flex w-[4.75rem] shrink-0 items-center justify-center border-l border-input px-1 text-center text-xs leading-none whitespace-nowrap text-muted-foreground"
      >
        {unit}
      </span>
    </div>
  );
}
