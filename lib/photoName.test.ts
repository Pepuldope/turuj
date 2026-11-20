import { describe, expect, it } from "vitest";
import { localName, safeName as scriptSafeName } from "../scripts/fetch-photos.mjs";
import { parseCommonsThumb, safeName } from "./photoName";

describe("safeName", () => {
  it("replaces every character outside [A-Za-z0-9._-] with an underscore", () => {
    expect(safeName("Kriv%C3%A1%C5%88.JPG")).toBe("Kriv_C3_A1_C5_88.JPG");
    expect(safeName("A b(c)'d.jpg")).toBe("A_b_c__d.jpg");
  });
  it("is the same as the fetch script's copy", () => {
    for (const f of ["Kriv%C3%A1%C5%88.JPG", "x y-z_1.tif.jpg", "a&b=c.svg.png"]) expect(scriptSafeName(f)).toBe(safeName(f));
  });
});

describe("parseCommonsThumb", () => {
  it("splits a Commons thumbnail URL and rejects others", () => {
    expect(parseCommonsThumb("https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4c/Ostra_a7.jpg/500px-Ostra_a7.jpg")).toEqual({
      dir: "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4c/Ostra_a7.jpg/",
      file: "Ostra_a7.jpg",
    });
    expect(parseCommonsThumb("/photos/m/abc.jpg")).toBeNull();
    expect(parseCommonsThumb("https://example.com/500px-x.jpg")).toBeNull();
  });
});

describe("localName", () => {
  it("names a size by hash, safe file name, width and the thumbnail's own extension", () => {
    const url = "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4c/Kriv%C3%A1%C5%88.TIF/500px-Kriv%C3%A1%C5%88.TIF.jpg";
    expect(localName(url, 250)).toMatch(/^[0-9a-f]{10}-Kriv_C3_A1_C5_88\.TIF\.jpg-250px\.jpg$/);
    expect(localName(url, 250)?.slice(0, 10)).toBe(localName(url, 1280)?.slice(0, 10));
    expect(localName("/photos/m/a.jpg", 500)).toBeNull();
  });
});
