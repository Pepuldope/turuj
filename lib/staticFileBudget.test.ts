import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FAIL_AT, WARN_AT, countFiles, judge } from "../scripts/asset-budget.mjs";

describe("static file budget (scripts/asset-budget.mjs)", () => {
  it("counts files recursively and per folder (first two levels)", () => {
    const dir = mkdtempSync(join(tmpdir(), "budget-"));
    mkdirSync(join(dir, "data", "trips", "deep"), { recursive: true });
    mkdirSync(join(dir, "icons"));
    writeFileSync(join(dir, "robots.txt"), "");
    writeFileSync(join(dir, "icons", "a.png"), "");
    writeFileSync(join(dir, "data", "trips", "a.json"), "");
    writeFileSync(join(dir, "data", "trips", "deep", "b.json"), "");
    const { total, folders } = countFiles(dir);
    expect(total).toBe(4);
    expect(Object.fromEntries(folders)).toEqual({ ".": 1, icons: 1, "data/trips": 2 });
  });

  it("is quiet below the warning, warns from 19,000 and fails from 19,900", () => {
    const folders = new Map([["photos/c", 9000], ["_next/static", 3000], ["data/trips", 10]]);
    expect(judge(WARN_AT - 1, folders).level).toBe("ok");
    expect(judge(WARN_AT, folders).level).toBe("warn");
    expect(judge(FAIL_AT - 1, folders).level).toBe("warn");
    expect(judge(FAIL_AT, folders).level).toBe("fail");
    expect(judge(18478, folders).line).toBe("Static files: 18,478 of 20,000");
  });

  it("names the biggest folders, largest first", () => {
    const { message } = judge(FAIL_AT, new Map([["a", 5], ["b", 50], ["c", 20]]));
    expect(message).toContain("b (50), c (20), a (5)");
  });
});
