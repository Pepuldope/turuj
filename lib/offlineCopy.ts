"use client";

import type { BBox } from "@/lib/types";
import { offlineMapUrls } from "@/lib/tiles";
import { assetNames, deployQuery, gpxIn, withQuery } from "@/lib/pageAssets";

/** A few missing map tiles leave gaps; more than this share and the offline map isn't worth the name. */
export const MAX_MISSING_SHARE = 0.1;

/**
 * Ask the service worker to store these URLs. Fails when one of `required` (the page, the GPX)
 * or too many of the rest could not be stored, so the page never says "works without signal" wrongly.
 */
async function cacheTrip(slug: string, urls: string[], required: string[], onProgress: (done: number, total: number) => void) {
  // Never resolves when the service worker failed to register: give up instead of saving forever.
  const reg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("no service worker")), 10000)),
  ]);
  const channel = new MessageChannel();
  const done = new Promise<void>((resolve, reject) => {
    channel.port1.onmessage = (event) => {
      const msg = event.data;
      if (msg.type === "PROGRESS") onProgress(msg.done, msg.total);
      if (msg.type === "DONE") {
        const failed: string[] = msg.failed ?? [];
        if (failed.some((u) => required.includes(u)) || failed.length > MAX_MISSING_SHARE * urls.length) reject(new Error("incomplete"));
        else resolve();
      }
    };
    setTimeout(() => reject(new Error("timeout")), 120000);
  });
  reg.active?.postMessage({ type: "CACHE_TRIP", slug, urls }, [channel.port2]);
  await done;
}

/**
 * Makes the trip's offline copy: the page, its GPX file, the build files it runs on and the map of its area.
 * Throws when the copy is incomplete, so the caller never marks it "works without signal" wrongly.
 */
export async function makeOfflineCopy(o: { slug: string; pagePath: string; gpxUrl: string | null; bbox: BBox | null; assets: string[]; onProgress?: (done: number, total: number) => void }): Promise<void> {
  const required = [o.pagePath, ...(o.gpxUrl ? [o.gpxUrl] : [])];
  const mapUrls = o.bbox ? await offlineMapUrls(o.bbox) : [];
  const urls = [...required, ...o.assets, ...mapUrls];
  // The map style and its TileJSON (the URLs without a file extension): without them there is no offline map at all.
  const mapCore = mapUrls.filter((u) => !/\.[a-z0-9]+$/i.test(new URL(u, window.location.origin).pathname));
  await cacheTrip(o.slug, urls, [...required, ...mapCore], o.onProgress ?? (() => {}));
  // The map's style couldn't be read (no signal, map service down): the page and GPX are kept, but no map.
  if (o.bbox && mapUrls.length === 0) throw new Error("no map");
}

/** More build files than a trip page can have: something is wrong (a loop, or not our page). */
const MAX_BUILD_FILES = 80;

/**
 * The build files a trip page runs on, found without opening it: those its HTML names, then the ones the
 * scripts name inside (the late-loaded map). The browser's own cache hands these to the service worker.
 */
export async function pageBuildFiles(pagePath: string): Promise<{ assets: string[]; gpxUrl: string | null }> {
  const res = await fetch(pagePath, { credentials: "same-origin" });
  if (!res.ok) throw new Error("page");
  const html = await res.text();
  const fromHtml = assetNames(html);
  const query = deployQuery(fromHtml);
  const all = new Set(fromHtml);
  const read = new Set<string>();
  let todo = [...all].filter((u) => /\.js(\?|$)/.test(u));
  while (todo.length > 0) {
    for (const url of todo) {
      read.add(url);
      const r = await fetch(url, { credentials: "same-origin" });
      if (!r.ok) throw new Error("script");
      for (const name of assetNames(await r.text())) all.add(withQuery(name, query));
      if (all.size > MAX_BUILD_FILES) throw new Error("too many build files");
    }
    todo = [...all].filter((u) => /\.js(\?|$)/.test(u) && !read.has(u));
  }
  return { assets: [...all], gpxUrl: gpxIn(html) };
}
