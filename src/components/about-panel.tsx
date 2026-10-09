"use client";

import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";

export function AboutPanel({ onOpenNav }: { onOpenNav: () => void }) {
  return (
    <div id="about-page" className="flex flex-col gap-8">
      <div className="md:hidden">
        <Button type="button" variant="outline" className="h-10 px-3" onClick={onOpenNav}>
          Sections
        </Button>
      </div>
      <article className="flex max-w-[40rem] flex-col gap-8 text-base leading-7 text-foreground">
        <header className="flex flex-col gap-4">
          <p className="text-sm font-medium tracking-[0.14em] text-[#0f6b56] uppercase">User guide</p>
          <h1 className="font-heading text-4xl leading-tight text-[#144237] sm:text-5xl">HPLC method development</h1>
          <p>
            Upload HPLC results exported from Shimadzu LabSolutions. The page displays the chromatogram, checks the
            method against your specifications, and recommends the next run. The workflow has four stages: retention,
            selectivity, efficiency, and gradient. Only retention and selectivity are currently implemented;
            recommendations apply to isocratic (ISO) runs, not gradient (GRA) runs.
          </p>
        </header>

        <GuideSection id="about-setup" number="1" title="Set up Run 1">
          <p>
            Enter the required peak count, minimum resolution, maximum last-peak time, and maximum back-pressure
            (psi). Then enter the run conditions: solvent, %B, flow rate, injection volume, sample and concentration,
            column ligand and dimensions, particle size, temperature, wavelength, method, and core-shell status.
          </p>
          <p>You can automatically fill most conditions from a correctly formatted filename. Example:</p>
          <p className="rounded-xl bg-[#e7f3ee] px-4 py-3 font-mono text-sm leading-relaxed break-all text-[#144237]">
            GR09-05-3-ACN-3-ISO-90-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254
          </p>
          <p>
            Here, “amb” means room temperature. Group, injection, and HPLC numbers are ignored when importing
            conditions.
          </p>
          <p>
            Upload a CSV, TXT, or Excel export. The page locates tables by their headings (including “Peak Table” for
            PDA exports) rather than fixed cell positions.
          </p>
        </GuideSection>

        <GuideSection id="about-results" number="2" title="How results are assessed">
          <p>The chromatogram plots detector signal against time and labels peaks by retention time. The page extracts:</p>
          <ul className="flex flex-col gap-3 border-l-2 border-[#0f6b56]/35 pl-4">
            <li>Peak count from the peak table.</li>
            <li>Last-peak time from the latest eluting peak.</li>
            <li>Dead time (t0) from the first, unretained-marker peak; retention factor k = (tR - t0) / t0.</li>
            <li>
              Worst resolution from the lowest reported resolution after the marker. If peaks are missing, resolution
              is treated as zero.
            </li>
            <li>Maximum back-pressure from the pump-pressure trace.</li>
          </ul>
          <p>
            A run passes only when peak count equals the target, worst resolution meets or exceeds its minimum,
            last-peak time is within its limit, and pressure is below its maximum. Extra peaks require investigation
            rather than an automatic pass.
          </p>
        </GuideSection>

        <GuideSection id="about-retention" number="3" title="Retention — adjust %B">
          <p>
            Begin around 90–100% B. Higher %B generally shortens retention; lower %B increases retention and may
            separate overlapping peaks.
          </p>
          <p>
            If too few peaks are detected and the last peak elutes within half the allowed runtime, reduce %B by 10
            percentage points. Once the last peak exceeds half the time limit, the page estimates a minimum %B
            targeting the full allowed runtime using a linear relationship derived from previous runs.
          </p>
          <p>
            Before fitting, a 90% confidence Q-test checks the t0 values and may exclude outlier runs, retaining at
            least two. A poorly separated initial run may also be omitted when more than three chromatograms are
            available. Any exclusions are reported.
          </p>
          <p>
            After the minimum-%B run, compare all runs by %B, peak count, worst resolution, last-peak time, and
            pass/fail results. You may test an intermediate %B or select a previous run for temperature optimisation,
            even if its last peak exceeds the time limit.
          </p>
          <p>
            If more peaks appear than expected, stop and investigate possible impurities, carryover, or split peaks.
            The page displays each peak’s retention time, area, and height for comparison, including against a 0.1
            mg/mL reference injection.
          </p>
          <p>
            If the expected peak count is reached and resolution is above zero, choose either to proceed to efficiency
            (not yet available) or to continue selectivity. A long runtime does not prevent this choice. When all four
            specifications pass, the page reports success.
          </p>
        </GuideSection>

        <GuideSection id="about-selectivity" number="4" title="Selectivity — temperature, solvent, ligand">
          <p>
            Selectivity changes peak spacing and elution order. Test the selected run at 40°C without changing %B, then
            compare it with the original. An improvement means more detected peaks, or—once all expected peaks are
            present—a higher worst resolution. If it improves, test 60°C at the same %B. Do not adjust %B to compensate
            for runtime after heating.
          </p>
          <p>
            If 40°C does not improve the result, the recommended action is to change solvent, although you may still
            try 60°C.
          </p>
          <p>
            Choose ACN, MeOH, THF, Ethanol, IPA, Acetone, Propanol, or Butanol. The page uses a solvent-conversion
            chart to suggest an equivalent %B that maintains approximately similar retention. On the new solvent,
            repeat the 40°C test and, if useful, the
            60°C test. If the new-solvent 40°C test fails to improve separation, change the ligand (recommended) or try
            60°C anyway.
          </p>
          <p>
            Choose a new ligand from C18, C18aq, PFPP, C8, biphenyl, or IBD. Restart retention at roughly 100% B and
            room temperature, using the original Run 1 solvent; then repeat selectivity as needed.
          </p>
        </GuideSection>

        <GuideSection id="about-other" number="5" title="Other features and run management">
          <p>Efficiency aims to narrow peaks; gradient methods vary %B during a run. Neither stage is implemented yet.</p>
          <p>
            The Equipment tab illustrates the class HPLC configurations (systems 1/2/5, 3, and 6) with descriptions of
            their components. The controller is not used.
          </p>
          <p>
            For each injection, upload the export, review the results and next-run recommendation, then select NEXT
            RUN. Removing an uploaded file clears that run and all subsequent runs, but preserves Run 1 specifications
            and conditions.
          </p>
        </GuideSection>
      </article>
    </div>
  );
}

function GuideSection({
  id,
  number,
  title,
  children,
}: {
  id: string;
  number: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="rounded-2xl bg-card px-5 py-6 ring-1 ring-foreground/10 sm:px-7 sm:py-7">
      <h2 className="font-heading text-[1.65rem] leading-snug text-[#144237]">
        <span className="mb-1.5 block text-xs font-medium tracking-[0.16em] text-[#0f6b56] uppercase">{number}</span>
        {title}
      </h2>
      <div className="mt-5 flex flex-col gap-4">{children}</div>
    </section>
  );
}
