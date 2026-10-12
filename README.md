# HPLC run check

This app reads a LabSolutions export and shows whether a composite sample meets the rules you type in.

Runs sit across the top as Run 1, Run 2, and so on. A run appears when you reach it. While retention is still the step, the page says what %B to run next. Each run keeps its own %B. The column details and the four rules stay shared. Later kinds of change are not built yet.

Four real exports are included for the retention check: 70%, 60%, 50%, and 40% B.

Work for Logan Klat.

## Run it on your computer

1. Install Node.js if you do not already have it.
2. In this folder, run `npm install`.
3. Run `npm run dev`.
4. Open [http://localhost:41731](http://localhost:41731).

## Check the file reader and the retention step

```bash
npm test
```

## Decision engine example

The decision engine automatically loads the 18 original LabSolutions exports in
`public/decision-example/`, ordered by retention, temperature, solvent, and ligand
changes. The example starts with editable specifications of 7 peaks, Rs ≥ 1.5,
15 minutes, and 4000 psi. These are demonstration settings, not file metadata.

**Remove all files / Start fresh** cancels loading and clears runs, results, and
workflow choices while preserving Run 1 specifications and conditions. Reloading
the page starts the example again.

`results.json` is generated with the same parser used for uploads so startup does
not block the browser while parsing Excel. After changing the originals or parser,
regenerate it with:

```sh
npx vite-node --config vitest.config.ts scripts/generate-decision-example.ts
```

`src/lib/decision-example.test.ts` checks all originals against the cached results.
