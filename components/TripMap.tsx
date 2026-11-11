"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { BBox, LatLng, TrailDetail } from "@/lib/types";
import { haversineM, legOffPath, nearestOnPath } from "@/lib/geo";
import { useDriveRoute, useWalkRoute, useWalkRoutes } from "@/lib/useDriveRoute";
import { useUserLocation } from "@/lib/userLocation";
import { useHomeStop } from "@/lib/useHomeStop";
import { fetchGpxText, fetchTrack, parseGpxTrackExact } from "@/lib/gpx";
import { GOAL_LABEL, TRANSIT_LABEL, formatWalk } from "@/lib/format";
import { poiIcon, poiLabel } from "@/lib/food";
import { kindSvg } from "@/lib/kindIcons";
import { GOAL_COLOUR, POI_COLOUR } from "@/lib/palette";
import { MARKING_COLOR, MARKING_LABEL, trackColor } from "@/lib/mapLayers";
import type { MarkSigns } from "@/lib/markSigns";
import { linesNear, markingAlong } from "@/lib/sideMarking";
import type { MarkColour } from "@/lib/tripSchema";
import { TrailMap } from "@/components/TrailMapClient";
import type { MapMarker, MapTrack, SideLeg } from "@/components/TrailMap";
import { useTripAccess } from "@/components/TripAccess";
import { stopFor, useTripStops } from "@/lib/tripStops";
import { focusOnMap, onMapFit } from "@/lib/mapFocus";
import type { MapFit } from "@/lib/mapFocus";
import { justPickedRoute } from "@/lib/planUi";
import { setHoveredRoute, useHoveredRoute } from "@/lib/routeHover";
import { NETWORK_ON } from "@/lib/trailNetwork";
import { useLang, useT } from "@/lib/i18n";
import { keptMapKey } from "@/lib/keptMap";

/** Another route to the same place: drawn faint, a tap opens it. */
export interface OtherRoute {
  slug: string;
  label: string;
  points: [number, number][];
  /** Its colour in the route list (the dot by its name), shown when it is hovered. */
  colour: string;
  /** Drawn only while hovered: loops run along routes already drawn. */
  hoverOnly?: boolean;
}

interface Props {
  detail: TrailDetail;
  gpxUrl: string | null;
  /** The line itself as [lat, lon], in place of the GPX file (a loop of two routes has no file). */
  path?: [number, number][];
  others?: OtherRoute[];
  /** A loop passes each place once; a there-and-back walk twice (stops pick the way there, back or both). */
  loop?: boolean;
  /** Where the walk changes trail marking (lib/markSigns.ts). */
  marks?: MarkSigns;
  /** The picked route's colour from the route list; else its trail marking's. */
  colour?: string;
  /**
   * What the map first frames: all the routes, the parking (or stops) on offer, or the places on the way.
   * Without it this is the big map beside the page, which frames the trail and follows the plan steps (lib/mapFocus.ts).
   */
  focus?: MapFit;
  /** One place's routes share it: the map is kept alive across the soft navigation between their pages (lib/keptMap.ts). */
  placeKey?: string;
}

/** How many parking lots or stops the plan offers (ParkingBlock, TransitBlock). */
const OFFERED = 4;

/** Other routes in a muted slate: clearly not the walk you picked (that one keeps its trail colour), still easy to see. */
const OTHER_ROUTE_COLOUR = "#6b7a93";

/** Closer than this, the car is at the trail: no walking link. */
const AT_TRAIL_M = 60;
/** A stored walk ending this close to the join point is the one to draw (pipeline/walks.py). */
const STORED_END_M = 40;
/** A marking sign this close to the drawn walk is on it (the GPX line and the trip's path differ by a few metres). */
const SIGN_ON_TRACK_M = 40;
/** A place on the way this close to the goal is the goal itself: one pin, not two. */
const SAME_PLACE_M = 60;

const WAY_WORDS = { tam: "cestou tam", spat: "cestou späť", oboje: "cestou tam aj späť" } as const;

const pair = (p: LatLng): [number, number] => [p.lat, p.lon];

/**
 * The trip sheet's map: one track plus every pin that belongs to the trip.
 * With a start, the whole way: the drive (dashed) to the chosen parking, the
 * walk from there to the trail (dotted), then the trail itself.
 */
export function TripMap({ detail, gpxUrl, path, others = [], loop = false, marks, colour: ownColour, focus: focusProp, placeKey }: Props) {
  const t = useT();
  const lang = useLang();
  const { trail, trailheads, pois } = detail;
  const router = useRouter();
  const { parkingLots, choice, choose, rideTo: destination, trailJoin, trailStart, walkFrom, walkLine, transit, stops, stopChoice, chooseStop, skip, walking } = useTripAccess();
  const [gpxPoints, setGpxPoints] = useState<[number, number][]>([]);
  const points = path ?? gpxPoints;
  const { start } = useUserLocation();
  // The big map takes its frame from the plan step the visitor opens; a step's own map keeps the one it was given.
  const [asked, setAsked] = useState<{ focus: MapFit; n: number } | null>(null);
  useEffect(() => (focusProp ? undefined : onMapFit((focus) => setAsked((a) => ({ focus, n: (a?.n ?? 0) + 1 })))), [focusProp]);
  const focus = focusProp ?? asked?.focus ?? null;
  // Places the group added as stops: their pins stand out and the popup offers to remove them.
  const { stops: addedStops, toggle: toggleStop } = useTripStops(trail.slug);
  const homeStop = useHomeStop(transit ? start : null);
  // By bus or train the line runs along the roads to the stop: roughly the bus's way, no timetable yet.
  const drive = useDriveRoute(start, destination);

  // Where the walk to the trail begins: the stop, the chosen parking, else the end of the road route.
  // It ends where it meets the trail: the start, or the nearest point when parked up the trail.
  const driveEnd = drive.route?.points[drive.route.points.length - 1];
  // Pešo: the walk runs from the start itself.
  const carStop: LatLng | null = walking ? start : (walkFrom ?? (!transit && driveEnd ? { lat: driveEnd[0], lon: driveEnd[1] } : null));
  const needsWalk = carStop !== null && trailJoin !== null && haversineM(carStop, trailJoin) > AT_TRAIL_M;
  // The weekly build stores this walk on paths; use it when it ends where the page joins the trail.
  const storedEnd = walkLine?.line[walkLine.line.length - 1];
  const stored =
    needsWalk && storedEnd && haversineM({ lat: storedEnd[1], lon: storedEnd[0] }, trailJoin!) <= STORED_END_M ? walkLine : null;
  const walk = useWalkRoute(needsWalk && !stored ? carStop : null, needsWalk && !stored ? trailJoin : null);
  const walkLeg = useMemo<[number, number][] | undefined>(() => {
    if (!needsWalk) return undefined;
    // No footpath route (offline, router down): a straight dotted line still shows where to go.
    const pts = stored?.line.map(([lon, lat]) => [lat, lon] as [number, number]) ?? walk.route?.points ?? [pair(carStop!), pair(trailJoin!)];
    return [pair(carStop!), ...pts, pair(trailJoin!)];
  }, [needsWalk, stored, walk.route, carStop?.lat, carStop?.lon, trailJoin]); // eslint-disable-line react-hooks/exhaustive-deps

  // The road route ends on the nearest road; finish the line at the parking itself.
  const driveLeg = useMemo<[number, number][] | undefined>(() => {
    const pts = drive.route?.points;
    if (!pts?.length || !destination) return pts;
    return [...pts, pair(destination)];
  }, [drive.route, destination]);

  useEffect(() => {
    let cancelled = false;
    if (gpxUrl && !path) {
      fetchTrack(gpxUrl).then((track) => {
        if (!cancelled) setGpxPoints(track.map((p) => [p.lat, p.lon]));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [gpxUrl, path]);

  // Side trips to the stops the group added: from where they leave the trail, along the paths.
  const sideStops = useMemo(
    () =>
      pois.flatMap((poi) => {
        const stop = addedStops.find((s) => s.id === poi.id);
        return poi.detour_min !== null && stop ? [{ poi }] : [];
      }),
    [pois, addedStops]
  );
  // A place nearer the walk from the car (or the stop) than the trail leaves from that walk (Peter
  // 2026-10-23: a buffet by the car park was reached via the trail start and back).
  const sideFrom = useMemo(() => {
    if (points.length < 2) return [];
    const ll = points.map(([lat, lon]) => ({ lat, lon }));
    const walk = walkLeg?.map(([lat, lon]) => ({ lat, lon })) ?? [];
    return sideStops.map(({ poi }) => {
      const onTrail = nearestOnPath(ll, poi.location);
      const onWalk = walk.length >= 2 ? nearestOnPath(walk, poi.location) : null;
      return onWalk && (!onTrail || onWalk.distanceM < onTrail.distanceM)
        ? { from: onWalk.point, offTrail: true }
        : { from: onTrail?.point ?? ll[0], offTrail: false };
    });
  }, [points, walkLeg, sideStops]);
  const sidePairs = useMemo<[LatLng, LatLng][]>(
    () => sideFrom.map(({ from }, k) => [from, sideStops[k].poi.location] as [LatLng, LatLng]),
    [sideFrom, sideStops]
  );
  const sideRoutes = useWalkRoutes(sidePairs);
  // Each in its place's own colour, so the way to a stop stands out from the trail and the walk from the car.
  // The walk router starts at the nearest point of the trail, but the path to the place often leaves
  // the trail a bit further on: the first stretch then runs along the trail (Peter, 2026-10-29: "you
  // would have to come back"). The leg is drawn from where it really leaves the trail or the walk.
  const sideLegs = useMemo<SideLeg[]>(() => {
    const ll = points.map(([lat, lon]) => ({ lat, lon }));
    const walk = walkLeg?.map(([lat, lon]) => ({ lat, lon })) ?? [];
    return sidePairs.map(([from, to], i) => {
      return {
        points: legOffPath(sideFrom[i].offTrail ? walk : ll, pair(from), sideRoutes[i]?.points ?? [], pair(to)),
        colour: POI_COLOUR[sideStops[i].poi.kind],
      };
    });
  }, [points, walkLeg, sidePairs, sideRoutes, sideStops, sideFrom]);

  // Parked up the trail: the stretch below the join is drawn faint, the walk you do in full colour.
  // There-and-back tracks run out and back, so that stretch is cut at both ends.
  const hovered = useHoveredRoute();
  // The other routes' full tracks from the place's GPX (the picked route's file holds them all):
  // the trip file's lines are simplified and looked "low-poly" next to the picked one (Peter, 2026-10-27).
  const otherSlugs = others.map((o) => o.slug).join(",");
  const [fullOthers, setFullOthers] = useState<Record<string, [number, number][]>>({});
  useEffect(() => {
    let cancelled = false;
    if (gpxUrl && otherSlugs) {
      fetchGpxText(gpxUrl.split("#")[0]).then((text) => {
        if (cancelled || !text) return;
        const got: Record<string, [number, number][]> = {};
        for (const slug of otherSlugs.split(",")) {
          const track = parseGpxTrackExact(text, slug);
          if (track.length >= 2) got[slug] = track.map((p) => [p.lat, p.lon]);
        }
        setFullOthers(got);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [gpxUrl, otherSlugs]);
  const otherTracks = useMemo<MapTrack[]>(
    () =>
      // An other route under the pointer (on the map or in the route list) lights up in its list colour.
      others.flatMap((o): MapTrack[] => {
        const pts = fullOthers[o.slug] ?? o.points;
        return o.slug === hovered
          ? [{ slug: o.slug, label: o.label, points: pts, color: o.colour, state: "selected" }]
          : o.hoverOnly
            ? []
            : [{ slug: o.slug, label: o.label, points: pts, color: OTHER_ROUTE_COLOUR, state: "normal" }];
      }),
    [others, hovered, fullOthers]
  );
  // Each marking sign sits on the drawn line: the trip's path and the GPX line differ by a few
  // metres, and a sign off the line looked lost (Peter, 2026-10-29). Found in walking order; a sign
  // with no line near it is left out.
  const signs = useMemo(() => {
    if (!marks || points.length < 2) return [];
    const up = loop ? points.length - 1 : Math.floor((points.length - 1) / 2);
    const ll = points.slice(0, up + 1).map(([lat, lon]) => ({ lat, lon }));
    let at = 0;
    const out: (MarkSigns["signs"][number] & { at: number })[] = [];
    for (const s of marks.signs) {
      const hit = nearestOnPath(ll.slice(at), s.location);
      if (!hit || hit.distanceM > SIGN_ON_TRACK_M) continue;
      at += hit.i;
      out.push({ ...s, location: hit.point, at });
    }
    return out;
  }, [points, marks, loop]);

  // The marking each side walk follows: a sign where it leaves the trail.
  const sideKey = JSON.stringify(sideLegs.map((l) => l.points));
  const [sideMarks, setSideMarks] = useState<{ key: string; marks: (MarkColour | null | undefined)[] }>({ key: "", marks: [] });
  useEffect(() => {
    let cancelled = false;
    const legs = JSON.parse(sideKey) as [number, number][][];
    const trip = points.map(([lat, lon]) => ({ lat, lon }));
    // The route's own marking where the walk turns off: on a line carrying several markings, the
    // other one is the one to name, or both signs at the junction would say the same (Peter, 2026-10-29).
    const up = loop ? points.length - 1 : Math.floor((points.length - 1) / 2);
    const routeAt = (p: [number, number]): MarkColour | null => {
      const hit = nearestOnPath(trip, { lat: p[0], lon: p[1] });
      if (!marks || !hit) return null;
      const i = loop || hit.i <= up ? hit.i : Math.max(0, points.length - 2 - hit.i);
      return signs.filter((x) => x.at <= i).pop()?.colour ?? marks.start;
    };
    Promise.all(legs.map(async (leg) => markingAlong(leg.slice(0, -1), await linesNear(leg), trip, routeAt(leg[0])))).then(
      (marks) => !cancelled && setSideMarks({ key: sideKey, marks })
    );
    return () => {
      cancelled = true;
    };
  }, [sideKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const tracks = useMemo<MapTrack[]>(() => {
    const color = ownColour ?? trackColor(trail.marking);
    // Drawn where they really run, never shifted aside: a shifted line bent and broke at sharp
    // turns (Peter, 2026-10-27). Other routes run thin over the picked one (TrailMap orders
    // them), and a hovered one goes on top in its colour.
    const under = otherTracks.filter((o) => o.state !== "selected");
    const over = otherTracks.filter((o) => o.state === "selected");
    const whole: MapTrack[] = [...under, { slug: trail.slug, points, color, state: "selected", arrows: loop }, ...over];
    if (!skip || !trailJoin || points.length < 3) return whole;
    const ll = points.map(([lat, lon]) => ({ lat, lon }));
    const mid = Math.floor((points.length - 1) / 2);
    const out = nearestOnPath(ll.slice(0, mid + 1), trailJoin);
    const back = nearestOnPath(ll.slice(mid), trailJoin);
    if (!out || !back) return whole;
    const a: [number, number] = [out.point.lat, out.point.lon];
    const b: [number, number] = [back.point.lat, back.point.lon];
    const bi = mid + back.i;
    return [
      ...under,
      { slug: `${trail.slug}-skipped-out`, points: [...points.slice(0, out.i + 1), a], color, state: "dimmed" },
      { slug: `${trail.slug}-skipped-back`, points: [b, ...points.slice(bi + 1)], color, state: "dimmed" },
      { slug: trail.slug, points: [a, ...points.slice(out.i + 1, bi + 1), b], color, state: "selected", arrows: loop },
      ...over,
    ];
  }, [trail.slug, trail.marking, ownColour, points, skip, trailJoin, otherTracks, loop]);

  const goal = trail.goal_location;
  const goalKind = trail.goal ?? "ine";
  // Parked up the trail, the signs on the stretch you skip go faint with it.
  const walked = useMemo(() => tracks.find((tk) => tk.slug === trail.slug)?.points ?? [], [tracks, trail.slug]);
  const markers = useMemo<MapMarker[]>(
    () => [
      // Under every other pin: a sign where the marking changes, the stripe in the colour to follow next.
      ...signs.map((s, i) => {
        const mark = (c: MarkColour | null) => (c ? t(MARKING_LABEL[c]) : t("bez značky"));
        const off = !!skip && !walked.some(([lat, lon]) => haversineM({ lat, lon }, s.location) < SIGN_ON_TRACK_M);
        return {
          id: `mark-${i}`,
          kind: "mark" as const,
          location: s.location,
          title: loop ? t("Ďalej {mark}", { mark: mark(s.colour) }) : t("Zmena značky"),
          lines: loop
            ? []
            : [t("Cestou tam ďalej {mark}", { mark: mark(s.colour) }), t("Cestou späť ďalej {mark}", { mark: mark(s.before) })],
          colour: s.colour ? `linear-gradient(#fff 0 30%, ${MARKING_COLOR[s.colour]} 30% 70%, #fff 70%)` : undefined,
          dimmed: off,
        };
      }),
      // Where a side walk leaves the trail, the marking it follows to the stop.
      ...(sideMarks.key === sideKey ? sideLegs : []).flatMap((leg, i) => {
        const c = sideMarks.marks[i];
        if (c === undefined || leg.points.length < 2) return [];
        const [lat, lon] = leg.points[0];
        return [
          {
            id: `side-mark-${i}`,
            kind: "mark" as const,
            location: { lat, lon },
            title: t("K zastávke {mark}", { mark: c ? t(MARKING_LABEL[c]) : t("bez značky") }),
            lines: [t(sideStops[i].poi.name)],
            colour: c ? `linear-gradient(#fff 0 30%, ${MARKING_COLOR[c]} 30% 70%, #fff 70%)` : undefined,
          },
        ];
      }),
      ...trailheads.map((th) => ({
        id: `th-${th.id}`,
        kind: "trailhead" as const,
        location: th.location,
        title: th.name,
        lines: [t("Začiatok trasy"), ...(marks ? [t("Na začiatku {mark}", { mark: marks.start ? t(MARKING_LABEL[marks.start]) : t("bez značky") })] : [])],
      })),
      // By car only parking, by train or bus only the stops: never both.
      ...(transit
        ? []
        : parkingLots.map((p, i) => ({
            id: `pk-${p.id}`,
            kind: "parking" as const,
            location: p.location,
            title: t(p.name),
            lines: [
              // lib/data.ts writes the same note in Slovak (p.note); here it follows the page's language.
              `${t(p.join ? "{m} od trasy" : "{m} od začiatku trasy", { m: formatWalk(p.join?.walk_m ?? p.walk_m, lang) })}${p.fee === true ? t(", spoplatnené") : p.fee === false ? t(", bezplatné") : ""}. ${t("Zdroj: OpenStreetMap")}.`,
              ...(i === choice ? [t("Vybraté parkovisko")] : []),
            ],
            active: i === choice,
            dimmed: i !== choice,
            // Tapping another parking picks it (the plan and both routes follow).
            onClick: i === choice ? undefined : () => (choose(i), focusOnMap({ location: p.location, scope: "access", context: p.join?.location ?? trailStart ?? undefined })),
          }))),
      ...(transit
        ? stops.map((s, i) => ({
            id: `ts-${s.id}`,
            kind: `transit-${s.mode}` as const,
            location: s.location,
            title: s.name,
            lines: [
              t(TRANSIT_LABEL[s.mode]),
              s.join ? t("{m} od trasy", { m: formatWalk(s.join.walk_m, lang) }) : t("{m} od začiatku trasy", { m: formatWalk(s.distance_m, lang) }),
              ...(i === stopChoice ? [t("Tu vystúpite")] : []),
            ],
            active: i === stopChoice,
            dimmed: i !== stopChoice,
            onClick: i === stopChoice ? undefined : () => (chooseStop(i), focusOnMap({ location: s.location, scope: "access", context: s.join?.location ?? trailStart ?? undefined })),
          }))
        : []),
      ...(transit && homeStop
        ? [
            {
              id: "home-stop",
              kind: `transit-${homeStop.mode}` as const,
              location: homeStop.location,
              title: homeStop.name,
              lines: [t("Tu nastúpite, {m} od štartu", { m: formatWalk(homeStop.distance_m, lang) })],
            },
          ]
        : []),
      ...pois.filter((p) => !goal || haversineM(p.location, goal) > SAME_PLACE_M).map((p) => ({
        id: `poi-${p.id}`,
        kind: "poi" as const,
        location: p.location,
        title: t(p.name),
        lines: [
          p.detour_min !== null ? `${t(poiLabel(p))} · ${t("odbočka +{n} min tam aj späť", { n: p.detour_min })}` : t(poiLabel(p)),
          ...addedStops.filter((s) => s.id === p.id).map((s) => (loop ? t("Vaša zastávka") : `${t("Vaša zastávka")} ${t(WAY_WORDS[s.way ?? "tam"])}`)),
        ],
        colour: POI_COLOUR[p.kind],
        icon: kindSvg(poiIcon(p), 14),
        active: addedStops.some((s) => s.id === p.id),
        action: {
          label: addedStops.some((s) => s.id === p.id) ? `✓ ${t("Zastávka · odobrať")}` : `+ ${t("Pridať zastávku")}`,
          onClick: () => toggleStop(stopFor(p)),
        },
      })),
      // What you came to see (the tower, cave, castle...): its kind's colour and icon, as on the home map.
      ...(goal
        ? [
            {
              id: "goal",
              kind: "goal" as const,
              location: goal,
              title: trail.goal_name ?? trail.name,
              lines: [`${t("Cieľ výletu")} · ${t(GOAL_LABEL[goalKind])}`],
              colour: GOAL_COLOUR[goalKind],
              icon: kindSvg(goalKind, 16),
              active: true,
            },
          ]
        : []),
    ],
    [marks, signs, walked, skip, sideMarks, sideKey, sideLegs, sideStops, trailheads, parkingLots, choice, choose, trailStart, stops, stopChoice, chooseStop, homeStop, pois, transit, goal, goalKind, trail.goal_name, trail.name, addedStops, toggleStop, loop, t, lang]
  );

  // Opens on the trail and where the car stops. The drive is drawn too, but a long drive would
  // shrink the trail to a speck (testers), so it isn't fitted: zoom out to see it.
  // Fitted once per start and way of travel: picking another parking keeps the view where it is.
  const baseKey = `${start?.lat},${start?.lon},${transit},${trail.slug}`;
  const [driveFitFor, setDriveFitFor] = useState<string | null>(null);
  if (drive.route && driveFitFor !== baseKey) setDriveFitFor(baseKey);
  const fitKey = `${baseKey},${driveFitFor === baseKey}`;
  const bounds = useMemo<BBox | null>(() => {
    const pts: [number, number][] = [];
    if (carStop) pts.push(pair(carStop));
    // The trail itself: switching to another route glides over to it (the others stay drawn around it).
    if (trail.bbox) pts.push(pair(trail.bbox.sw), pair(trail.bbox.ne));
    if (pts.length === 0) return null;
    const lats = pts.map((p) => p[0]);
    const lons = pts.map((p) => p[1]);
    return {
      sw: { lat: Math.min(...lats), lon: Math.min(...lons) },
      ne: { lat: Math.max(...lats), lon: Math.max(...lons) },
    };
  }, [fitKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // The frame a plan step asks for: its own choice and what belongs to it, never closer than the trail's own zoom limit.
  const boundsFor = useCallback(
    (f: MapFit): BBox | null => {
      const pts: LatLng[] = [];
      const corners = (b: BBox | null) => b && pts.push(b.sw, b.ne);
      if (f === "routes") {
        corners(trail.bbox);
        for (const o of others) for (const [lat, lon] of o.points) pts.push({ lat, lon });
        if (goal) pts.push(goal);
      } else if (f === "access") {
        if (trailStart) pts.push(trailStart);
        if (walking) {
          if (start) pts.push(start);
        } else if (transit) pts.push(...stops.slice(0, OFFERED).map((s) => s.location));
        else pts.push(...parkingLots.slice(0, OFFERED).map((p) => p.location));
        if (pts.length === 0) corners(trail.bbox);
      } else {
        corners(trail.bbox);
        pts.push(...pois.map((p) => p.location));
        if (goal) pts.push(goal);
      }
      if (pts.length === 0) return null;
      const lats = pts.map((p) => p.lat);
      const lons = pts.map((p) => p.lon);
      const box = { sw: { lat: Math.min(...lats), lon: Math.min(...lons) }, ne: { lat: Math.max(...lats), lon: Math.max(...lons) } };
      if (f !== "routes") return box;
      // The same set of routes seen from another route's page frames to nearly the same box: rounded outwards
      // (about 100 m) so opening another route doesn't glide the map back out to the whole set.
      const r = 1000;
      return {
        sw: { lat: Math.floor(box.sw.lat * r) / r, lon: Math.floor(box.sw.lon * r) / r },
        ne: { lat: Math.ceil(box.ne.lat * r) / r, lon: Math.ceil(box.ne.lon * r) / r },
      };
    },
    [trail.bbox, others, goal, trailStart, walking, start, transit, stops, parkingLots, pois]
  );
  const focusBounds = useMemo(() => (focus ? boundsFor(focus) : null), [focus, boundsFor]);
  // Right after a route was picked in the plan (this is that route's page): fit that route, not the whole set (lib/planUi.ts).
  const [routePicked] = useState(() => justPickedRoute());
  const pickedBounds = useMemo<BBox | null>(() => {
    if (!routePicked || !(focusProp === "routes" || (!focusProp && !asked))) return null;
    const pts: LatLng[] = trail.bbox ? [trail.bbox.sw, trail.bbox.ne] : [];
    if (goal) pts.push(goal);
    if (pts.length === 0) return null;
    const lats = pts.map((p) => p.lat);
    const lons = pts.map((p) => p.lon);
    return { sw: { lat: Math.min(...lats), lon: Math.min(...lons) }, ne: { lat: Math.max(...lats), lon: Math.max(...lons) } };
  }, [routePicked, focusProp, asked, trail.bbox, goal]);
  // A step map opened after another parking (or stop) was picked starts centred on it.
  const openOn = useMemo(() => {
    if (focusProp !== "access" || walking) return undefined;
    const item = transit ? (stopChoice > 0 ? stops[stopChoice] : undefined) : choice > 0 ? parkingLots[choice] : undefined;
    return item ? { location: item.location, context: item.join?.location ?? trailStart ?? undefined } : undefined;
  }, [focusProp, walking, transit, stopChoice, stops, choice, parkingLots, trailStart]);

  return (
    <TrailMap
      tracks={tracks}
      markers={markers}
      bounds={pickedBounds ?? focusBounds ?? bounds}
      refit={asked?.n}
      scope={focusProp}
      focusFloor={(f) => (f ? boundsFor(f) : null)}
      openOn={openOn}
      driveLeg={driveLeg}
      walkLeg={walkLeg}
      sideLegs={sideLegs}
      network={NETWORK_ON ? "context" : undefined}
      onSelectTrail={(slug) => {
        if (others.some((o) => o.slug === slug)) router.push(`/trasa/${slug}`, { scroll: false });
      }}
      onHoverTrail={others.length ? (slug) => setHoveredRoute(others.some((o) => o.slug === slug) ? slug : null) : undefined}
      ariaLabel={t("Mapa trasy")}
      persistKey={keptMapKey(placeKey, focusProp)}
    />
  );
}
