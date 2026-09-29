"use client";

import { Button } from "@/components/ui/button";

export function AboutPanel({ onOpenNav }: { onOpenNav: () => void }) {
  return (
    <div id="about-page" className="flex flex-col gap-6">
      <div className="md:hidden">
        <Button type="button" variant="outline" className="h-10 px-3" onClick={onOpenNav}>
          Sections
        </Button>
      </div>
      <article className="flex max-w-3xl flex-col gap-8 text-base leading-relaxed text-foreground">
        <header className="flex flex-col gap-3">
          <h1 className="font-heading text-3xl text-foreground sm:text-4xl">What this page does</h1>
          <p>
            This page guides HPLC method development for a composite sample. You run the instrument, export the file
            from LabSolutions, and upload it here. The page reads that file and tells you what to change on the next
            run.
          </p>
          <p>The work is split into four stages. Only the first two are built.</p>
        </header>

        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-2xl text-[#144237]">Retention</h2>
          <p>
            Retention is how long a compound stays on the column. The measurement is k. A higher k means the compound
            comes out later. The main knob is %B, the percent of the strong solvent in the mobile phase. A higher %B
            pushes compounds out faster. A lower %B holds them longer and spreads the peaks apart.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-2xl text-[#144237]">Selectivity</h2>
          <p>
            Selectivity is which compounds come out in which order, and whether two peaks that were on top of each
            other can be pulled apart. Temperature is changed first, then the strong solvent, then the column coating.
            The coating is the ligand.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-2xl text-[#144237]">Efficiency</h2>
          <p>
            Efficiency is how narrow the peaks are. Narrower peaks are easier to tell apart. That stage is not built
            yet. When the page offers efficiency, you can move on, or you can keep going through selectivity.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-2xl text-[#144237]">Gradient</h2>
          <p>A gradient changes %B during the run. That stage is not built yet.</p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-2xl text-[#144237]">What you enter on the first run</h2>
          <p>The specifications are the limits the method has to meet.</p>
          <ul className="flex flex-col gap-2">
            <li>
              <span className="font-medium">Peaks.</span> How many peaks the sample should show.
            </li>
            <li>
              <span className="font-medium">Resolution.</span> How far apart the worst pair of peaks must be. Bigger
              means more space between the peaks.
            </li>
            <li>
              <span className="font-medium">Time.</span> The last peak must come out by this many minutes.
            </li>
            <li>
              <span className="font-medium">Back-pressure.</span> The pump pressure must stay under this, in psi.
            </li>
          </ul>
          <p>
            The run details are the conditions of the injection: solvent, %B, flow rate, injection volume, sample type,
            concentration, ligand, column length, diameter, particle size, oven temperature, wavelength, method, and
            whether the column is a core shell.
          </p>
          <p>
            Method is ISO or GRA. ISO means the %B stays the same for the whole run. GRA means a gradient. The
            decisions on this page are for ISO runs.
          </p>
          <p>
            You can check the box on Run 1 and fill those details from the file name. The name has to follow the class
            pattern: group number, injection number, HPLC number, solvent, pH, method, %B, flow rate, injection volume,
            sample type, sample concentration, ligand, length x diameter x particle size, oven temperature, wavelength.
            The page skips the group, the injection number, and the HPLC number. amb means the oven was at room
            temperature. An example is{" "}
            <span className="break-all">
              GR09-05-3-ACN-3-ISO-90-1.5-20-CP-0.1-C18aqP-150x4.6x5-amb-254
            </span>
            . That means acetonitrile, an isocratic method, 90% B, 1.5 mL/min, 20 µL, sample CP at 0.1 mg/mL, a C18aq
            coating, a 150 mm by 4.6 mm column with 5 µm particles, room temperature, and 254 nm.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-2xl text-[#144237]">What the page reads from the file</h2>
          <p>It finds each section by its name, then reads the columns by their headers.</p>
          <p>The peak count is the “# of Peaks” line in the peak table.</p>
          <p>The last peak is the peak with the largest retention time, in minutes.</p>
          <p>
            t0 is the first peak. In this class that peak is the unretained marker, the compound that does not stick to
            the column. k is the retention time minus t0, divided by t0.
          </p>
          <p>
            The worst resolution is the smallest resolution in the table, ignoring that first peak. If the file has
            fewer peaks than the specification, the worst resolution is treated as 0. A missing peak is counted as two
            peaks sitting on top of each other.
          </p>
          <p>Back-pressure comes from the pump pressure trace.</p>
          <p>
            The graph is the chromatogram. The horizontal axis is time in minutes. The vertical axis is the detector
            signal. The labels on the peaks are retention times only.
          </p>
          <p>Files can be CSV, txt, or Excel. A name that starts with “Peak Table” is the peak table, including a PDA file.</p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-2xl text-[#144237]">Retention, one run at a time</h2>
          <p>
            Start near 90–100% B. A high %B makes the first runs short, and it gives the later calculation more room to
            work.
          </p>
          <p>
            While you still have fewer peaks than the specification, and the last peak is still at or under half the
            time you set, the next run is 10 percentage points lower in %B. Lower %B increases retention and pulls the
            peaks apart. The note says the last peak is still well under the specified time, and that %B is decreased
            by 10% to increase retention and peak separation.
          </p>
          <p>
            Once the last peak is past half that time, another 10-point drop is too big. Retention gets much longer as
            %B goes down, so the last peak would miss the time limit. The page calculates a minimum %B aimed at the
            full time you set, and that is the next run.
          </p>
          <p>
            That calculation uses a straight line through the runs. It does not use every run. A Q-test at 90%
            confidence looks at the t0 peak of each run. If one t0 sits too far from the others, that run is left out,
            and the test is run again. At least two runs stay in. The note names any run that was left out. If none
            were, it says the t0 peaks passed the Q-test. A first run that is poorly separated can also be left out
            when there are already more than three chromatograms.
          </p>
          <p>
            After you upload the minimum-%B file, the page shows Look at the runs. Every upload is in one table: %B,
            peak count, worst resolution, last-peak time, and whether each rule is met. You can type an in-between %B
            if you think a value between two runs you already did would sit the peaks better. If you say no, you pick
            which uploaded run to heat. A run whose last peak is late can still be picked. Not met on time means the
            last peak came out after the limit.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-2xl text-[#144237]">More peaks than the specification</h2>
          <p>
            Stop. Do not change %B, temperature, solvent, or the column. An extra peak can be a breakdown product, a
            peak that split in two, or sample left over from an earlier injection. The page lists every peak with its
            retention time, area, and height. Compare the extra peak with the peaks from a 0.1 mg/mL injection. If it
            is nowhere near that size, it is probably not one of the compounds. You decide.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-2xl text-[#144237]">When the peak count matches the specification</h2>
          <p>You get two choices.</p>
          <p>
            Move on to efficiency. The %B, temperature, solvent, and column stay as they are. Efficiency is the next
            stage. It is not built yet, so the page stops there.
          </p>
          <p>Continue selectivity. The page keeps going through temperature, then solvent, then ligand.</p>
          <p>
            A run that already has the right number of peaks, and a resolution above zero, is kept even when the last
            peak is late. Efficiency is what can bring that time back to the specification. You can still choose to
            continue selectivity instead.
          </p>
          <p>If the peaks, the resolution, the time, and the pressure are all met, the page says the specifications are met.</p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-2xl text-[#144237]">How met is decided</h2>
          <p>Peaks are met when the count equals the specification. More peaks than that is the investigate stop, not a pass.</p>
          <p>
            Resolution is met when the worst pair is at or above the specification. Under that, it is not met. If the
            file is missing peaks, resolution is 0.
          </p>
          <p>Time is met when the last peak comes out at or before the time you set. Later is not met.</p>
          <p>Pressure is met when the highest back-pressure is under the specification.</p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-2xl text-[#144237]">Selectivity</h2>
          <p>
            The run you picked is heated to 40°C. The %B stays the same. Heating can pull peaks apart, and it can also
            make the peaks come out earlier. %B is not dropped to chase the time limit after the oven change. The next
            temperature, if it is taken, is 60°C at that same %B.
          </p>
          <p>The 40°C run is compared with the run from before the oven change.</p>
          <p>
            It improved if the peak count went up. It also improved if you already had enough peaks and the worst
            resolution went up. If you are still short of peaks, a higher resolution number does not count as better,
            because missing peaks are treated as resolution 0.
          </p>
          <p>If it improved, the next run is 60°C at the same %B. More heat is likely to increase the separation further.</p>
          <p>
            If it did not improve, including a file with fewer peaks, you get two choices. The recommended one is to
            change solvent. The temperature increase did not help, so more heat is unlikely to increase the separation.
            The other choice is to go to 60°C anyway, at the same %B.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-2xl text-[#144237]">Changing solvent</h2>
          <p>
            You pick the new solvent. The page does not tell you which one. The choices are ACN (acetonitrile), MeOH
            (methanol), and THF (tetrahydrofuran).
          </p>
          <p>
            The page shows a matched %B from the solvent chart for those three only. The match keeps the retention time
            similar to the %B carried out of retention. Other solvents are not on that chart, so they do not get a
            matched percent.
          </p>
          <p>
            The temperature steps are then repeated on the new solvent: 40°C at that matched %B, then 60°C at the same
            %B if the heat helped.
          </p>
          <p>
            If the 40°C run on the new solvent does not improve, there are again two choices. The recommended one is to
            change the ligand. The other is to go to 60°C anyway, at the same %B.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-2xl text-[#144237]">Changing the ligand</h2>
          <p>
            You pick the new coating from the list. The page does not name one. The list is C18, C18aq, PFPP, C8,
            biphenyl, and IBD.
          </p>
          <p>
            The new column starts again near 100% B, at room temperature, with the solvent from Run 1. Retention starts
            over, and then selectivity, on that new coating.
          </p>
        </section>

        <section id="about-equipment" className="flex flex-col gap-3">
          <h2 className="font-heading text-2xl text-[#144237]">Equipment</h2>
          <p>
            The Equipment tab shows the three HPLC setups used in this class. HPLC 1, 2, and 5 are one layout. HPLC 3
            is another. HPLC 6 is another. Hover or tap a part, the bottles, the degasser, the pumps, the detector, the
            oven and column, or the injector, and the note says what that part does. The controller is not used in this
            class.
          </p>
        </section>

        <section id="about-each-run" className="flex flex-col gap-3">
          <h2 className="font-heading text-2xl text-[#144237]">Each run</h2>
          <p>
            Open Run 1, enter the specifications and the run details, and upload the file. The results replace the
            empty drop box. The decision is the next change, and why. Press NEXT RUN when you are ready. A new tab
            appears. Removing a file clears that run and every run after it. The Run 1 details and the specifications
            stay.
          </p>
        </section>
      </article>
    </div>
  );
}
