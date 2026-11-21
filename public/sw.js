// Túruj service worker.
//
// Cache-on-plan, not cache-everything: nothing is precached at install time except the
// small "no signal" page (OFFLINE_URL). A trip is only cached when the visitor taps "Uložiť výlet" on its
// trip sheet, which postMessage()s a CACHE_TRIP request here with the exact
// URLs to store (the trip page itself, its GPX file, and the OpenFreeMap style,
// vector tiles, sprites and glyphs for the trail's bbox; see lib/tiles.ts).

const CACHE_PREFIX = "turuj-trip-";
// The app's own build assets (/_next/static/, content-hashed, never change) and
// the saved-trips page. Shared by every trip, so deleting one trip keeps them.
const STATIC_CACHE = "turuj-static";
const SHELL_URLS = ["/ulozene"];
// Build assets met while browsing (not saved with a trip). Each deploy brings new
// ones, so keep only the newest MAX_SEEN: a few builds' worth (one is ~40 files).
const SEEN_CACHE = "turuj-seen";
const MAX_SEEN = 200;

// The one file kept before anything is saved: the "Ste bez signálu" page (C203). A page opened with no
// signal and no saved copy gets it instead of the browser's error. It lists the trips saved on this device.
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      try {
        // "reload": past the browser's own copy, so a new service worker brings the page's new version.
        const res = await fetch(new Request(OFFLINE_URL, { cache: "reload" }));
        // A fresh answer: the host may redirect to the address without ".html", and a redirected answer can't be shown for a page.
        if (res.ok) await (await caches.open(STATIC_CACHE)).put(OFFLINE_URL, new Response(await res.blob(), { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }));
      } catch {
        // No signal while installing: without the page, the browser's own error shows, as before.
      }
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([self.clients.claim(), moveOldCaches()]));
});

// Until 2026-10-25 the site was MounTour and its caches were "mountour-…".
// Move them to the "turuj-…" names once, so saved trips stay offline and can still be deleted.
const OLD_PREFIX = "mount" + "our-";
async function moveOldCaches() {
  for (const name of await caches.keys()) {
    if (!name.startsWith(OLD_PREFIX)) continue;
    try {
      const from = await caches.open(name);
      const to = await caches.open("turuj-" + name.slice(OLD_PREFIX.length));
      for (const req of await from.keys()) {
        const res = await from.match(req);
        if (res) await to.put(req, res);
      }
      await caches.delete(name);
    } catch {
      // Storage full or blocked: the old cache stays and caches.match() still finds it.
    }
  }
}

self.addEventListener("message", (event) => {
  const msg = event.data;
  if (!msg || msg.type !== "CACHE_TRIP") return;

  const { slug, urls } = msg;
  const cacheName = CACHE_PREFIX + slug;
  const port = event.ports && event.ports[0];

  event.waitUntil(
    (async () => {
      const cache = await caches.open(cacheName);
      const shared = await caches.open(STATIC_CACHE);
      for (const url of SHELL_URLS) {
        try {
          const res = await fetch(url);
          if (res.ok) await shared.put(url, res);
        } catch {
          // Offline right now: the saved-trips page just won't be refreshed.
        }
      }
      let done = 0;
      const total = urls.length;
      // What could not be stored: the page decides whether the copy still works without signal.
      const failed = [];
      for (const url of urls) {
        let ok = false;
        try {
          // CORS only: an opaque answer can't be drawn by the map anyway, and each one takes ~7 MB of quota.
          const res = await fetch(url, { mode: "cors" });
          if (res.ok) {
            const target = new URL(url, self.location.origin).pathname.startsWith("/_next/static/")
              ? shared
              : cache;
            await target.put(url, res.clone());
            ok = true;
          }
        } catch {
          // Best-effort: one failed tile shouldn't abort the whole trip cache.
        }
        if (!ok) failed.push(url);
        done += 1;
        if (port) port.postMessage({ type: "PROGRESS", done, total });
      }
      // Saving again ("Uložiť zmeny") replaces the copy: drop what this save didn't ask for
      // (last week's tiles, old map style). A URL that failed this time keeps its older copy.
      const bare = (u) => {
        const x = new URL(u, self.location.origin);
        x.hash = "";
        return x.href;
      };
      const wanted = new Set(urls.map(bare));
      for (const req of await cache.keys()) {
        if (!wanted.has(bare(req.url))) await cache.delete(req);
      }
      if (port) port.postMessage({ type: "DONE", done, total, failed });
    })()
  );
});

// Walk reminders (lib/pushPlan.ts): the server sends at most two per trip. Show them as sent;
// a tap opens the trip's trail screen, in a Túruj window that is already open if there is one.
self.addEventListener("push", (event) => {
  let msg = null;
  try {
    msg = event.data ? event.data.json() : null;
  } catch {
    msg = null;
  }
  if (!msg || !msg.title) return;
  event.waitUntil(
    self.registration.showNotification(msg.title, {
      body: msg.body || "",
      tag: msg.tag || "turuj",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: msg.url || "/ulozene" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/ulozene", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of open) {
        if (new URL(c.url).origin !== self.location.origin) continue;
        await c.focus();
        if ("navigate" in c) await c.navigate(url);
        return;
      }
      await self.clients.openWindow(url);
    })()
  );
});

const ANALYTICS_HOSTS = ["umami.is", "umami.dev", "cloudflareinsights.com"];

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Visit counters (Umami, Cloudflare Web Analytics): never through here. An ad blocker
  // stopping them turned into "FetchEvent ... promise was rejected" errors (2026-10-26).
  if (ANALYTICS_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`))) return;

  // Build assets are content-hashed: cache-first, and keep the recent ones we see
  // so a saved trip page can still hydrate offline (its own are saved with it).
  if (url.origin === self.location.origin && url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      (async () => {
        const hit = await caches.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) {
          const copy = res.clone();
          event.waitUntil(
            (async () => {
              const cache = await caches.open(SEEN_CACHE);
              await cache.put(req, copy);
              await trim(cache, MAX_SEEN);
            })().catch(() => {})
          );
        }
        return res;
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      const key = req.url;
      // Pages: network first so a saved trip shows fresh data when online;
      // fall back to the saved copy (ignoring ?query) when offline.
      if (req.mode === "navigate") {
        try {
          return await fetch(req);
        } catch (err) {
          const saved = await caches.match(key, { ignoreSearch: true });
          if (saved) return saved;
          const offline = await caches.match(OFFLINE_URL);
          if (offline) return offline;
          throw err;
        }
      }
      const cached = await matchForPage(event, key);
      if (cached && url.origin !== self.location.origin && !isImmutable(url)) {
        // The map style and TileJSON of a saved trip: they name tile URLs by the map's build
        // date, which changes weekly. Online, use the current ones but don't overwrite the
        // saved copy, so offline the map still asks for exactly the tiles that were saved.
        try {
          return await fetchWithin(req, FRESH_TIMEOUT_MS);
        } catch {
          return cached;
        }
      }
      if (cached) {
        // Cache-first for anything we've explicitly stored (tiles, GPX,
        // the trip page). Our own files refresh in the background when online.
        if (url.origin !== self.location.origin) return cached;
        event.waitUntil(
          fetch(req)
            .then(async (res) => {
              if (res && res.ok) {
                const name = await matchingCacheName(key);
                if (name) (await caches.open(name)).put(key, res.clone());
              }
            })
            .catch(() => {})
        );
        return cached;
      }
      return fetch(req);
    })()
  );
});

/** Drop the oldest entries (keys() lists them in the order they were stored). */
async function trim(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

/** Map pieces at fixed URLs (tiles, fonts, sprites): a saved copy never goes stale. */
function isImmutable(url) {
  return /\.(pbf|mvt|png|jpg|jpeg|webp)$/.test(url.pathname) || url.pathname.includes("/fonts/");
}

/** On a weak signal the saved copy is better than waiting: give the network this long. */
const FRESH_TIMEOUT_MS = 4000;

function fetchWithin(req, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    fetch(req).then(
      (res) => {
        clearTimeout(timer);
        if (res.ok) resolve(res);
        else reject(new Error(String(res.status)));
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

async function matchingCacheName(req) {
  const names = await caches.keys();
  for (const name of names) {
    const cache = await caches.open(name);
    if (await cache.match(req)) return name;
  }
  return null;
}

/**
 * A stored answer, from the cache of the trip the asking page shows first. Every saved
 * trip keeps its own copy of the map style and TileJSON, and those name the tiles by the
 * map's weekly build: trip B saved a week after trip A must get B's copy, or offline
 * its map asks for A's week of tiles and stays blank. The trail screen on Moje výlety
 * (/ulozene?na-trase=<slug>) counts as that trip's page. Other pages take any copy.
 */
async function matchForPage(event, key) {
  try {
    const client = event.clientId ? await self.clients.get(event.clientId) : null;
    const at = client ? new URL(client.url) : null;
    const m = at && /^(?:\/en)?\/trasa\/([^/?#]+)/.exec(at.pathname);
    const slug = m ? decodeURIComponent(m[1]) : at?.searchParams.get("na-trase");
    if (slug) {
      const own = await caches.open(CACHE_PREFIX + slug);
      const hit = await own.match(key);
      if (hit) return hit;
    }
  } catch {
    // No client to ask: fall back to any copy.
  }
  return caches.match(key);
}
