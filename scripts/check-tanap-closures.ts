// Compares our TANAP closures with TANAP's official chart and writes a report for the GitHub
// issue (.github/workflows/tanap-check.yml). Run: npx vite-node --config vitest.config.ts scripts/check-tanap-closures.ts <report-file> [status-file]
// Read-only: it never changes data and never fails the job over a difference or a missing source.
//   report-file: non-empty only when the official list DIFFERS from ours (the workflow opens/updates an issue).
//   status-file: "ok" (compared) or "unavailable" (source unreachable or changed shape; nothing compared).
// The issue-opening lives in the workflow, so running this locally is already a dry run.
import { readFileSync, writeFileSync } from "node:fs";
import { compareClosures } from "../lib/tanapCompare";
import type { OurRule } from "../lib/tanapCompare";
import { fetchOfficialClosures, TANAP_CHART_URL } from "../lib/tanapSource";

const out = process.argv[2] ?? "tanap-report.md";
const statusOut = process.argv[3] ?? `${out}.status`;
const rules = (JSON.parse(readFileSync("data/closure-rules.json", "utf8")) as { rules: OurRule[] }).rules;
const official = await fetchOfficialClosures(new Date().getFullYear());
if (!official.ok) {
  console.log(`SOURCE UNAVAILABLE: ${official.reason} (${TANAP_CHART_URL}). Nothing compared; no issue about differences.`);
  writeFileSync(out, "");
  writeFileSync(statusOut, "unavailable");
} else {
  const diffs = compareClosures(rules, official.closures);
  console.log(`Official closures (${official.closures.length}):\n${official.closures.map((c) => `  ${c.ref}: closed ${c.starts_on} to ${c.ends_on}`).join("\n")}`);
  console.log(diffs.length ? `DIFFERENCES (${diffs.length}):\n${diffs.map((d) => `  - ${d}`).join("\n")}` : "OK: our TANAP closures match the official chart.");
  writeFileSync(out, diffs.length ? `Weekly check found differences between data/closure-rules.json and TANAP's official chart (${TANAP_CHART_URL}). Closure data is safety data: please check each against the source (and the vyhláška) and fix the rule (needs source_url and verified_on). Nothing was changed automatically.\n\n${diffs.map((d) => `- ${d}`).join("\n")}\n` : "");
  writeFileSync(statusOut, "ok");
}
