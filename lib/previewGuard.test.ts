import { describe, expect, it } from "vitest";
import { PREVIEW_MESSAGE, refuseOnPreview, writesAllowed } from "./previewGuard";

describe("writesAllowed", () => {
  it("lets the production hosts write", () => {
    expect(writesAllowed("turuj.sk")).toBe(true);
    expect(writesAllowed("www.turuj.sk")).toBe(true);
    expect(writesAllowed("TURUJ.SK")).toBe(true);
  });

  it("lets local development write (its own database)", () => {
    expect(writesAllowed("localhost:3000")).toBe(true);
    expect(writesAllowed("127.0.0.1:8787")).toBe(true);
  });

  it("refuses previews and look-alikes", () => {
    expect(writesAllowed("turuj-pr-42.nemcok-peter123.workers.dev")).toBe(false);
    expect(writesAllowed("preview.turuj.sk")).toBe(false);
    expect(writesAllowed("turuj.sk.evil.example")).toBe(false);
    expect(writesAllowed("")).toBe(false);
  });
});

describe("refuseOnPreview", () => {
  it("answers 403 with a JSON message on a preview", async () => {
    const res = refuseOnPreview(new Request("https://turuj-pr-42.example.workers.dev/api/review", { method: "POST" }));
    expect(res?.status).toBe(403);
    expect(await res?.json()).toEqual({ error: "preview", message: PREVIEW_MESSAGE });
  });

  it("lets production through", () => {
    expect(refuseOnPreview(new Request("https://turuj.sk/api/review", { method: "POST" }))).toBeNull();
  });
});
