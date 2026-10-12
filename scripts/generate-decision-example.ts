/** Run: npx vite-node --config vitest.config.ts scripts/generate-decision-example.ts */
import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { DECISION_EXAMPLE_FILES } from "../src/lib/decision-example";
import { readLabFile } from "../src/lib/lab-file";

const full = DECISION_EXAMPLE_FILES.map((fileName) => {
  const read = readLabFile(readFileSync(`public/decision-example/${fileName}`));
  if (read.blockingMessage) throw new Error(`${fileName}: ${read.blockingMessage}`);
  return { fileName, read };
});
// Full PDA data loads only in Run data; keep decision-engine startup small.
writeFileSync("public/decision-example/full-data.json.gz", gzipSync(JSON.stringify(full), { level: 9 }));
writeFileSync("public/decision-example/results.json", JSON.stringify(full.map(({fileName, read}) => {
  const { exportSections: _sections, ...summary } = read;
  void _sections;
  return { fileName, read: summary };
})));
