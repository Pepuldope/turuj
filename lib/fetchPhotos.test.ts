import { mkdtempSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { localName, localise } from "../scripts/fetch-photos.mjs";

const url = (f: string) => `https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/${f}/500px-${f}`;
const photo = (f: string) => ({ url: url(f), w: 500, h: 375, author: "x", license: "CC0", page: "p" });

describe("localise", () => {
  it("switches an entry only when its 500 px file arrived", async () => {
    const dir = mkdtempSync(join(tmpdir(), "photos-"));
    const photos: Record<string, ReturnType<typeof photo> & { src?: string }> = { "node/1": photo("Good.jpg"), "node/2": photo("Bad.jpg"), "node/3": { ...photo("X.jpg"), url: "/photos/m/x.jpg" } };
    const fetchImpl = async (u: RequestInfo | URL) =>
      String(u).includes("/500px-Bad.jpg") ? new Response("no", { status: 404 }) : new Response(new Uint8Array([1, 2, 3]));
    const r = await localise({ photos, dir, fetchImpl, sleepImpl: async () => {} });
    expect(photos["node/1"].url).toBe(`/photos/c/${localName(url("Good.jpg"), 500)}`);
    expect(photos["node/1"].src).toBe(url("Good.jpg"));
    expect(photos["node/2"].url).toBe(url("Bad.jpg"));
    expect(photos["node/2"].src).toBeUndefined();
    expect(photos["node/3"].url).toBe("/photos/m/x.jpg");
    expect(r).toMatchObject({ local: 1, kept: 1 });
    expect(readdirSync(dir).some((f) => f.endsWith(".part"))).toBe(false);
  });
  it("retries a 429 and skips files already on disk", async () => {
    const dir = mkdtempSync(join(tmpdir(), "photos-"));
    let calls = 0;
    const fetchImpl = async () => (++calls === 1 ? new Response("", { status: 429, headers: { "retry-after": "1" } }) : new Response("ok"));
    await localise({ photos: { a: photo("R.jpg") }, dir, fetchImpl, sleepImpl: async () => {} });
    expect(calls).toBe(2);
    const again = await localise({ photos: { a: photo("R.jpg") }, dir, fetchImpl: async () => { throw new Error("no network"); }, sleepImpl: async () => {} });
    expect(again.local).toBe(1);
  });
  it("removes cached files no photo uses", async () => {
    const dir = mkdtempSync(join(tmpdir(), "photos-"));
    writeFileSync(join(dir, "old-1280px.jpg"), "x");
    await localise({ photos: { a: photo("K.jpg") }, dir, fetchImpl: async () => new Response("ok"), sleepImpl: async () => {} });
    expect(readdirSync(dir)).toEqual([localName(url("K.jpg"), 500)]);
  });
});
