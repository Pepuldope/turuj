"use client";

import type { ReactNode } from "react";
import type { RouteBrief } from "@/lib/tripSchema";
import type { RouteWalk } from "@/lib/walkFacts";
import { formatDuration } from "@/lib/format";
import { PlanStep } from "@/components/PlanStep";
import { RouteRows, useRouteNumbers } from "@/components/RouteRows";
import { routeLabel } from "@/components/routeBits";
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
export function RoutesStep({ n, slug, routes, walks, map }: Props) {
  const t = useT();
  const lang = useLang();
  const at = Math.max(0, routes.findIndex((r) => r.slug === slug));
  const numbers = useRouteNumbers(routes, walks, routes[at]?.slug ?? null);
  if (routes.length < 2) return null;
  const current = routes[at];

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
        <RouteRows routes={routes} at={at} walks={walks} />
      </ul>
      <LangLink href={`/trasa/${slug}/cesty`} className="flex min-h-10 w-fit items-center gap-1.5 text-sm font-bold whitespace-nowrap text-[var(--accent)]">
        {t("Porovnať na mape")} ›
      </LangLink>
    </PlanStep>
  );
}
