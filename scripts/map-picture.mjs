// The picture of the home map that phones show until the live map has drawn
// (HomeExplorer, public/map-picture.jpg). Opens the home page like a phone
// (390 px wide, tall enough for the tallest map card, 560 px), waits for the
// map to finish drawing and saves just the map: no buttons, hints or bars.
// Run by .github/workflows/map-picture.yml every week after the trail update.
//   node scripts/map-picture.mjs [https://turuj.sk/] [public/map-picture.jpg]
import { chromium } from "playwright";

const url = process.argv[2] ?? "https://turuj.sk/";
const out = process.argv[3] ?? "public/map-picture.jpg";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 1000 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto(url, { waitUntil: "load" });
// Starts the map (it waits for the first scroll or an idle moment).
await page.mouse.wheel(0, 200);
await page.evaluate(() => window.scrollBy(0, 200));
await page.waitForSelector(".maplibregl-canvas", { timeout: 60_000 });
await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {});
await page.waitForTimeout(6000);

const box = await page.evaluate(() => {
  const map = document.querySelector(".maplibregl-map");
  if (!map) throw new Error("no map");
  window.scrollTo(0, 0);
  // Everything over the map (bars, buttons, the hint, the map's own controls) goes.
  for (const el of document.querySelectorAll("body *")) {
    if (el.contains(map)) continue;
    const inMap = map.contains(el);
    const pos = getComputedStyle(el).position;
    if ((inMap && el.closest(".maplibregl-control-container")) || (!inMap && (pos === "fixed" || pos === "sticky" || el.closest(".overflow-hidden")?.contains(map)))) {
      el.style.visibility = "hidden";
    }
  }
  const r = map.getBoundingClientRect();
  return { x: r.left, y: r.top + window.scrollY, width: r.width, height: r.height };
});
if (box.height < 500) throw new Error(`map card only ${box.height}px tall: the picture must come from the tallest card`);
await page.screenshot({ path: out, type: "jpeg", quality: 72, fullPage: true, clip: box });
console.log(`saved ${out}: ${Math.round(box.width)}x${Math.round(box.height)} css px`);
await browser.close();
