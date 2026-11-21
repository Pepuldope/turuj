import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EN } from "@/lib/en";
import { APP_SCREENS, screenPath, webApplicationLd } from "@/lib/appScreens";

const PUBLIC = join(process.cwd(), "public");

describe("app screenshots", () => {
  it("each language has all three files", () => {
    for (const lang of ["sk", "en"] as const) for (const s of APP_SCREENS) expect(existsSync(join(PUBLIC, screenPath(lang, s.id)))).toBe(true);
  });

  it("the structured data lists 3 absolute screenshots per language", () => {
    for (const lang of ["sk", "en"] as const) {
      const ld = webApplicationLd(lang, "/aplikacia");
      expect(ld["@id"]).toBe("https://turuj.sk/#app");
      expect(ld.screenshot).toHaveLength(3);
      for (const shot of ld.screenshot) expect(shot.url).toMatch(new RegExp(`^https://turuj\\.sk/screens/${lang}-\\w+\\.webp$`));
    }
  });

  it("English text exists for every caption and alt", () => {
    for (const s of APP_SCREENS) {
      expect(EN[s.caption]).toBeTruthy();
      expect(EN[s.alt]).toBeTruthy();
    }
    expect(EN["Ako Túruj vyzerá"]).toBeTruthy();
  });

  it("the manifest screenshots point at existing files", () => {
    const m = JSON.parse(readFileSync(join(PUBLIC, "manifest.json"), "utf8")) as { screenshots: { src: string }[] };
    expect(m.screenshots).toHaveLength(3);
    for (const s of m.screenshots) expect(existsSync(join(PUBLIC, s.src))).toBe(true);
  });
});
