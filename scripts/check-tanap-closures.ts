// Compares our TANAP closures with TANAP's official list and writes a report for the GitHub
// issue (.github/workflows/tanap-check.yml). Run: npx vite-node --config vitest.config.ts scripts/check-tanap-closures.ts <report-file>
// Exit 0 always except on a real error: "no official source yet" and "differences found" are
// both reported through the report file (empty = nothing to open an issue about).
import { readFileSync, writeFileSync } from "node:fs";
import { compareClosures } from "../lib/tanapCompare";
import type { OfficialClosure, OurRule } from "../lib/tanapCompare";

/**
 * TODO (C134c): fetch TANAP's official closures and return them as OfficialClosure[].
 * No machine-readable source was found on 2026-11-14: tanap.sk answers automated requests with
 * 403, and the binding list is a PDF (príloha č. 3 of vyhláška OÚ Prešov č. 26/2023, the
 * source_url of the rules). Options: ask TANAP for a feed, parse that PDF, or read the closures
 * map's data once its address is known. Until then this returns null and the job only says so.
 */
async function fetchOfficial(): Promise<OfficialClosure[] | null> {
  return null;
}

const out = process.argv[2] ?? "tanap-report.md";
const rules = (JSON.parse(readFileSync("data/closure-rules.json", "utf8")) as { rules: OurRule[] }).rules;
const official = await fetchOfficial();
if (!official) {
  console.log("No official TANAP source is wired up yet (TODO in scripts/check-tanap-closures.ts); nothing compared.");
  writeFileSync(out, "");
} else {
  const diffs = compareClosures(rules, official);
  console.log(diffs.length ? diffs.join("\n") : "Our TANAP closures match the official list.");
  writeFileSync(out, diffs.length ? `Weekly check found differences between data/closure-rules.json and TANAP's official list. Closure data is safety data: please check each against the source and fix the rule (needs source_url and verified_on).\n\n${diffs.map((d) => `- ${d}`).join("\n")}\n` : "");
}
