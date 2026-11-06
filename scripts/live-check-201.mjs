// Live check of PR #201 on turuj.sk in a real browser (Peter, 6 Nov 2026): the sitemap index,
// plan_commit + the heard_from question after the first save, and the Naplánované column.
// Umami calls are caught here and answered locally, so the test never lands in the statistics;
// our own counter skips it too (navigator.webdriver). Exit 0 with a NOT LIVE line if the site is down.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const SITE = process.env.TARGET || "https://turuj.sk";
const TRIP = process.env.TRIP || "sitno";
const out = "live-check";
mkdirSync(out, { recursive: true });
const lines = [];
let failed = 0;
const ok = (cond, what) => {
  lines.push(`${cond ? "PASS" : "FAIL"} ${what}`);
  if (!cond) failed++;
};

// 1. Sitemaps, plain HTTP.
const idx = await fetch(`${SITE}/sitemap.xml`).catch(() => null);
if (!idx || !idx.ok) {
  console.log(`NOT LIVE: /sitemap.xml answered ${idx?.status ?? "nothing"}`);
  process.exit(0);
}
const idxXml = await idx.text();
const locs = [...idxXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
ok(idxXml.includes("<sitemapindex") && locs.length === 3, `/sitemap.xml is an index of 3 sitemaps (${locs.join(", ")})`);
for (const loc of locs) {
  const r = await fetch(loc);
  const xml = r.ok ? await r.text() : "";
  const n = (xml.match(/<url>/g) || []).length;
  ok(r.ok && n > 0, `${loc.replace(SITE, "")}: ${r.status}, ${n} pages`);
}

// 2. Browser: save a trip, see the questions, catch plan_commit.
const browser = await chromium.launch();
const ctx = await browser.newContext({ locale: "sk-SK", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const events = [];
await ctx.route(/umami/, async (route) => {
  const req = route.request();
  if (req.method() === "POST") {
    try {
      const body = JSON.parse(req.postData() || "{}");
      if (body?.payload?.name) events.push(body.payload);
    } catch {}
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  }
  return route.continue();
});
const page = await ctx.newPage();
await page.goto(`${SITE}/trasa/${TRIP}`, { waitUntil: "domcontentloaded" });
const save = page.getByRole("button", { name: "Uložiť výlet" });
await save.waitFor({ timeout: 30000 }).catch(() => {});
await page.waitForFunction(() => !!window.umami, null, { timeout: 20000 }).catch(() => {});
ok(await save.isVisible(), `"Uložiť výlet" on /trasa/${TRIP}`);
await page.waitForFunction(() => !document.querySelector("button[disabled]")?.textContent?.includes("Uložiť výlet"), null, { timeout: 30000 }).catch(() => {});
await save.click({ timeout: 30000 }).catch((e) => lines.push(`note: save click ${e.message.split("\n")[0]}`));
const shareAsk = page.getByText("Zdieľať výlet?");
await shareAsk.waitFor({ timeout: 15000 }).catch(() => {});
ok(await shareAsk.isVisible(), `"Zdieľať výlet?" offer after saving`);
await page.screenshot({ path: `${out}/1-after-save.png`, fullPage: false });
await page.getByRole("button", { name: "Teraz nie" }).click().catch(() => {});
const heard = page.getByText("Ako ste sa o Túruj dozvedeli?");
await heard.waitFor({ timeout: 10000 }).catch(() => {});
ok(await heard.isVisible(), `"Ako ste sa o Túruj dozvedeli?" after the first save`);
await heard.scrollIntoViewIfNeeded().catch(() => {});
await page.screenshot({ path: `${out}/2-heard-from.png`, fullPage: false });
await page.getByRole("button", { name: "Preskočiť" }).click().catch(() => {});
await page.waitForTimeout(1500);
ok(!(await heard.isVisible()), `"Preskočiť" closes the question`);
await page.waitForTimeout(3000);
const names = events.map((e) => e.name).filter(Boolean);
const commit = events.find((e) => e.name === "plan_commit");
ok(names.includes("trip_saved"), `trip_saved sent to Umami`);
ok(!!commit && commit.data?.via === "save" && commit.data?.trail === TRIP, `plan_commit sent once with via=save (${JSON.stringify(commit?.data ?? null)})`);
ok(names.filter((n) => n === "plan_commit").length === 1, `plan_commit only once (${names.join(", ")})`);

// Second visit: a saved trip already exists, so no question.
const page2 = await ctx.newPage();
await page2.goto(`${SITE}/trasa/sitno-beluj`, { waitUntil: "domcontentloaded" });
const save2 = page2.getByRole("button", { name: "Uložiť výlet" });
await save2.waitFor({ timeout: 30000 }).catch(() => {});
await page2.waitForTimeout(4000);
await save2.click({ timeout: 30000 }).catch(() => {});
await page2.getByRole("button", { name: "Teraz nie" }).click({ timeout: 15000 }).catch(() => {});
await page2.waitForTimeout(1500);
ok(!(await page2.getByText("Ako ste sa o Túruj dozvedeli?").isVisible()), `no question on the second saved trip`);

// 3. /statistiky column.
const stats = await ctx.newPage();
await stats.goto(`${SITE}/statistiky`, { waitUntil: "networkidle" }).catch(() => {});
await stats.getByText("Naplánované").first().waitFor({ timeout: 20000 }).catch(() => {});
ok(await stats.getByText("Naplánované").first().isVisible(), `/statistiky shows "Naplánované"`);
await stats.screenshot({ path: `${out}/3-statistiky.png`, fullPage: true });

await browser.close();
const report = `# Live check ${SITE} (${new Date().toISOString()})\n\n${lines.map((l) => `- ${l}`).join("\n")}\n`;
writeFileSync(`${out}/report.md`, report);
console.log(report);
process.exit(failed ? 1 : 0);
