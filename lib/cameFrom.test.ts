import { describe, expect, it } from "vitest";
import { arrive, cameFrom, oneStepBackIsSafe, readTrail, tripsOn, type Visit } from "@/lib/cameFrom";

const v = (path: string, label = path, href = path): Visit => ({ path, href, label });
const HOME = v("/", "Všetky výlety");
const PLESO = v("/trasa/popradske-pleso", "Popradské pleso");
const TOWN = v("/vylety-z/vysoke-tatry", "Okolo Vysokých Tatier");
const STRBSKE = v("/trasa/strbske-pleso", "Štrbské pleso");

/** Walks a list of [page, came by going back?] steps. */
function walk(steps: [Visit, boolean?][]): Visit[] {
  return steps.reduce<Visit[]>((trail, [here, back]) => arrive(trail, here, !!back), []);
}

describe("where the visitor came from", () => {
  it("names the trip on the town page reached from it (Peter's case)", () => {
    const trail = walk([[HOME], [PLESO], [TOWN]]);
    expect(cameFrom(trail, TOWN.path)).toEqual(PLESO);
  });

  it("names the trip on a neighbour trip reached from it", () => {
    const trail = walk([[PLESO], [STRBSKE]]);
    expect(cameFrom(trail, STRBSKE.path)?.label).toBe("Popradské pleso");
  });

  it("has nothing to name on a page opened directly", () => {
    expect(cameFrom(walk([[PLESO]]), PLESO.path)).toBeNull();
  });

  it("gives the trip its old back link again after going back to it", () => {
    const trail = walk([[HOME], [PLESO], [TOWN], [PLESO, true]]);
    expect(trail.map((x) => x.path)).toEqual(["/", "/trasa/popradske-pleso"]);
    expect(cameFrom(trail, PLESO.path)).toEqual(HOME);
  });

  it("cuts back over several pages at once", () => {
    const trail = walk([[HOME], [PLESO], [TOWN], [STRBSKE], [PLESO, true]]);
    expect(trail.map((x) => x.path)).toEqual(["/", "/trasa/popradske-pleso"]);
  });

  it("grows when the same trip is opened again by a link, not by going back", () => {
    const trail = walk([[PLESO], [STRBSKE], [PLESO]]);
    expect(cameFrom(trail, PLESO.path)).toEqual(STRBSKE);
  });

  it("going forward to a page that is not in the trail adds it", () => {
    const trail = walk([[PLESO], [TOWN], [PLESO, true], [TOWN, true]]);
    expect(cameFrom(trail, TOWN.path)).toEqual(PLESO);
  });

  it("treats a reload, a new query string and the language switch as the same page", () => {
    let trail = walk([[HOME], [PLESO]]);
    trail = arrive(trail, v("/trasa/popradske-pleso", "Popradské pleso", "/trasa/popradske-pleso?z=poprad"), false);
    expect(trail).toHaveLength(2);
    expect(trail[1].href).toBe("/trasa/popradske-pleso?z=poprad");
    trail = arrive(trail, v("/en/trasa/popradske-pleso", "Popradské pleso"), false);
    expect(trail).toHaveLength(2);
    expect(cameFrom(trail, "/en/trasa/popradske-pleso")).toEqual(HOME);
  });

  it("says nothing on a page that is not the last one visited", () => {
    expect(cameFrom(walk([[PLESO], [TOWN]]), "/ulozene")).toBeNull();
  });

  it("keeps the trail short", () => {
    const many: [Visit][] = Array.from({ length: 80 }, (_, i) => [v(`/trasa/t${i}`)]);
    expect(walk(many)).toHaveLength(30);
  });
});

describe("the trips a back link can still lead to", () => {
  it("lists trip pages only, Slovak and English alike", () => {
    const trail = walk([[HOME], [PLESO], [TOWN], [v("/en/trasa/krivan", "Kriváň")]]);
    expect(tripsOn(trail)).toEqual(["popradske-pleso", "krivan"]);
  });

  it("drops a trip once the visitor has gone back past it", () => {
    const trail = walk([[PLESO], [STRBSKE], [PLESO, true]]);
    expect(tripsOn(trail)).toEqual(["popradske-pleso"]);
  });
});

describe("the stored trail", () => {
  it("survives being written and read", () => {
    const trail = walk([[HOME], [PLESO]]);
    expect(readTrail(JSON.stringify(trail))).toEqual(trail);
  });

  it("reads anything broken as empty", () => {
    expect(readTrail(null)).toEqual([]);
    expect(readTrail("{")).toEqual([]);
    expect(readTrail('{"a":1}')).toEqual([]);
    expect(readTrail('[{"path":"https://evil.example","href":"https://evil.example","label":"x"}, null, 3]')).toEqual([]);
    expect(readTrail('[{"path":"/a","href":"//evil.example/a","label":"x"}]')).toEqual([]);
  });
});

describe("one step back in the browser's history", () => {
  const SAVED: Visit = { path: "/ulozene", href: "/ulozene", label: "Moje výlety" };

  it("is safe while the history is as long as when the visitor arrived", () => {
    const trail = arrive(arrive([], { ...PLESO, len: 3 }, false), { ...SAVED, len: 4 }, false);
    expect(oneStepBackIsSafe(trail, 4)).toBe(true);
  });

  it("is not safe once the page added an entry of its own (the trail screen, a sign-in detour)", () => {
    const trail = arrive(arrive([], { ...PLESO, len: 3 }, false), { ...SAVED, len: 4 }, false);
    expect(oneStepBackIsSafe(trail, 5)).toBe(false);
  });

  it("keeps the first arrival's length through a reload or a changed query string", () => {
    let trail = arrive(arrive([], { ...PLESO, len: 3 }, false), { ...SAVED, len: 4 }, false);
    trail = arrive(trail, { ...SAVED, href: "/ulozene?na-trase=devin", len: 5 }, false);
    expect(trail[trail.length - 1]).toMatchObject({ href: "/ulozene?na-trase=devin", len: 4 });
    expect(oneStepBackIsSafe(trail, 5)).toBe(false);
  });

  it("is not safe with a trail from before lengths were kept", () => {
    expect(oneStepBackIsSafe(arrive(arrive([], PLESO, false), SAVED, false), 2)).toBe(false);
  });
});
