import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EN } from "@/lib/en";
import { DIFFICULTY_LABEL, GOAL_LABEL, GOAL_PLURAL, POI_LABEL, TRANSIT_LABEL, VERDICT_SHORT } from "@/lib/format";
import { FOOD_LABEL } from "@/lib/food";
import { GOAL_WORDS } from "@/lib/tripProfile";
import { BAD_SKY_LABEL } from "@/lib/weatherIcons";

const ROOT = join(__dirname, "..");
const STR = String.raw`"((?:[^"\\]|\\.)*)"`;
/** Strings that look like keys to the scan but aren't shown: goal ids, comments. */
const NOT_SHOWN = new Set(["", "ine", "Slovak sentence"]);

function sources(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && /\.tsx?$/.test(e.name) && !e.name.includes(".test.") && e.name !== "en.ts")
    .map((e) => join(e.parentPath, e.name));
}

/** Every literal passed to t(), tx(), tr(lang, …) or <T>, including both sides of a ternary. */
function shownStrings(): Set<string> {
  const keys = new Set<string>();
  const add = (raw: string) => keys.add(JSON.parse(`"${raw}"`));
  for (const file of ["app", "components", "lib"].flatMap(sources)) {
    const s = readFileSync(file, "utf8");
    for (const m of s.matchAll(new RegExp(String.raw`\b(?:t|tx)\(\s*${STR}`, "g"))) add(m[1]);
    for (const m of s.matchAll(new RegExp(String.raw`\btr\(\s*[\w.()]+,\s*${STR}`, "g"))) add(m[1]);
    for (const m of s.matchAll(/\b(?:t|tx)\(([^()]*?\?[^()]*?)\)/g)) for (const q of m[1].matchAll(new RegExp(STR, "g"))) add(q[1]);
    for (const m of s.matchAll(/<T>([^<{]+)<\/T>/g)) keys.add(m[1].trim());
  }
  return keys;
}

const missing = (list: Iterable<string>) => [...list].filter((k) => !NOT_SHOWN.has(k) && !(k in EN));

describe("English dictionary", () => {
  it("has every string the code shows", () => {
    expect(missing(shownStrings())).toEqual([]);
  });

  it("has every label the code looks up", () => {
    const maps = [DIFFICULTY_LABEL, GOAL_LABEL, GOAL_PLURAL, POI_LABEL, TRANSIT_LABEL, VERDICT_SHORT, FOOD_LABEL, BAD_SKY_LABEL];
    const goals = Object.values(GOAL_WORDS).flatMap((g) => [g.noun, g.at]);
    expect(missing([...maps.flatMap((m) => Object.values(m) as string[]), ...goals])).toEqual([]);
  });

  it("has every closure reason and fee text from the rules", () => {
    const texts = (file: string, key: string) =>
      [...readFileSync(join(ROOT, "data", file), "utf8").matchAll(new RegExp(`"${key}":\\s*${STR}`, "g"))].map((m) => JSON.parse(`"${m[1]}"`) as string);
    expect(missing([...texts("closure-rules.json", "reason"), ...texts("fee-rules.json", "text")])).toEqual([]);
    const rules = JSON.parse(readFileSync(join(ROOT, "data", "closure-rules.json"), "utf8")).rules as { trip_notes?: Record<string, string> }[];
    expect(missing(rules.flatMap((r) => Object.values(r.trip_notes ?? {})))).toEqual([]);
  });

  it("keeps the same placeholders", () => {
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    const wrong = Object.entries(EN).filter(([sk, en]) => vars(sk).join() !== vars(en).join());
    expect(wrong).toEqual([]);
  });
});
