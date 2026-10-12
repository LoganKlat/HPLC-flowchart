/** Run from the repository root: npx vite-node --config vitest.config.ts scripts/generate-decision-example.ts */
import { readFileSync, writeFileSync } from "node:fs";
import { DECISION_EXAMPLE_FILES } from "../src/lib/decision-example";
import { readLabFile } from "../src/lib/lab-file";

const results = DECISION_EXAMPLE_FILES.map((fileName) => {
  const read = readLabFile(readFileSync(`public/decision-example/${fileName}`));
  if (read.blockingMessage) throw new Error(`${fileName}: ${read.blockingMessage}`);
  return { fileName, read };
});
writeFileSync("public/decision-example/results.json", JSON.stringify(results));
