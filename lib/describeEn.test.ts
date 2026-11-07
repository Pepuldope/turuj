import { describe, expect, it } from "vitest";
import { describeEn } from "./describeEn";

describe("describeEn", () => {
  it("translates the generated description, names stay", () => {
    expect(describeEn("Výstup na vrchol Baba (536 m). Štart: Podbabská dolina, chaty, späť rovnakou cestou. Po modrej a červenej značke.")).toBe(
      "A hike up Baba (536 m). Starts at Podbabská dolina, chaty, out and back the same way. Follows the blue and red trail markings.",
    );
    expect(describeEn("Výlet k vodopádu: Barikádový vodopád. Štart: Podlesok, ATC, okruh. Po zelenej, modrej a červenej značke.")).toBe(
      "A walk to Barikádový vodopád, a waterfall. Starts at Podlesok, ATC, as a loop. Follows the green, blue and red trail markings.",
    );
    // the loop flag is no part of the start's name (2026-11-07)
    expect(describeEn("Výlet k vodopádu: Barikádový vodopád. Štart: Podlesok, ATC (okruh). Po zelenej značke.")).toBe(
      "A walk to Barikádový vodopád, a waterfall. Starts at Podlesok, ATC, as a loop. Follows the green trail marking.",
    );
    expect(describeEn("Výlet k vyhliadke Biela skala. Štart: Nad parkom, späť rovnakou cestou.")).toBe(
      "A walk to Biela skala, a viewpoint. Starts at Nad parkom, out and back the same way.",
    );
  });
  it("leaves hand-written text alone", () => {
    expect(describeEn("Krásny výlet s deťmi.")).toBeNull();
  });
});
