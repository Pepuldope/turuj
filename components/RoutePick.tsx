"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Map as MlMap } from "maplibre-gl";
import { useLang, useT } from "@/lib/i18n";
import { KIND_ICON } from "@/lib/kindIcons";
import { routeNameIn } from "@/lib/lang";
import type { Lang } from "@/lib/lang";
import { LOOP_SUFFIX } from "@/lib/loopRoute";
import { MAP_STYLE_URL, mapPixelRatio } from "@/lib/mapLayers";
import { GOAL_COLOUR, ROUTE_COLOURS } from "@/lib/palette";
import { routeSketch, SKETCH_MAX_H, SKETCH_MIN_H } from "@/lib/routeSketch";
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

/** The size of the map's credit button with its margin: it gets a corner to itself, and no start's name goes there. */
const CREDIT_CORNER = { w: 40, h: 36 };

/**
 * The routes drawn as coloured lines from their starts to the goal, over the real map of that piece of country
 * (Peter, 26 Nov 2026: on a blank background the lines were hard to place). The lines are drawn at once; the
 * map comes in behind them when it has loaded, and without signal the drawing stands alone. The map cannot be
 * moved, so a finger on it scrolls the window. Tapping a line or its start picks that route; the list under
 * it is the control for keyboards and screen readers.
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
    return routeSketch(input.map((r) => ({ slug: r.slug, startName: r.start_name, up: r.up })), goal.location, goal.name, w, SKETCH_MIN_H, SKETCH_MAX_H, CREDIT_CORNER);
  }, [routes, goal, w]);

  // The map behind the lines. The sketch says which piece of the map lies under it, so the map only has to
  // stand still there: no dragging or zooming, which would also pull the lines and the map apart.
  const mapBox = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<{ m: MlMap; ml: typeof import("maplibre-gl") } | null>(null);
  const [mapOn, setMapOn] = useState(false);
  const view = sketch?.view;
  // Kept for the map's first frame: it is made once, a moment after the sketch (the library loads on demand).
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  });
  // The credit folds to its "i" button: open, it would cover a third of a map this small. (MapLibre unfolds
  // it whenever it learns the map's sources, and folds it only when the map is dragged.)
  const foldCredit = () => {
    const credit = mapBox.current?.querySelector(".maplibregl-ctrl-attrib");
    credit?.classList.remove("maplibregl-compact-show");
    credit?.removeAttribute("open");
  };
  const ready = sketch !== null;
  useEffect(() => {
    if (!ready) return;
    let live = true;
    let m: MlMap | null = null;
    (async () => {
      try {
        const ml = await import("maplibre-gl");
        const v = viewRef.current;
        if (!live || !mapBox.current || !v) return;
        m = new ml.Map({
          container: mapBox.current,
          style: MAP_STYLE_URL,
          interactive: false,
          pixelRatio: mapPixelRatio(),
          attributionControl: false,
          center: [v.lon, v.lat],
          zoom: v.zoom,
        });
        // Without signal the style or a tile does not come: the drawing stays alone, and nothing is logged.
        m.on("error", () => {});
        m.once("load", () => {
          if (!live) return;
          foldCredit();
          setMapOn(true);
        });
        setMap({ m, ml });
      } catch {
        // No map (an old browser, no WebGL): the drawing stays as it is.
      }
    })();
    return () => {
      live = false;
      m?.remove();
    };
  }, [ready]);
  const h = sketch?.h;
  useEffect(() => {
    if (!map || !view) return;
    map.m.resize();
    map.m.jumpTo({ center: [view.lon, view.lat], zoom: view.zoom });
  }, [map, view, w, h]);
  // The credit sits in the corner the routes leave free, which can change with the window's width.
  const corner = sketch?.credit;
  useEffect(() => {
    if (!map || !corner) return;
    const control = new map.ml.AttributionControl({ compact: true });
    map.m.addControl(control, corner);
    foldCredit();
    return () => {
      try {
        map.m.removeControl(control);
      } catch {
        // The map is already gone (the window closed).
      }
    };
  }, [map, corner]);
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
    <div ref={ref} className="route-sketch relative box-content overflow-hidden rounded-xl border border-[var(--border)]" style={{ height: sketch?.h ?? SKETCH_MIN_H }}>
      {/* Exactly the drawing's size and corner, so both use the same pixels. The map library gets a box of its
          own inside: it puts its own class on its box (which sets `position: relative`), and React would wipe
          that class again whenever this one's changed. Either way the lines got pushed out of the picture. */}
      {sketch && (
        <div aria-hidden="true" className={`route-sketch-map ${mapOn ? "opacity-100" : "opacity-0"}`} style={{ width: w, height: sketch.h }}>
          <div ref={mapBox} className="h-full w-full" />
        </div>
      )}
      {sketch && (
        <svg
          role="img"
          aria-label={t("Mapa trás: {name}", { name: goal.name })}
          width={w}
          height={sketch.h}
          viewBox={`0 0 ${w} ${sketch.h}`}
          className="pointer-events-none relative block select-none"
        >
          {order.map(({ r, i }) => {
            // Over a map a faded line reads as a stream: the routes not picked keep their colour and go thin.
            const dim = picked !== null && r.slug !== picked;
            const on = r.slug === picked;
            return (
              <g key={r.slug} opacity={dim ? 0.8 : 1}>
                <path d={r.path} fill="none" stroke="#fff" strokeWidth={on ? 10 : dim ? 5.5 : 7} strokeLinecap="round" strokeLinejoin="round" />
                <path d={r.path} fill="none" stroke={colour(i)} strokeWidth={on ? 6 : dim ? 3 : 4} strokeLinecap="round" strokeLinejoin="round" />
                <circle cx={r.start[0]} cy={r.start[1]} r={on ? 6 : dim ? 4 : 5} fill={colour(i)} stroke="#fff" strokeWidth={2} />
              </g>
            );
          })}
          <g transform={`translate(${sketch.goal[0] - 11} ${sketch.goal[1] - 11})`}>
            <rect width={22} height={22} rx={6} fill={GOAL_COLOUR[goal.kind]} stroke="#fff" strokeWidth={2} />
            <g transform="translate(3 3) scale(0.6667)" style={{ color: "#fff" }} dangerouslySetInnerHTML={{ __html: KIND_ICON[goal.kind] }} />
          </g>
          {/* Wide invisible lines on top, so a finger finds the route; the picked one last, so it stays easy to hit. */}
          {order.map(({ r }) => (
            <g key={r.slug} onClick={() => onPick(r.slug)} className="cursor-pointer">
              <path d={r.path} fill="none" stroke="transparent" strokeWidth={24} strokeLinecap="round" strokeLinejoin="round" pointerEvents="stroke" />
              <circle cx={r.start[0]} cy={r.start[1]} r={14} fill="transparent" pointerEvents="fill" />
            </g>
          ))}
        </svg>
      )}
      {/* The names stand on white plates: over a map a bare name runs into the map's own names. */}
      {sketch &&
        [sketch.goalLabel, ...sketch.routes.map((r) => (drawn(r.slug) ? r.label : null))].map(
          (l, i) =>
            l && (
              <span key={i} aria-hidden="true" className="route-sketch-name" style={{ left: l.x - 3, top: l.y - 11 }}>
                {l.text}
              </span>
            ),
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
