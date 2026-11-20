// Counts the static files of the deploy against Cloudflare Workers Free's limit of 20,000 per deploy
// (C198: the deploy of 2026-11-20 had 18,478). Run after the build and the prune step. Prints the count,
// adds it to the run summary, warns from 19,000 and fails from 19,900 naming the biggest folders.

import { appendFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const LIMIT = 20_000;
export const WARN_AT = 19_000;
export const FAIL_AT = 19_900;

/** Files under `dir` (recursive, not following links), and how many each folder holds (first two levels). */
export function countFiles(dir) {
  const folders = new Map();
  let total = 0;
  const walk = (path, rel) => {
    for (const e of readdirSync(path, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(path, e.name), [...rel, e.name]);
      else {
        total++;
        const key = rel.slice(0, 2).join("/") || ".";
        folders.set(key, (folders.get(key) ?? 0) + 1);
      }
    }
  };
  walk(dir, []);
  return { total, folders };
}

/** The verdict for a count: level "ok" | "warn" | "fail", the line to print and the biggest folders. */
export function judge(total, folders) {
  const biggest = [...folders].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([f, n]) => `${f} (${n})`);
  const line = `Static files: ${total.toLocaleString("en-US")} of ${LIMIT.toLocaleString("en-US")}`;
  if (total >= FAIL_AT) return { level: "fail", line, message: `${line}: too close to the limit. Biggest folders: ${biggest.join(", ")}.` };
  if (total >= WARN_AT) return { level: "warn", line, message: `${line}: getting close. Biggest folders: ${biggest.join(", ")}.` };
  return { level: "ok", line, message: line };
}

function main(argv) {
  const dir = argv[0] ?? ".open-next/assets";
  const { total, folders } = countFiles(dir);
  const verdict = judge(total, folders);
  console.log(verdict.line);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${verdict.line}\n`);
  if (verdict.level === "warn") console.log(`::warning::${verdict.message}`);
  if (verdict.level === "fail") console.error(`::error::${verdict.message}`);
  return verdict.level === "fail" ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main(process.argv.slice(2)));
