import { describe, expect, it } from "vitest";
import { PRIVACY_SK } from "@/content/legal/sukromie";
import { TERMS_SK } from "@/content/legal/podmienky";
import { fillFacts } from "@/lib/legalText";

describe("terms and privacy texts", () => {
  it("fill every {{fact}} (COUNT_ME is the opt-out button)", () => {
    for (const text of [TERMS_SK, PRIVACY_SK]) {
      expect(fillFacts(text).replace("{{COUNT_ME}}", "").match(/\{\{\w+\}\}/g)).toBeNull();
    }
  });

  it("keep no draft markers", () => {
    for (const text of [TERMS_SK, PRIVACY_SK]) expect(text).not.toMatch(/DOPLNIŤ|NÁVRH|Overiť/);
  });
});
