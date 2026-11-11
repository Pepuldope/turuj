import { describe, expect, it } from "vitest";
import { EN } from "@/lib/en";
import { moreKey } from "@/lib/showMore";
import type { MoreKind } from "@/lib/showMore";

describe("moreKey", () => {
  it("picks the Slovak plural form", () => {
    expect(moreKey("places", 1)).toBe("Zobraziť ďalšie miesto");
    expect(moreKey("places", 2)).toBe("Zobraziť ďalšie {n} miesta");
    expect(moreKey("places", 4)).toBe("Zobraziť ďalšie {n} miesta");
    expect(moreKey("places", 5)).toBe("Zobraziť ďalšie {n} miest");
    expect(moreKey("routes", 3)).toBe("Zobraziť ďalšie {n} cesty");
    expect(moreKey("parking", 2)).toBe("Zobraziť ďalšie {n} parkoviská");
    expect(moreKey("stops", 6)).toBe("Zobraziť ďalšie {n} zastávok");
  });

  it("has an English text for every form", () => {
    const kinds: MoreKind[] = ["places", "routes", "parking", "stops"];
    for (const k of kinds) for (const n of [1, 2, 5]) expect(EN[moreKey(k, n)], `${k} ${n}`).toBeTruthy();
  });
});
