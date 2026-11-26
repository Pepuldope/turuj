"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useSyncExternalStore, type MouseEvent } from "react";
import { arrive, cameFrom, oneStepBackIsSafe, readTrail, tripsOn, type Visit } from "@/lib/cameFrom";
import { useLang, useT } from "@/lib/i18n";
import { langPath } from "@/lib/lang";

// The back link that names the page the visitor came from and takes them back to it (Peter,
// 25 Nov 2026, C219). <Here> on a page writes it into this tab's trail (lib/cameFrom.ts, kept in
// sessionStorage); useCameFrom() reads the page under the current one; backClick() goes back to it
// through the browser's own history, so the page comes back as it was left: the plan, the open step,
// the place in the list.

const KEY = "turuj-trail";
const CHANGED = "turuj-trail-changed";

/** The address a step in the browser's history (back, forward, our link) has just landed on. */
let stepped: string | null = null;
/** True until the first page of this page load has been counted. */
let fresh = true;

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    stepped = window.location.pathname;
  });
}

function stored(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    // Storage blocked: no trail, every back link keeps its plain form.
    return null;
  }
}

function visit(path: string, label: string): void {
  let back = stepped === path;
  stepped = null;
  if (fresh) {
    fresh = false;
    // Going back to a page that had to load anew (after a reload there is no popstate to hear).
    const nav = performance.getEntriesByType?.("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (nav?.type === "back_forward") back = true;
  }
  const trail = arrive(readTrail(stored()), { path, href: path + window.location.search, label, len: window.history.length }, back);
  try {
    sessionStorage.setItem(KEY, JSON.stringify(trail));
  } catch {
    return;
  }
  window.dispatchEvent(new Event(CHANGED));
}

/** The trips the visitor can still step back to in this tab (their slugs). */
export function tripsBehind(): string[] {
  return tripsOn(readTrail(stored()));
}

/**
 * Put on a page to give it a name in the trail. `label` is what a back link TO this page says;
 * `translate` runs it through the page's language first (for pages that have no `lang` at hand).
 */
export function Here({ label, translate = false }: { label: string; translate?: boolean }) {
  const pathname = usePathname();
  const t = useT();
  const text = translate ? t(label) : label;
  useEffect(() => {
    visit(pathname, text);
  }, [pathname, text]);
  return null;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGED, onChange);
  return () => window.removeEventListener(CHANGED, onChange);
}

/** The page the visitor came to this one from; null on the server, on the first page and without storage. */
export function useCameFrom(): Visit | null {
  const pathname = usePathname();
  const raw = useSyncExternalStore(subscribe, stored, () => null);
  return useMemo(() => cameFrom(readTrail(raw), pathname), [raw, pathname]);
}

interface HistoryEntryLike {
  url: string | null;
  key: string;
  index: number;
}
interface NavigationLike {
  currentEntry: HistoryEntryLike | null;
  entries(): HistoryEntryLike[];
  traverseTo(key: string): unknown;
}

/** Opens `from` as a new page, counted as going back so the two pages don't name each other in turns. */
function openPlain(from: Visit): void {
  stepped = from.path;
  window.location.assign(from.href);
}

/** After a step back: if it did not land on `from`, open that page plainly, so the link never does nothing. */
function landOrOpen(from: Visit): void {
  let done = false;
  const check = () => {
    if (done) return;
    done = true;
    window.removeEventListener("popstate", check);
    window.clearTimeout(timer);
    if (window.location.pathname !== from.path) openPlain(from);
  };
  // A step inside the site changes the address at once and says so; a step that reloads the page takes this one away.
  window.addEventListener("popstate", check);
  const timer = window.setTimeout(check, 1200);
}

/**
 * Click on a back link to `from`: step back in the browser's history to that page instead of opening
 * it as a new one. Where the browser can list its history (Navigation API) the step goes to exactly
 * that page; elsewhere it is one step back, and only while this page has added no history entries of
 * its own (lib/cameFrom.ts oneStepBackIsSafe). With no history to step through (a tab opened on this
 * page) the link works as a plain link. A step that fails or lands elsewhere opens the page plainly.
 */
export function backClick(e: MouseEvent, from: Visit): void {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const nav = (window as unknown as { navigation?: NavigationLike }).navigation;
  if (nav?.currentEntry && typeof nav.entries === "function" && typeof nav.traverseTo === "function") {
    const entries = nav.entries();
    for (let i = nav.currentEntry.index - 1; i >= 0; i--) {
      const url = entries[i]?.url;
      if (url && new URL(url).pathname === from.path) {
        e.preventDefault();
        try {
          const step = nav.traverseTo(entries[i].key) as { committed?: Promise<unknown> } | undefined;
          step?.committed?.catch(() => openPlain(from));
        } catch {
          openPlain(from);
        }
        return;
      }
    }
  } else if (window.history.length > 1 && oneStepBackIsSafe(readTrail(stored()), window.history.length)) {
    e.preventDefault();
    window.history.back();
    landOrOpen(from);
    return;
  }
  // Opens as a new page: count it as going back all the same, so the two pages don't name each other in turns.
  stepped = from.path;
}

/**
 * The text link at the top of a plain page: "← Popradské pleso" back to the page the visitor came
 * from, "← Všetky výlety" home when the page was opened directly.
 */
export function PageBackLink() {
  const t = useT();
  const lang = useLang();
  const from = useCameFrom();
  return (
    <Link
      href={from ? from.href : langPath(lang, "/")}
      onClick={from ? (e) => backClick(e, from) : undefined}
      // Below lg the top bar's two round buttons lie over the right end of this row: a long name stops short of them.
      className="block w-fit max-w-[calc(100%-6rem)] truncate text-sm font-semibold text-[var(--accent)] lg:max-w-full"
    >
      ← {from ? from.label : t("Všetky výlety")}
    </Link>
  );
}
