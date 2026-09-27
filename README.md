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
