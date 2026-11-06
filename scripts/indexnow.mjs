// IndexNow (G2): tell Bing, Yandex and the other IndexNow engines which pages exist, right after a
// deploy. Reads the live sitemaps of https://turuj.sk and POSTs every URL to api.indexnow.org.
// Usage: node scripts/indexnow.mjs [--dry]   (--dry lists the counts and sends nothing)
// The key file is public/<key>.txt and must be live at https://turuj.sk/<key>.txt before this runs.

const HOST = "turuj.sk";
const SITE = `https://${HOST}`;
const KEY = "4dea437f29603b230815bcbcf01020e3";
const ENDPOINT = "https://api.indexnow.org/indexnow";
const BATCH = 10000;
const dry = process.argv.includes("--dry");

async function get(url) {
  const res = await fetch(url, { headers: { "User-Agent": "turuj-indexnow" } });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.text();
}

const locs = (xml) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&"));

// /sitemap.xml is an index of per-type sitemaps; a plain urlset is read directly.
const root = await get(`${SITE}/sitemap.xml`);
const sitemaps = root.includes("<sitemapindex") ? locs(root) : [`${SITE}/sitemap.xml`];
const urls = new Set();
for (const sm of sitemaps) {
  for (const u of locs(await get(sm))) if (new URL(u).host === HOST) urls.add(u);
}
const all = [...urls];
console.log(`${sitemaps.length} sitemap(s), ${all.length} URLs`);
if (dry) process.exit(0);

for (let i = 0; i < all.length; i += BATCH) {
  const urlList = all.slice(i, i + BATCH);
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `${SITE}/${KEY}.txt`, urlList }),
  });
  console.log(`batch ${i / BATCH + 1}: ${urlList.length} URLs -> ${res.status}`);
  // 200 and 202 are both accepted (202: key validation pending).
  if (res.status !== 200 && res.status !== 202) {
    console.error(await res.text());
    process.exit(1);
  }
}
