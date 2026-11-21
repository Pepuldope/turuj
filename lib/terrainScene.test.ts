import { describe, expect, it } from "vitest";
import fixtures from "@/lib/__fixtures__/terrain-prototype.json";
import { TERRAIN_KINDS, WINDOW, bannerScene, cardScene, cardSvg, unpackLayer } from "@/lib/terrainScene";
import type { PackedLayers, SceneGeometry } from "@/lib/terrainScene";
import type { DestinationKind } from "@/lib/tripSchema";

// Real outputs of the mockup run (26 places, every kind), packed by pipeline/terrain.py pack_window.
type Fixture = { name: string; kind: DestinationKind; card: PackedLayers; banner: PackedLayers };
const PLACES = Object.entries(fixtures as Record<string, Fixture>);

const PEAKS: DestinationKind[] = ["vrchol", "hrad", "vyhliadka", "chata"];
const TOL = 0.6;

/** The line's y at x (the points are in increasing x). */
function yAt(pts: number[][], x: number) {
  for (let i = 1; i < pts.length; i++) {
    if (pts[i][0] >= x) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      return y0 + ((x - x0) / Math.max(x1 - x0, 1e-6)) * (y1 - y0);
    }
  }
  return pts[pts.length - 1][1];
}

const all = (f: (id: string, p: Fixture, which: "card" | "banner", g: SceneGeometry) => void) => {
  for (const [id, p] of PLACES) {
    f(id, p, "card", cardScene(id, p.kind, p.card));
    f(id, p, "banner", bannerScene(id, p.kind, p.banner));
  }
};

describe("terrain pictures", () => {
  it("all 9 kinds render, in both sizes, from the prototype's real data", () => {
    expect(new Set(PLACES.map(([, p]) => p.kind))).toEqual(new Set(TERRAIN_KINDS));
    all((id, p, which, g) => {
      expect(g.svg.startsWith("<svg ")).toBe(true);
      expect(g.svg.endsWith("</svg>")).toBe(true);
      expect(g.svg).not.toMatch(/NaN|undefined|Infinity/);
      expect(g.svg).toContain('aria-hidden="true"');
      expect(g.svg.length).toBeGreaterThan(200);
      expect(g.svg.length, `${p.name} ${which}`).toBeLessThan(20000);
    });
  });

  it("is deterministic: the same place always gives the same picture, and the seed is the place id", () => {
    for (const [id, p] of PLACES) {
      expect(cardScene(id, p.kind, p.card).svg).toBe(cardScene(id, p.kind, p.card).svg);
      expect(bannerScene(id, p.kind, p.banner).svg).toBe(bannerScene(id, p.kind, p.banner).svg);
    }
    // The forest of a low place changes with the id, never with anything else.
    const [id, p] = PLACES.find(([, q]) => q.kind === "pleso")!;
    expect(bannerScene(id, p.kind, p.banner).svg).not.toBe(bannerScene(id + "x", p.kind, p.banner).svg);
  });

  it("card: the summit / sign / feature sits at 0.75 of the 96 wide strip, never under the kind icon", () => {
    all((id, p, which, g) => {
      if (which !== "card") return;
      expect(g.W).toBe(96);
      expect(g.focusX).toBe(72);
      for (const a of g.anchors) {
        expect(a.x0).toBeLessThanOrEqual(72);
        expect(a.x1).toBeGreaterThanOrEqual(72);
        // The white icon is 30 px wide, centred at ~45: it covers x 30..60. Things with a small footprint stay clear of it.
        if (a.what !== "pleso" && a.what !== "roklina") expect(a.x0, `${p.name} ${a.what}`).toBeGreaterThanOrEqual(60);
      }
    });
    // The window of the card file puts the place at column 77 of 103: 77 / 102 of the way across, as 0.75 of 96 is 72.
    expect(WINDOW.card.focusCol).toBe(77);
    expect(Math.abs((WINDOW.card.focusCol / (WINDOW.card.n - 1)) * 96 - 72)).toBeLessThan(0.6);
    expect(WINDOW.banner.focusCol).toBe(96);
  });

  it("ground rule: a sign or feature never floats, its base is on or under the ground line", () => {
    all((id, p, which, g) => {
      if (p.kind !== "ine") expect(g.anchors.length).toBeGreaterThan(0); // "other" has the skyline and nothing on it
      for (const a of g.anchors) {
        for (let x = Math.max(a.x0, 0); x <= Math.min(a.x1, g.W); x += 0.5) {
          // Ground above (smaller y) or within 0.6 units of the base.
          expect(yAt(g.ground, x) - a.y, `${p.name} ${which} ${a.what} x=${x}`).toBeLessThanOrEqual(TOL);
        }
      }
    });
  });

  it("ground rule: castle, hut and tower stand on raised ground with gentle slopes", () => {
    for (const kind of ["hrad", "chata", "vyhliadka"] as const) {
      const [id, p] = PLACES.find(([, q]) => q.kind === kind)!;
      for (const [which, g] of [["card", cardScene(id, kind, p.card)], ["banner", bannerScene(id, kind, p.banner)]] as const) {
        const a = g.anchors[0];
        // The ground is raised to the base under the whole footprint (never lower than it, within the simplifying tolerance; a real ridge may stand higher)...
        const top = yAt(g.ground, g.focusX);
        for (let x = a.x0; x <= a.x1; x += 0.5) expect(yAt(g.ground, x) - top, `${kind} ${which}`).toBeLessThanOrEqual(1);
        // ...and from there on the ground is never lower than a ramp of 0.55 units per unit (a castle hill, not a cliff).
        for (let x = a.x1 + 0.6; x < Math.min(a.x1 + 30, g.W); x += 1) expect(yAt(g.ground, x) - (top + 0.55 * (x - a.x1 - 0.6)), `${kind} ${which} x=${x}`).toBeLessThanOrEqual(0.55);
      }
    }
  });

  it("ground rule: every tree's whole base is on or under its ground line", () => {
    let trees = 0;
    all((id, p, which, g) => {
      for (const t of g.trees) {
        trees++;
        for (let x = t.x - t.w; x <= t.x + t.w; x += 0.25) expect(yAt(t.line, x) - t.y, `${p.name} ${which} tree x=${t.x}`).toBeLessThanOrEqual(TOL);
      }
    });
    expect(trees).toBeGreaterThan(200);
  });

  it("banner: a waterfall is drawn 1.4 x the card's scale", () => {
    const [id, p] = PLACES.find(([, q]) => q.kind === "vodopad")!;
    const card = cardScene(id, "vodopad", p.card);
    const banner = bannerScene(id, "vodopad", p.banner);
    // Anchor half width: 11 * s * big. Card s = 0.5; banner s = 1 and big = 1.4.
    const half = (g: SceneGeometry) => (g.anchors[0].x1 - g.anchors[0].x0) / 2;
    expect(half(card)).toBeCloseTo(11 * 0.5, 5);
    expect(half(banner)).toBeCloseTo(11 * 1.4, 5);
    // A pond or a gorge is not scaled up.
    const [lid, lake] = PLACES.find(([, q]) => q.kind === "pleso")!;
    expect(bannerScene(lid, "pleso", lake.banner).anchors[0].x1 - bannerScene(lid, "pleso", lake.banner).anchors[0].x0).toBeCloseTo(2 * 96, 5);
  });

  it("has no flag and no marker", () => {
    all((id, p, which, g) => expect(g.svg).not.toContain("stroke:#fff"));
  });

  it("a peak's summit is at the picture's focus and is its highest point", () => {
    for (const [id, p] of PLACES.filter(([, q]) => PEAKS.includes(q.kind))) {
      for (const [which, win] of [["card", p.card], ["banner", p.banner]] as const) {
        const cols = win.map((l) => unpackLayer(l, WINDOW[which].n));
        const c = WINDOW[which].focusCol;
        // Where the mockup chose the view so that the place stands out, the middle layer peaks at the focus.
        const mid = cols[1].slice(c - 6, c + 7);
        expect(Math.max(...mid), `${p.name} ${which}`).toBeGreaterThanOrEqual(Math.max(...cols[1]) - 4);
      }
      const g = cardScene(id, p.kind, p.card);
      expect(Math.min(...g.ground.map((q) => q[1]))).toBeGreaterThanOrEqual(0);
    }
  });

  it("the card file entry round-trips through cardSvg", () => {
    const [id, p] = PLACES[0];
    const entry = [TERRAIN_KINDS.indexOf(p.kind), ...p.card] as [number, ...PackedLayers];
    expect(cardSvg(id, entry)).toBe(cardScene(id, p.kind, p.card).svg);
    expect(cardSvg(id, [99, ...p.card])).toBeNull();
  });

  it("unpacks a layer with its ends and straight lines between the vertices", () => {
    // a0 = 10 units (0.5 degree), then +4 columns at +20, then +2 columns at -10.
    const l = unpackLayer([10, 4, 20, 2, -10], 7);
    expect(l.map((v) => Math.round(v * 20))).toEqual([10, 15, 20, 25, 30, 25, 20]);
  });
});
