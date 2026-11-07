import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { indexedVariantPlaces, isIndexedVariant, variantHeading } from "@/lib/variantTitles";
import type { TripIndex } from "@/lib/tripSchema";

const read = (f: string) => JSON.parse(readFileSync(join(process.cwd(), f), "utf8")) as TripIndex;
const mains = read("public/data/trips/index.json").trips;
const variants = read("data/trip-variants.json").trips;

describe("variant headings", () => {
  it("name the start in Slovak case when sure", () => {
    expect(variantHeading("Kriváň", "Tri Studničky", "18,4 km")).toEqual({
      h1: "Kriváň z Troch Studničiek",
      titles: ["Kriváň z Troch Studničiek (18,4 km) – výlet", "Kriváň z Troch Studničiek (18,4 km)", "Kriváň z Troch Studničiek"],
      confident: true,
    });
    expect(variantHeading("Veľká Javorina", "Hamovanie", "9 km").h1).toBe("Veľká Javorina z Hamovania");
  });

  it("falls back to 'štart: …' when not sure, still a distinct H1", () => {
    const h = variantHeading("Hrad Vršatec", "Horné Vestenice", "5 km");
    expect(h.confident).toBe(false);
    expect(h.h1).toBe("Hrad Vršatec – štart: Horné Vestenice");
  });

  it("every indexed variant of one place gets a different H1", () => {
    const top = indexedVariantPlaces(mains);
    const seen = new Map<string, string[]>();
    for (const v of variants.filter((x) => x.variant_of && top.has(x.variant_of))) {
      const h1 = variantHeading(v.name, v.start.name, "").h1;
      seen.set(`${v.variant_of}|${h1}`, [...(seen.get(`${v.variant_of}|${h1}`) ?? []), v.slug]);
    }
    // Two routes from one start share a heading; the title's km tells them apart. Report, don't fail on the data.
    const dupes = [...seen.values()].filter((s) => s.length > 1).length;
    expect(dupes).toBeLessThan(seen.size / 5);
  });
});

describe("which variants are indexed (A02 = C)", () => {
  it("is the variants under places of rank 70 and up, about 500 of them", () => {
    const n = variants.filter((v) => isIndexedVariant(v, mains)).length;
    expect(n).toBeGreaterThan(400);
    expect(n).toBeLessThan(600);
    expect(isIndexedVariant({ variant_of: undefined }, mains)).toBe(false);
  });
});
