"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import type { RouteBrief } from "@/lib/tripSchema";
import type { RouteWalk } from "@/lib/walkFacts";
import { formatDuration } from "@/lib/format";
import { PlanStep } from "@/components/PlanStep";
import { RouteRows, useRouteNumbers } from "@/components/RouteRows";
import { routeLabel } from "@/components/routeBits";
import { ShowMore, shownRows } from "@/components/ShowMore";
import { LangLink, useLang, useT } from "@/lib/i18n";
import { routeNameIn } from "@/lib/lang";

interface Props {
  /** The step's number in the plan. */
  n: number;
  /** The trip on screen. */
  slug: string;
  /** The main route first, then the others (the trip file's "routes"). */
  routes: RouteBrief[];
  /** Each route's walk from its default parking and stop (lib/tripFiles.ts getRouteWalks). */
  walks: Record<string, RouteWalk>;
  /** The step's own map (phones), drawn above the list. */
  map: ReactNode;
}

/**
 * "Kadiaľ pôjdete": most places have more than one marked route. The page shows the main one (the
 * start most people use); here you switch to another. A trip with a single route has no such choice
 * and doesn't render this (TripPlanner says the one route as plain info). Folded, it names the
 * route on screen and its walk; it links to the map comparison.
 */
/**
 * Whether a place's route list was unfolded. Switching routes loads another route's page, which mounts this
 * step anew; kept here (per place, for this visit) so the list stays open (Peter, 2026-11-12). Module state, not
 * storage: a fresh page load starts folded on server and client alike.
 */
const unfolded = new Set<string>();

export function RoutesStep({ n, slug, routes, walks, map }: Props) {
  const t = useT();
  const lang = useLang();
  const at = Math.max(0, routes.findIndex((r) => r.slug === slug));
  const numbers = useRouteNumbers(routes, walks, routes[at]?.slug ?? null);
  const place = routes[0]?.slug ?? slug;
  const [all, setAllState] = useState(() => unfolded.has(place));
  const setAll = (next: (v: boolean) => boolean) =>
    setAllState((v) => {
      const on = next(v);
      if (on) unfolded.add(place);
      else unfolded.delete(place);
      return on;
    });
  if (routes.length < 2) return null;
  const current = routes[at];
  const shown = shownRows(routes.length, all, [at]);

  return (
    <PlanStep
      id="route"
      n={n}
      title={t("Kadiaľ pôjdete")}
      summary={
        <>
          {routeNameIn(lang, routeLabel(current))} · <span className="font-data">{formatDuration(numbers[at].min)}</span>
        </>
      }
    >
      {map}
      {/* The first and last rows follow the list's corners (12 px card minus the 1 px border), so their hover outline isn't cut off. */}
      <ul className="flex flex-col divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card-bg)] [&>li:first-child>a]:rounded-t-[11px] [&>li:last-child>a]:rounded-b-[11px]">
        <RouteRows routes={routes} at={at} walks={walks} shown={shown} />
      </ul>
      <div className="flex flex-col gap-1">
        <ShowMore kind="routes" hidden={routes.length - shown.length} open={all} onToggle={() => setAll((v) => !v)} />
        <LangLink href={`/trasa/${slug}/cesty`} className="flex min-h-10 w-fit self-end items-center gap-1.5 text-sm font-bold whitespace-nowrap text-[var(--accent)]">
          {t("Porovnať na mape")} ›
        </LangLink>
      </div>
    </PlanStep>
  );
}
