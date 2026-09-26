# HPLC run check

This app reads a LabSolutions export and shows whether a composite sample meets the specs you type in.

Four stages sit across the top: Retention, Selectivity, Efficiency, and Gradient. Retention is the one to use first. The boxes that will say what to change on the machine are placeholders. Efficiency and Gradient are on the page so the path is ready. They do not suggest setting changes yet.

Two real exports are included so the screen can be tried before another file is chosen: GR41-06 and GR41-07.

Work for Logan Klat.

## Run it on your computer

1. Install Node.js if you do not already have it.
2. In this folder, run `npm install`.
3. Run `npm run dev`.
4. Open [http://localhost:41731](http://localhost:41731).

## Check the file reader

```bash
npm test
```
