import { describe, expect, it } from "vitest";
import { tidyPlaces } from "@/lib/geocode";

const place = (label: string, lat: number, lon: number, country = "Slovensko") => ({ label, lat, lon, country });

describe("tidyPlaces", () => {
  it("collapses the same name and region within 2 km", () => {
    const out = tidyPlaces([place("Pezinok, okres Pezinok", 48.289, 17.268), place("Pezinok, okres Pezinok", 48.295, 17.27)]);
    expect(out).toHaveLength(1);
  });
  it("keeps same-named places that are far apart or in another region", () => {
    const out = tidyPlaces([place("Hrad, okres A", 48.1, 17.1), place("Hrad, okres A", 49.1, 18.1), place("Hrad, okres B", 48.1, 17.1)]);
    expect(out).toHaveLength(3);
  });
  it("lists Slovakia first and otherwise keeps the order", () => {
    const out = tidyPlaces([place("Brno", 49.2, 16.6, "Česko"), place("Zvolen", 48.58, 19.12), place("Banská Bystrica", 48.73, 19.14)]);
    expect(out.map((p) => p.label)).toEqual(["Zvolen", "Banská Bystrica", "Brno"]);
  });
});
