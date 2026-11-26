import { describe, expect, it } from "vitest";
import { routeSketch } from "@/lib/routeSketch";
import type { SketchInput } from "@/lib/routeSketch";

const goal = { lat: 49.16, lon: 20.0 };
const west: SketchInput = { slug: "a", startName: "Tri Studničky", up: [[19.9, 49.12], [19.95, 49.14], [20.0, 49.16]] };
const east: SketchInput = { slug: "b", startName: "Štrbské Pleso", up: [[20.08, 49.12], [20.04, 49.14], [20.0, 49.16]] };
const W = 320;
const H = 170;

const numbers = (path: string) => path.split(/[ML ]/).filter(Boolean).map(Number);

describe("routeSketch", () => {
  it("keeps every line, dot and name inside the box", () => {
    const s = routeSketch([west, east], goal, "Kriváň", W, H, H);
    for (const r of s.routes) {
      const n = numbers(r.path);
      n.forEach((v, i) => {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(i % 2 === 0 ? W : H);
      });
      if (r.label) {
        expect(r.label.x).toBeGreaterThanOrEqual(4);
        expect(r.label.x + r.label.text.length * 6.3).toBeLessThanOrEqual(W - 4 + 0.1);
        expect(r.label.y).toBeLessThanOrEqual(H);
      }
    }
    expect(s.goalLabel?.text).toBe("Kriváň");
  });

  it("puts north up and west left", () => {
    const s = routeSketch([west, east], goal, "Kriváň", W, H, H);
    expect(s.routes[0].start[0]).toBeLessThan(s.routes[1].start[0]);
    expect(s.goal[1]).toBeLessThan(s.routes[0].start[1]);
  });

  it("uses one scale both ways", () => {
    // 0.01 degree north is 1.112 km; 0.01 degree east at 49 degrees north is 0.73 km.
    const up: SketchInput = { slug: "n", startName: "S", up: [[20, 49], [20, 49.01]] };
    const side: SketchInput = { slug: "e", startName: "T", up: [[20, 49], [20.01, 49]] };
    const s = routeSketch([up, side], { lat: 49, lon: 20 }, "X", 400, 400, 400);
    const [x0, y0, , y1] = numbers(s.routes[0].path);
    const [, , x1] = numbers(s.routes[1].path);
    expect((x1 - x0) / (y0 - y1)).toBeCloseTo(Math.cos((49.005 * Math.PI) / 180), 2);
  });

  it("gives routes that run north to south a taller box, within limits", () => {
    const flat: SketchInput = { slug: "f", startName: "S", up: [[19.8, 49.159], [20.0, 49.16]] };
    const steep: SketchInput = { slug: "s", startName: "S", up: [[20.0, 49.0], [20.0, 49.16]] };
    const fair: SketchInput = { slug: "m", startName: "S", up: [[19.9, 49.13], [20.0, 49.16]] };
    expect(routeSketch([flat], goal, "Kriváň", W).h).toBe(170);
    expect(routeSketch([steep], goal, "Kriváň", W).h).toBe(230);
    const h = routeSketch([fair], goal, "Kriváň", W).h;
    expect(h).toBeGreaterThan(170);
    expect(h).toBeLessThan(230);
  });

  it("names a start shared by two routes once", () => {
    const again: SketchInput = { ...west, slug: "c", up: [[19.9, 49.12], [19.92, 49.16], [20.0, 49.16]] };
    const s = routeSketch([west, again], goal, "Kriváň", W, H, H);
    expect(s.routes[0].label?.text).toBe("Tri Studničky");
    expect(s.routes[1].label).toBeNull();
  });

  it("never puts two names on top of each other", () => {
    const near: SketchInput = { slug: "c", startName: "Tri Studničky, horáreň", up: [[19.903, 49.121], [20.0, 49.16]] };
    const s = routeSketch([west, near, east], goal, "Kriváň", W, H, H);
    const rects = [s.goalLabel, ...s.routes.map((r) => r.label)].filter((l) => l !== null).map((l) => ({ x: l.x, y: l.y - 11, w: l.text.length * 6.3, h: 14 }));
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).toBe(false);
      }
  });

  it("shortens a long name", () => {
    const long: SketchInput = { ...west, startName: "Parkovisko pri hornej stanici lanovky" };
    const s = routeSketch([long], goal, "Kriváň", W, H, H);
    expect(s.routes[0].label?.text.endsWith("…")).toBe(true);
    expect(s.routes[0].label?.text.length).toBeLessThanOrEqual(24);
  });

  it("says which piece of the map lies under the box", () => {
    const s = routeSketch([west, east], goal, "Kriváň", W, H, H);
    // Web Mercator at that centre and zoom puts every point where the sketch drew it.
    const world = 512 * 2 ** s.view.zoom;
    const mx = (lon: number) => ((lon + 180) / 360) * world;
    const my = (lat: number) => (0.5 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / (2 * Math.PI)) * world;
    const onMap = ([lon, lat]: [number, number]) => [W / 2 + mx(lon) - mx(s.view.lon), H / 2 + my(lat) - my(s.view.lat)];
    const [gx, gy] = onMap([goal.lon, goal.lat]);
    expect(gx).toBeCloseTo(s.goal[0], 0);
    expect(gy).toBeCloseTo(s.goal[1], 0);
    const [sx, sy] = onMap(west.up[0]);
    expect(sx).toBeCloseTo(s.routes[0].start[0], 0);
    expect(sy).toBeCloseTo(s.routes[0].start[1], 0);
    expect(s.view.zoom).toBeGreaterThan(9);
    expect(s.view.zoom).toBeLessThan(13);
  });

  it("puts the map's credit in the corner the routes leave free, and no name there", () => {
    // Starts in the bottom left and bottom right corners; the goal up in the middle: a top corner is free.
    const low: SketchInput = { slug: "c", startName: "Dolina", up: [[20.08, 49.12], [20.0, 49.16]] };
    const s = routeSketch([west, low], goal, "Kriváň", W, H, H, { w: 40, h: 36 });
    expect(s.credit.startsWith("top")).toBe(true);
    const cx = s.credit.endsWith("right") ? W - 40 : 0;
    const dots = [s.goal, ...s.routes.map((r) => r.start)];
    for (const [x, y] of dots) expect(x > cx - 8 && x < cx + 48 && y < 44).toBe(false);
    for (const l of [s.goalLabel, ...s.routes.map((r) => r.label)]) {
      if (!l) continue;
      const left = l.x - 2;
      const right = l.x + l.text.length * 6.3 + 2;
      expect(left < cx + 40 && right > cx && l.y - 11 < 36).toBe(false);
    }
  });

  it("keeps the credit bottom right when nothing is there", () => {
    // Everything runs up the left side.
    const left: SketchInput = { slug: "l", startName: "S", up: [[19.9, 49.1], [19.9, 49.16]] };
    expect(routeSketch([left], { lat: 49.16, lon: 19.9 }, "X", W, H, H, { w: 40, h: 36 }).credit).toBe("bottom-right");
  });

  it("does not blow a very short route up past the closest zoom", () => {
    const tiny: SketchInput = { slug: "t", startName: "S", up: [[20.0, 49.1599], [20.0001, 49.16]] };
    const s = routeSketch([tiny], goal, "Kriváň", W, H, H);
    expect(s.view.zoom).toBeLessThanOrEqual(16);
  });

  it("draws a place whose routes are one point without breaking", () => {
    const dot: SketchInput = { slug: "a", startName: "S", up: [[20, 49.16]] };
    const s = routeSketch([dot], goal, "Kriváň", W, H, H);
    expect(Number.isFinite(s.goal[0]) && Number.isFinite(s.goal[1])).toBe(true);
    expect(s.routes[0].path).toMatch(/^M[\d.]+ [\d.]+$/);
    expect(s.view.zoom).toBe(13);
    expect(s.view.lon).toBeCloseTo(20, 3);
  });
});
