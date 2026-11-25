"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLang, useT } from "@/lib/i18n";
import { KIND_ICON } from "@/lib/kindIcons";
import { routeNameIn } from "@/lib/lang";
import type { Lang } from "@/lib/lang";
import { LOOP_SUFFIX } from "@/lib/loopRoute";
import { GOAL_COLOUR, ROUTE_COLOURS } from "@/lib/palette";
import { routeSketch, SKETCH_MIN_H } from "@/lib/routeSketch";
import type { DestinationKind, GeoPoint, RouteBrief } from "@/lib/tripSchema";
import type { RouteWalk } from "@/lib/walkFacts";
import { useRouteNumbers } from "@/components/RouteRows";
import { Dot, routeLabel } from "@/components/routeBits";

/** What the visit window needs to ask "which route": the place's routes as step 1 lists them, and its goal. */
export interface RoutePickData {
  /** The main route first, loops included: the same list and order as "Kadiaľ pôjdete", so the colours match. */
  routes: RouteBrief[];
  walks: Record<string, RouteWalk>;
  /** The route of the page on screen. */
  current: string;
  goal: { kind: DestinationKind; name: string; location: GeoPoint };
}

/** A visit whose route the visitor does not know. */
export const UNKNOWN_ROUTE = "";

/** The route's name as step 1 says it; null for a route this place no longer has. */
export function routeNameOf(data: RoutePickData, route: string, lang: Lang): string | null {
  const r = data.routes.find((x) => x.slug === route);
  return r ? routeNameIn(lang, routeLabel(r)) : null;
}

const focus = "focus-visible:outline-2 focus-visible:outline-[var(--accent)]";
const colour = (i: number) => ROUTE_COLOURS[i % ROUTE_COLOURS.length];
const isLoop = (slug: string) => slug.endsWith(LOOP_SUFFIX);

/**
 * The routes drawn as coloured lines from their starts to the goal. A drawing, not a map: it cannot be moved,
 * so a finger on it scrolls the window. Tapping a line or its start picks that route; the list under it is
 * the control for keyboards and screen readers.
 */
function RouteSketch({ data, value, onPick }: { data: RoutePickData; value: string | null; onPick: (route: string) => void }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setW(Math.round(el.clientWidth));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { routes, goal } = data;
  const sketch = useMemo(() => {
    if (w <= 0) return null;
    // Loops last: a start's name then belongs to a route that is always drawn, not to a loop that shows only when picked.
    const input = [...routes].sort((a, b) => Number(isLoop(a.slug)) - Number(isLoop(b.slug)));
    return routeSketch(input.map((r) => ({ slug: r.slug, startName: r.start_name, up: r.up })), goal.location, goal.name, w);
  }, [routes, goal, w]);
  const picked = value !== null && value !== UNKNOWN_ROUTE && routes.some((r) => r.slug === value) ? value : null;
  // A loop runs over two routes that are drawn already: its own line shows only once it is picked.
  const drawn = (slug: string) => !isLoop(slug) || slug === picked;
  // The colour is the route's place in the list, as in step 1; the picked route is drawn last, on top.
  const order = sketch
    ? sketch.routes
        .map((r) => ({ r, i: routes.findIndex((x) => x.slug === r.slug) }))
        .filter(({ r }) => drawn(r.slug))
        .sort((a, b) => Number(a.r.slug === picked) - Number(b.r.slug === picked))
    : [];

  return (
    <div ref={ref} className="route-sketch overflow-hidden rounded-xl border border-[var(--border)]" style={{ height: sketch?.h ?? SKETCH_MIN_H }}>
      {sketch && (
        <svg role="img" aria-label={t("Náčrt trás: {name}", { name: goal.name })} width={w} height={sketch.h} viewBox={`0 0 ${w} ${sketch.h}`} className="block select-none">
          {order.map(({ r, i }) => {
            const dim = picked !== null && r.slug !== picked;
            return (
              <g key={r.slug} opacity={dim ? 0.3 : 1}>
                <path d={r.path} fill="none" stroke="var(--sketch-paper)" strokeWidth={r.slug === picked ? 9 : 7} strokeLinecap="round" strokeLinejoin="round" />
                <path d={r.path} fill="none" stroke={colour(i)} strokeWidth={r.slug === picked ? 5 : 4} strokeLinecap="round" strokeLinejoin="round" />
                <circle cx={r.start[0]} cy={r.start[1]} r={5} fill={colour(i)} stroke="var(--sketch-paper)" strokeWidth={2} />
              </g>
            );
          })}
          <g transform={`translate(${sketch.goal[0] - 11} ${sketch.goal[1] - 11})`}>
            <rect width={22} height={22} rx={6} fill={GOAL_COLOUR[goal.kind]} stroke="var(--sketch-paper)" strokeWidth={2} />
            <g transform="translate(3 3) scale(0.6667)" style={{ color: "#fff" }} dangerouslySetInnerHTML={{ __html: KIND_ICON[goal.kind] }} />
          </g>
          {[sketch.goalLabel, ...sketch.routes.map((r) => (drawn(r.slug) ? r.label : null))].map(
            (l, i) =>
              l && (
                <text key={i} x={l.x} y={l.y} className="route-sketch-name">
                  {l.text}
                </text>
              )
          )}
          {/* Wide invisible lines on top, so a finger finds the route; the picked one last, so it stays easy to hit. */}
          {order.map(({ r }) => (
            <g key={r.slug} onClick={() => onPick(r.slug)} className="cursor-pointer">
              <path d={r.path} fill="none" stroke="transparent" strokeWidth={24} strokeLinecap="round" strokeLinejoin="round" pointerEvents="stroke" />
              <circle cx={r.start[0]} cy={r.start[1]} r={14} fill="transparent" />
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}

/** "Ktorou trasou ste išli?": the sketch, the routes as a list, and "I don't know which". Nothing is picked for the visitor. */
export function RoutePick({ data, value, onChange }: { data: RoutePickData; value: string | null; onChange: (route: string) => void }) {
  const t = useT();
  const lang = useLang();
  const numbers = useRouteNumbers(data.routes, data.walks, data.current);
  const unknown = value === UNKNOWN_ROUTE;

  return (
    <div role="group" aria-label={t("Ktorou trasou ste išli?")} className="flex flex-col gap-2">
      <RouteSketch data={data} value={value} onPick={onChange} />
      {data.routes.map((r, i) => {
        const on = value === r.slug;
        return (
          <button
            key={r.slug}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(r.slug)}
            className={`flex min-h-10 items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left ${on ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)]"} ${focus}`}
          >
            <Dot i={i} />
            {/* The numbers share the name's line and the start has the full width under it: a long start name
                took five lines beside the numbers on a 320 px phone. */}
            <span className="flex min-w-0 flex-1 flex-col leading-snug">
              <span className="flex items-baseline justify-between gap-2">
                <b className="min-w-0 text-[15px]">{routeNameIn(lang, routeLabel(r))}</b>
                <span className="font-data shrink-0 whitespace-nowrap text-[15px]">
                  {numbers[i].km} · +{numbers[i].ascentM}&nbsp;m
                </span>
              </span>
              <span className="text-[13px] text-[var(--muted)]">{t("štart {name}", { name: r.start_name })}</span>
            </span>
          </button>
        );
      })}
      <button
        type="button"
        aria-pressed={unknown}
        onClick={() => onChange(UNKNOWN_ROUTE)}
        className={
          unknown
            ? `flex min-h-10 items-center rounded-xl border border-[var(--accent)] bg-[var(--accent-soft)] px-3.5 py-2.5 text-left text-[14.5px] font-semibold ${focus}`
            : `self-start py-2 text-left text-sm font-bold text-[var(--accent)] underline underline-offset-[3px] ${focus}`
        }
      >
        {t("Neviem, ktorou trasou")}
      </button>
    </div>
  );
}
