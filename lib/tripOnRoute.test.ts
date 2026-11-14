import { describe, expect, it } from "vitest";
import { foodOnWalk, MAX_PLACES, onRouteTeaser, pickRoutePlaces, placeText, waterOnWalk } from "@/lib/tripOnRoute";
import type { Poi } from "@/lib/types";

let n = 0;
const poi = (kind: Poi["kind"], name: string, along_m: number | null, detour_min: number | null = null, lat = 49 + n++ * 0.01): Poi => ({
  id: `p${n}`,
  trail_id: null,
  kind,
  name,
  location: { lat, lon: 19 },
  note: null,
  along_m,
  detour_min,
});

describe("pickRoutePlaces", () => {
  it("drops unnamed places, single-name cottages and hotels tagged as shelters", () => {
    const r = pickRoutePlaces([poi("chata", "Cyril", 100), poi("chata", "Hana", 200), poi("utulna", "Hotel Choč", 300), poi("vyhliadka", "", 400), poi("chata", "Téryho chata", 500)]);
    expect(r.on.map((p) => p.name)).toEqual(["Téryho chata"]);
  });

  it("keeps an unnamed or oddly named spring as just 'prameň' (it is still water)", () => {
    const r = pickRoutePlaces([poi("pramen", "Irena", 900)]);
    expect(r.on).toHaveLength(1);
    expect(r.on[0].name).toBeNull();
    expect(placeText("sk", r.on[0])).toBe("prameň, pri 0,9 km");
  });

  it("merges the same name and kind within 300 m, keeps them when far apart", () => {
    const a = poi("vyhliadka", "Hrebienok", 1000, null, 49.0);
    const b = poi("vyhliadka", "Hrebienok", 1010, null, 49.001);
    const c = poi("vyhliadka", "Hrebienok", 3000, null, 49.1);
    expect(pickRoutePlaces([a, b, c]).on).toHaveLength(2);
  });

  it("puts on-walk places first in walking order, then side trips shortest first", () => {
    const r = pickRoutePlaces([poi("vyhliadka", "Bokom", 100, 20), poi("chata", "Zbojnícka chata", 4000), poi("pramen", "Studnička pod Dubom", 1500), poi("hrad", "Hrad Strečno", 200, 5)]);
    expect(r.on.map((p) => p.name)).toEqual(["Studnička pod Dubom", "Zbojnícka chata"]);
    expect(r.off.map((p) => p.name)).toEqual(["Hrad Strečno", "Bokom"]);
  });

  it("caps the list and counts the rest", () => {
    const many = Array.from({ length: 12 }, (_, i) => poi("vyhliadka", `Vyhliadka ${i}`, i * 500));
    const r = pickRoutePlaces(many);
    expect(r.on).toHaveLength(MAX_PLACES);
    expect(r.hidden).toBe(4);
  });

  it("says km for on-walk places, the detour for side trips, and never the kind twice", () => {
    const r = pickRoutePlaces([poi("chata", "Kamenná chata pod Chopkom", 2800), poi("vyhliadka", "Chopok", 3000, 7)]);
    expect(placeText("sk", r.on[0])).toBe("Kamenná chata pod Chopkom, pri 2,8 km");
    expect(placeText("sk", r.off[0])).toBe("vyhliadka Chopok, +7 min odbočka");
  });
});

describe("teaser and water/food facts", () => {
  it("is null with nothing to name", () => {
    expect(onRouteTeaser("sk", pickRoutePlaces([]))).toBeNull();
  });
  it("says 'only off the route' when nothing is on it", () => {
    expect(onRouteTeaser("sk", pickRoutePlaces([poi("vyhliadka", "Titanic", 100, 30)]))).toBe("Len kúsok bokom: vyhliadka Titanic");
  });
  it("counts only places on the walk for water and food", () => {
    expect(waterOnWalk([poi("pramen", "x", 1, 10)])).toBe(false);
    expect(waterOnWalk([poi("pramen", "x", 1)])).toBe(true);
    expect(foodOnWalk([poi("vyhliadka", "x", 1)])).toBe(false);
    expect(foodOnWalk([poi("chata", "Chata pod x", 1)])).toBe(true);
  });
  it("never talks about opening", () => {
    const text = placeText("sk", pickRoutePlaces([poi("obcerstvenie", "Bufet Horec", 500)]).on[0]);
    expect(text).not.toMatch(/otvoren|zatvoren|open|closed/i);
  });
});

describe("food cap", () => {
  it("names at most 3 food places so huts and viewpoints stay", () => {
    const r = pickRoutePlaces([...Array.from({ length: 6 }, (_, i) => poi("obcerstvenie", `Bufet ${i}`, i * 100)), poi("chata", "Chata pod Skalou", 2000), poi("vyhliadka", "Skala", 2500)]);
    expect(r.on.filter((p) => p.kind === "obcerstvenie")).toHaveLength(3);
    expect(r.on.map((p) => p.kind)).toContain("chata");
    expect(r.hidden).toBe(3);
  });
});
