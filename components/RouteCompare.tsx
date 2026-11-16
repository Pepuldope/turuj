"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { formatDuration } from "@/lib/format";
import { ROUTE_COLOURS, ROUTE_LETTERS } from "@/lib/palette";
import type { GeoPoint, RouteBrief } from "@/lib/tripSchema";
import type { BBox } from "@/lib/types";
import { TrailMap } from "@/components/TrailMapClient";
import type { MapMarker, MapTrack } from "@/components/TrailMap";
import type { RouteWalk } from "@/lib/walkFacts";
import { BusOk, NoParkingChip, routeAccess, routeLabel } from "@/components/routeBits";
import { LangLink, useLang, useT } from "@/lib/i18n";
import { routeNameIn } from "@/lib/lang";
import { useRouteNumbers } from "@/components/RouteRows";

interface Props {
  /** The trip the visitor came from. */
  slug: string;
  destination: string;
  goal: GeoPoint;
  routes: RouteBrief[];
  /** Each route's walk from its default parking and stop, as its trip page counts it. */
  walks: Record<string, RouteWalk>;
  /** The page header (back link and title). */
  children: ReactNode;
}

const colour = (i: number) => ROUTE_COLOURS[i % ROUTE_COLOURS.length];
const letter = (i: number) => ROUTE_LETTERS[i % ROUTE_LETTERS.length];

/** All routes to a place on one map, each with its letter and colour; tap one to bring it forward. */
export function RouteCompare({ slug, destination, goal, routes, walks, children }: Props) {
  const [sel, setSel] = useState(Math.max(0, routes.findIndex((r) => r.slug === slug)));
  const t = useT();
  const lang = useLang();
  // Under the pointer, on a card or on the map: lit up on the map, outlined in the list.
  const [hover, setHover] = useState<number | null>(null);
  const onHoverTrail = (s: string | null) => {
    const i = routes.findIndex((r) => r.slug === s);
    setHover(i >= 0 ? i : null);
  };
  const numbers = useRouteNumbers(routes, walks, null);
  const maxMin = Math.max(1, ...numbers.map((n) => n.min));
  const maxUp = Math.max(1, ...numbers.map((n) => n.ascentM));

  // Memoised: the map redraws its lines when `tracks` changes and re-adds every pin when `markers` does,
  // so neither may be rebuilt on unrelated renders, and hovering must not touch the pins.
  const tracks = useMemo<MapTrack[]>(
    () =>
      routes.map((r, i) => ({
        slug: r.slug,
        label: routeNameIn(lang, routeLabel(r)),
        points: r.up.map(([lon, lat]) => [lat, lon] as [number, number]),
        color: colour(i),
        state: i === sel || i === hover ? "selected" : "dimmed",
      })),
    [routes, sel, hover, lang]
  );
  const markers = useMemo<MapMarker[]>(() => [
    ...routes.map((r, i) => ({
      id: `start-${r.slug}`,
      kind: "poi" as const,
      location: { lat: r.up[0][1], lon: r.up[0][0] },
      title: `${letter(i)} · ${r.start_name}`,
      lines: [routeNameIn(lang, routeLabel(r)), formatDuration(numbers[i].min)],
      colour: colour(i),
      icon: letter(i),
      active: i === sel,
      onClick: () => setSel(i),
    })),
    { id: "goal", kind: "trailhead" as const, location: goal, title: destination },
  ], [routes, numbers, sel, goal, destination, lang]);
  const bounds = useMemo<BBox>(() => {
    const pts = routes.flatMap((r) => r.up);
    const lons = pts.map((p) => p[0]);
    const lats = pts.map((p) => p[1]);
    return { sw: { lat: Math.min(...lats), lon: Math.min(...lons) }, ne: { lat: Math.max(...lats), lon: Math.max(...lons) } };
  }, [routes]);

  return (
    <>
      <div className="flex w-full flex-col gap-4 lg:w-[460px] lg:shrink-0 lg:overflow-y-auto lg:overscroll-contain">
        <div className="px-4 pt-4">{children}</div>
        <div className="h-[42vh] border-y border-[var(--border)] lg:hidden">
          <TrailMap tracks={tracks} markers={markers} bounds={bounds} onSelectTrail={(s) => setSel(routes.findIndex((r) => r.slug === s))} onHoverTrail={onHoverTrail} ariaLabel={t("Cesty k cieľu {name} na mape", { name: destination })} />
        </div>
        <ul className="flex flex-col gap-2 px-4 pb-6">
          {routes.map((r, i) => (
            <li key={r.slug}>
              {/* The card picks the route; the link to the trip sits beside the button, not inside it
                  (a link inside a role=button card had its Enter swallowed by the card). */}
              <div
                onClick={() => setSel(i)}
                // Mouse only: on iPhone a hover change on the first tap swallowed the tap (C173).
                onPointerEnter={(e) => e.pointerType === "mouse" && setHover(i)}
                onPointerLeave={(e) => e.pointerType === "mouse" && setHover(null)}
                className={`flex cursor-pointer flex-col gap-2 rounded-[var(--radius-card)] border bg-[var(--card-bg)] px-3.5 py-3 ${
                  i === sel
                    ? "border-[var(--accent)] shadow-[0_0_0_1px_var(--accent)]"
                    : i === hover
                      ? "border-[var(--foreground)] shadow-[0_0_0_1px_var(--foreground)]"
                      : "border-[var(--border)]"
                }`}
              >
                <button type="button" aria-pressed={i === sel} onClick={() => setSel(i)} className="flex flex-col gap-2 text-left">
                  <span className="flex items-center gap-2.5">
                    <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold text-white" style={{ background: colour(i) }}>
                      {letter(i)}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[15px] font-bold">
                        {routeNameIn(lang, routeLabel(r))}
                        {!r.parking && <NoParkingChip />}
                      </span>
                      <span className="text-[13px] text-[var(--muted)]">
                        {t("štart {name}", { name: r.start_name })} · {r.parking ? t(routeAccess(r)) : <BusOk />}
                      </span>
                    </span>
                  </span>
                  <span className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-1 text-[12.5px] text-[var(--muted)]">
                    <span>{t("Čas")}</span>
                    <Bar share={numbers[i].min / maxMin} colour={colour(i)} />
                    <span className="font-data text-right text-[15px] text-[var(--foreground)]">{formatDuration(numbers[i].min)}</span>
                    <span>{t("Do kopca")}</span>
                    <Bar share={numbers[i].ascentM / maxUp} colour={colour(i)} />
                    <span className="font-data text-right text-[15px] text-[var(--foreground)]">+{numbers[i].ascentM} m</span>
                    <span>{t("Dĺžka")}</span>
                    <span />
                    <span className="font-data text-right text-[15px] text-[var(--foreground)]">{numbers[i].km}</span>
                  </span>
                </button>
                {i === sel && (
                  <LangLink
                    href={`/trasa/${r.slug}`}
                    onClick={(e) => e.stopPropagation()}
                    className="w-fit rounded-full bg-[var(--accent)] px-4 py-1.5 text-sm font-bold text-[var(--accent-contrast)]"
                  >
                    {r.slug === slug ? t("Späť na túto cestu") : t("Vybrať túto cestu")}
                  </LangLink>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="hidden lg:block lg:h-dvh lg:flex-1 lg:border-l lg:border-[var(--border)]">
        <TrailMap tracks={tracks} markers={markers} bounds={bounds} onSelectTrail={(s) => setSel(routes.findIndex((r) => r.slug === s))} onHoverTrail={onHoverTrail} ariaLabel={t("Cesty k cieľu {name} na mape", { name: destination })} />
      </div>
    </>
  );
}

function Bar({ share, colour }: { share: number; colour: string }) {
  return (
    <span className="h-1.5 overflow-hidden rounded-full bg-[var(--segment-bg)]">
      <span className="block h-full rounded-full" style={{ width: `${Math.round(share * 100)}%`, background: colour }} />
    </span>
  );
}
