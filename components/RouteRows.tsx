"use client";

import { useMemo } from "react";
import { formatDuration } from "@/lib/format";
import type { RouteBrief } from "@/lib/tripSchema";
import { useTripSettings } from "@/lib/tripSettings";
import { formatKm, isClearlyShorter, pickWalk, walkMinutes } from "@/lib/walkFacts";
import type { RouteWalk } from "@/lib/walkFacts";
import { useTripAccess } from "@/components/TripAccess";
import { focusOnMap } from "@/lib/mapFocus";
import { markRoutePicked } from "@/lib/planUi";
import { setHoveredRoute, useHoveredRoute } from "@/lib/routeHover";
import { BusOk, Dot, NoParkingChip, routeAccess, routeLabel } from "@/components/routeBits";
import { LangLink, useLang, useT } from "@/lib/i18n";
import { routeNameIn } from "@/lib/lang";

export interface RouteNumbers {
  min: number;
  km: string;
  ascentM: number;
}

/**
 * Each route's walk as its own trip page counts it (lib/walkFacts.ts): from the default parking or
 * stop, at the group's pace. The route on screen (`current`, inside its trip page) takes the parking
 * or stop picked there, so its row says what the facts above say.
 */
export function useRouteNumbers(routes: RouteBrief[], walks: Record<string, RouteWalk>, current: string | null): RouteNumbers[] {
  const { travel, withKids } = useTripSettings();
  const { walk } = useTripAccess();
  const lang = useLang();
  // Memoised: the comparison map re-adds its pins when their lines change.
  return useMemo(
    () =>
      routes.map((r) => {
        const w = r.slug === current ? walk : pickWalk(walks[r.slug], travel === "transit", r.parking);
        return w
          ? { min: walkMinutes(w, withKids), km: formatKm(w.m, lang), ascentM: w.ascentM }
          : { min: r.duration_min, km: formatKm(r.distance_m, lang), ascentM: r.ascent_m };
      }),
    [routes, walks, current, walk, travel, withKids, lang]
  );
}

/** The routes as rows; the one under the pointer (here or on the map) gets an outline and lights up on the map. */
export function RouteRows({ routes, at, walks }: { routes: RouteBrief[]; at: number; walks: Record<string, RouteWalk> }) {
  const hovered = useHoveredRoute();
  const numbers = useRouteNumbers(routes, walks, routes[at]?.slug ?? null);
  const t = useT();
  const lang = useLang();
  return routes.map((r, i) => (
    <li key={r.slug}>
      <LangLink
        href={`/trasa/${r.slug}`}
        aria-current={i === at ? "page" : undefined}
        scroll={false}
        onMouseEnter={() => setHoveredRoute(i === at ? null : r.slug)}
        onMouseLeave={() => setHoveredRoute(null)}
        onClick={(e) => {
          setHoveredRoute(null);
          // The page changes to that route's, the plan card stays as it is (lib/planUi.ts).
          markRoutePicked(r.slug, e.currentTarget.closest("section")?.getBoundingClientRect().top ?? 0);
          // The map beside it fits the chosen route's whole line.
          const lons = r.up.map((p) => p[0]);
          const lats = r.up.map((p) => p[1]);
          if (r.up.length > 1) focusOnMap({ scope: "routes", location: { lat: lats[0], lon: lons[0] }, fit: [{ lat: Math.min(...lats), lon: Math.min(...lons) }, { lat: Math.max(...lats), lon: Math.max(...lons) }] });
        }}
        className={`flex items-center gap-3 px-3.5 py-2.5 outline-offset-[-2px] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${i === at ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--segment-bg)]"} ${
          hovered === r.slug ? "outline-2 outline-[var(--accent)] outline" : ""
        }`}
      >
        <Dot i={i} />
        <span className="flex min-w-0 flex-col">
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[15px] font-bold">
            {routeNameIn(lang, routeLabel(r))}
            {!r.parking && <NoParkingChip />}
          </span>
          <span className="text-[13px] text-[var(--muted)]">
            {t("štart {name}", { name: r.start_name })} · {r.parking ? t(routeAccess(r)) : <BusOk />}
          </span>
        </span>
        <span className="font-data ml-auto shrink-0 text-right text-[16px] leading-tight">
          {formatDuration(numbers[i].min)}
          <span className="block font-sans text-[12px] text-[var(--muted)]">
            {numbers[i].km} · +{numbers[i].ascentM} m
          </span>
        </span>
      </LangLink>
    </li>
  ));
}

/**
 * A clearly shorter way to the same place, said out loud above the (folded) route list: a 4 h main
 * route scared people off places with a short way up (Peter, 2026-10-23). By car, only routes with parking.
 */
export function ShorterRouteHint({ routes, at, walks }: { routes: RouteBrief[]; at: number; walks: Record<string, RouteWalk> }) {
  const { travel } = useTripSettings();
  const t = useT();
  const lang = useLang();
  const numbers = useRouteNumbers(routes, walks, routes[at]?.slug ?? null);
  const mine = numbers[at]?.min;
  let best = -1;
  routes.forEach((r, i) => {
    if (i === at || mine === undefined || (travel !== "transit" && !r.parking) || (travel === "transit" && !r.transit)) return;
    if (isClearlyShorter(numbers[i].min, mine) && (best < 0 || numbers[i].min < numbers[best].min)) best = i;
  });
  if (best < 0) return null;
  const r = routes[best];
  return (
    <LangLink
      href={`/trasa/${r.slug}`}
      scroll={false}
      className="flex items-center gap-3 rounded-[var(--radius-card)] border border-[var(--ok)] bg-[var(--ok-bg)] px-3.5 py-2.5 text-[var(--ok)]"
    >
      <Dot i={best} />
      <span className="flex min-w-0 flex-col">
        <span className="text-[15px] font-bold">{t("Dá sa aj kratšie: {t}", { t: formatDuration(numbers[best].min) })}</span>
        <span className="text-[13px]">
          {routeNameIn(lang, routeLabel(r))} · {t("štart {name}", { name: r.start_name })}
        </span>
      </span>
      <span aria-hidden className="ml-auto shrink-0 text-lg font-bold">
        ›
      </span>
    </LangLink>
  );
}
