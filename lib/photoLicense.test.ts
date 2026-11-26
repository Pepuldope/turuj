import { describe, expect, it } from "vitest";
import { photoLicenseUrl } from "@/lib/photoLicense";

const page = "https://commons.wikimedia.org/wiki/File:X.jpg";

describe("photoLicenseUrl", () => {
  it("keeps the licence link from Commons", () => {
    expect(photoLicenseUrl({ license: "CC BY-SA 4.0", license_url: "https://creativecommons.org/licenses/by-sa/4.0", page })).toBe("https://creativecommons.org/licenses/by-sa/4.0");
  });
  it("gives public domain photos the Public Domain Mark (Dobrá Voda castle)", () => {
    expect(photoLicenseUrl({ license: "Public domain", license_url: null, page })).toBe("https://creativecommons.org/publicdomain/mark/1.0/");
  });
  it("builds CC links from the name", () => {
    expect(photoLicenseUrl({ license: "CC BY 3.0 pl", page })).toBe("https://creativecommons.org/licenses/by/3.0/pl/");
    expect(photoLicenseUrl({ license: "CC0", page })).toBe("https://creativecommons.org/publicdomain/zero/1.0/");
  });
  it("falls back to the file page for anything else", () => {
    expect(photoLicenseUrl({ license: "Attribution", page })).toBe(page);
  });
});
