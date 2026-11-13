"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { DayPlan } from "@/lib/dayPlan";
import { formatDuration, formatDurationShort, formatTime } from "@/lib/format";
import { publishDayMoment, UNMARKED_COLOUR } from "@/lib/dayClock";
import { LAND, seasonDetails, seasonOf, seeded, snowSvg } from "@/lib/season";
import { UI_ICON, iconEdge } from "@/lib/uiIcons";
import { MARKING_COLOR, MARKING_LABEL } from "@/lib/mapLayers";
import { KIND_ICON } from "@/lib/kindIcons";
import { POI_COLOUR } from "@/lib/palette";
import { sunAltitude } from "@/lib/sun";
import { GOAL_WORDS } from "@/lib/tripProfile";
import { LAPSE_PER_M, baseSymbol, skyKind, weatherAt, weatherWords } from "@/lib/weather";
import type { WeatherForecast } from "@/lib/weather";
import { SKY_GREY, SUN_SHOWS, weatherIconSvg, weatherSkySvg } from "@/lib/weatherSky";
import type { TripProfile } from "@/lib/tripProfile";
import type { LatLng } from "@/lib/types";
import { hourOf } from "@/lib/zoned";
import { useLang, useT } from "@/lib/i18n";

const MIN = 60000;
const HOUR = 60 * MIN;
const W = 360;
const HOR = 146; // horizon line
const H = HOR + 50;
const RULER = HOR + 26;
const PAD = 8;
/** Knob size of the phone slider, px (.time-slider in globals.css). */
const SLIDER_KNOB = 36;
/** Zoomed in on a short trip, the dial still shows at least this many hours. */
const ZOOM_MIN_H = 6;
/** Walk lens: on a short trip the walk gets this share of the dial's width, the rides squeeze into the rest. */
const LENS_WALK = 0.66;
/** A short trip's dial shows at least this many hours. */
const LENS_MIN_H = 1.5;
/** A trip window wider than this share of the whole day shows the whole day. */
const ZOOM_UNDER = 0.7;
/** How long "Play" takes to run through the whole day, ms. */
const PLAY_MS = 10000;
/** Steps of the phone slider. */
const SLIDE = 1000;
// The picture is a sky, so it keeps its own day colours in dark mode too.
const INK = "#14233b";
const WALKER = "#1769d1";
// Even outlines under the markers (the same weight on the head, body and stick).
const EDGE = {
  walker: iconEdge(UI_ICON.walker),
  car: iconEdge(UI_ICON.car),
  bus: iconEdge(UI_ICON.bus),
  train: iconEdge(UI_ICON.train),
  dot: iconEdge(UI_ICON.dot),
};
// The white night car keeps its headlights: amber instead of the icon's white.
const CAR_AT_NIGHT = UI_ICON.car.replaceAll('fill="#fff"', 'fill="#f4a51c"');

const UNMARKED = UNMARKED_COLOUR;
const LATE = "#9a4a06";
/** The marking you are on as the readout says it ("po červenej"); unmarked is said plainly. */
const MARKING_SHORT: Record<string, string> = {
  [MARKING_COLOR.red]: MARKING_LABEL.red,
  [MARKING_COLOR.blue]: MARKING_LABEL.blue,
  [MARKING_COLOR.green]: MARKING_LABEL.green,
  [MARKING_COLOR.yellow]: MARKING_LABEL.yellow,
  [MARKING_COLOR.black]: MARKING_LABEL.black,
};

/** Sky colours by sun height (degrees): [height, top, horizon]. */
const SKY: [number, string, string][] = [
  [-12, "#141d36", "#1d2a52"],
  [-6, "#1d2b55", "#4b4677"],
  [-2, "#38497f", "#e9977a"],
  [2, "#8ea6d4", "#f8c48c"],
  [8, "#b0cdee", "#fcdcab"],
  [20, "#a9cbef", "#f3eedf"],
  [50, "#a2c7f0", "#e9f0f2"],
];

function mix(a: string, b: string, f: number): string {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const A = rgb(a);
  const B = rgb(b);
  return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * f).toString(16).padStart(2, "0")).join("");
}

function skyAt(alt: number): [string, string] {
  if (alt <= SKY[0][0]) return [SKY[0][1], SKY[0][2]];
  for (let i = 1; i < SKY.length; i++) {
    if (alt <= SKY[i][0]) {
      const f = (alt - SKY[i - 1][0]) / (SKY[i][0] - SKY[i - 1][0]);
      return [mix(SKY[i - 1][1], SKY[i][1], f), mix(SKY[i - 1][2], SKY[i][2], f)];
    }
  }
  const top = SKY[SKY.length - 1];
  return [top[1], top[2]];
}

const STARS = [[30, 30], [80, 58], [140, 22], [205, 48], [262, 26], [318, 62], [110, 90], [345, 34], [22, 96]];

interface Props {
  plan: DayPlan;
  profile: TripProfile | null;
  sun: LatLng;
  hasDrive: boolean;
  /** The ride there and back is by bus or train: a bus rides along instead of the car. */
  byBus?: boolean;
  /** By bus or train, the ride is a train (planned from the rail timetable). */
  byTrain?: boolean;
  /** Forecast at the trail start, asked for at the start's height; drawn into the sky when given. */
  weather?: WeatherForecast | null;
}

interface WalkPoint {
  t: number;
  x: number;
  y: number;
  ele: number;
  colour: string;
}

/**
 * The day as a picture: the sun's real path for this date and place arcs over
 * a timeline of the whole trip, and the walk is drawn as the trail's own
 * height profile. Hover (or drag on touch) to move through the day.
 */
export function SunArc({ plan, profile, sun, hasDrive, byBus = false, byTrain = false, weather = null }: Props) {
  // `t` is the moment on the dial here, so the translator is `tx`.
  const tx = useT();
  const lang = useLang();
  const svgRef = useRef<SVGSVGElement>(null);
  const [scrub, setScrub] = useState<number | null>(null);
  const [intro, setIntro] = useState<number | null>(null);
  const dragging = useRef(false);
  // "Play": the day runs by on its own, so the weather, the light and the climb can be watched change.
  const [playing, setPlaying] = useState(false);
  // Phone slider width, so its knob can sit exactly under the dial's time line.
  const sliderRef = useRef<HTMLInputElement>(null);
  const [sliderW, setSliderW] = useState(0);
  useEffect(() => {
    const el = sliderRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setSliderW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const first = plan.segments[0].start.getTime();
  const home = plan.segments[plan.segments.length - 1].end.getTime();
  const hs = plan.hikeStart.getTime();
  const he = plan.hikeEnd.getTime();
  const sunrise = plan.sunrise.getTime();
  const sunset = plan.sunset.getTime();
  const dusk = plan.dusk.getTime();

  const scene = useMemo(() => {
    const dayLo = Math.floor((Math.min(first, plan.dawn.getTime()) - 30 * MIN) / HOUR) * HOUR;
    const dayHi = Math.ceil((Math.max(home, dusk) + 30 * MIN) / HOUR) * HOUR;
    // A short trip was a sliver of the whole day: the dial then zooms in on the trip's hours
    // (Peter, 2026-10-24), at least ZOOM_MIN_H wide and never past dawn or dark.
    let lo = Math.floor((first - 45 * MIN) / HOUR) * HOUR;
    let hi = Math.ceil((home + 45 * MIN) / HOUR) * HOUR;
    while (hi - lo < ZOOM_MIN_H * HOUR && (lo > dayLo || hi < dayHi)) {
      if (lo > dayLo) lo -= HOUR;
      if (hi - lo < ZOOM_MIN_H * HOUR && hi < dayHi) hi += HOUR;
    }
    const whole = hi - lo > ZOOM_UNDER * (dayHi - dayLo);
    if (whole) [lo, hi] = [dayLo, dayHi];
    lo = Math.max(lo, dayLo);
    hi = Math.min(hi, dayHi);
    // Walk lens (Peter, 2026-11-02: short trips still looked bad): a short trip's walk takes most of
    // the width and the rides there and back squeeze into the edges, so the hill is always big.
    // The rides are only ever squeezed, never stretched.
    let lens = false;
    if (!whole && he > hs) {
      let llo = Math.min(hs, Math.floor((first - 15 * MIN) / (15 * MIN)) * 15 * MIN);
      let lhi = Math.max(he, Math.ceil((home + 15 * MIN) / (15 * MIN)) * 15 * MIN);
      // A very short walk still shows a little of the day around it.
      while (lhi - llo < LENS_MIN_H * HOUR) [llo, lhi] = [llo - 15 * MIN, lhi + 15 * MIN];
      [lo, hi] = [Math.max(llo, dayLo), Math.min(lhi, dayHi)];
      lens = (he - hs) / (hi - lo) < LENS_WALK;
    }
    const inner = W - 2 * PAD;
    const sideL = hs - lo;
    const sideR = hi - he;
    // Dial x at each knot: the window's ends and, with the lens, the walk's start and end.
    const knots: [number, number][] = lens
      ? [
          [lo, PAD],
          [hs, PAD + (1 - LENS_WALK) * inner * (sideL / (sideL + sideR || 1))],
          [he, W - PAD - (1 - LENS_WALK) * inner * (sideR / (sideL + sideR || 1))],
          [hi, W - PAD],
        ]
      : [
          [lo, PAD],
          [hi, W - PAD],
        ];
    const piece = (v: number, a: 0 | 1) => {
      let i = 1;
      while (i < knots.length - 1 && v > knots[i][a]) i++;
      const [p, q] = [knots[i - 1], knots[i]];
      const b = (1 - a) as 0 | 1;
      return p[b] + ((v - p[a]) / (q[a] - p[a] || 1)) * (q[b] - p[b]);
    };
    const x = (t: number) => piece(t, 0);
    /** The moment at dial x (the inverse of x). */
    const tAt = (px: number) => piece(px, 1);

    const points = profile?.points ?? [
      { ele: 0, at: 0, colour: null },
      { ele: 1, at: 0.5, colour: null },
      { ele: 0, at: 1, colour: null },
    ];
    const goalIndex = profile?.goalIndex ?? 1;
    const eles = points.map((p) => p.ele);
    const mn = Math.min(...eles);
    const mx = Math.max(...eles);
    // Capped so the walker on a summit stays below the sun at its highest, not inside its glow.
    const rise = Math.max(26, Math.min(84, ((mx - mn) / 1300) * 104));
    const walk: WalkPoint[] = points.map((p) => {
      const t = hs + p.at * (he - hs);
      return {
        t,
        x: x(t),
        y: HOR - ((p.ele - mn) / (mx - mn || 1)) * rise,
        ele: p.ele,
        colour: p.colour ? MARKING_COLOR[p.colour] : UNMARKED,
      };
    });

    // The arc always clears the hill; summer days still arc higher than winter ones.
    const altAt = (at: number) => sunAltitude(new Date(at), sun.lat, sun.lon);
    // Sunrise and sunset are when the sun's top edge meets the horizon (a little below 0°), so that
    // height is the ground line: the arc leaves and lands exactly on the sunrise and sunset dots.
    const h0 = (altAt(sunrise) + altAt(sunset)) / 2;
    const peak = altAt((sunrise + sunset) / 2);
    const arcH = Math.min(HOR - 10, Math.max(80, rise + 48) + 18 * Math.min(1, peak / 66));
    const y = (alt: number) => HOR - ((Math.max(alt, -3) - h0) / (peak - h0)) * arcH;
    // With the walk lens the arc is drawn on an even clock across the picture, not through the lens:
    // through it, two hours around noon (when the sun hardly climbs) were stretched over most of the
    // width and the rides squeezed beside them, so the arc became a flat table with sharp corners
    // (Peter, 2026-11-11). The sun glides along this arc above the time line (`sunY`); the walk, the
    // ruler and the sky colours keep the real times and heights.
    const tLin = (px: number) => lo + ((px - PAD) / inner) * (hi - lo);
    const arcX = lens ? (t: number) => PAD + ((t - lo) / (hi - lo)) * inner : x;
    const sunY = (px: number) => y(altAt(lens ? tLin(px) : tAt(px)));
    const arcPts: [number, number][] = [[arcX(sunrise), HOR]];
    for (let t = sunrise + 5 * MIN; t < sunset - 2 * MIN; t += 5 * MIN) arcPts.push([arcX(t), y(altAt(t))]);
    arcPts.push([arcX(sunset), HOR]);
    const arc = arcPts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join("");
    // Dashes sized so the line starts and ends with a dash on the dots, not a gap.
    let arcLen = 0;
    for (let i = 1; i < arcPts.length; i++) arcLen += Math.hypot(arcPts[i][0] - arcPts[i - 1][0], arcPts[i][1] - arcPts[i - 1][1]);
    const dash = arcLen / (2 * Math.max(1, Math.round(arcLen / 8)) + 1);

    let ridge = `M0,${HOR}`;
    for (let px = 0; px <= W; px += 6) {
      const ry = HOR - 7 - 5 * Math.sin(px / 23) - 3 * Math.sin(px / 9 + 1) - 4 * Math.sin(px / 61 + 2);
      ridge += `L${px},${ry.toFixed(1)}`;
    }
    ridge += `L${W},${HOR}Z`;

    const hill =
      `M${walk[0].x.toFixed(1)},${HOR}` +
      walk.map((p) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("") +
      `L${walk[walk.length - 1].x.toFixed(1)},${HOR}Z`;

    // The ruler: whole hours; with the lens a tick every quarter hour along the walk, a label every half
    // hour, and the departure and home times at the edges.
    const ticks: { t: number; major: boolean; text?: string; bold?: boolean }[] = [];
    if (lens || hi - lo <= 4 * HOUR) {
      const rides = first < hs || home > he;
      const near = (t: number) => rides && (Math.abs(x(t) - x(first)) < 30 || Math.abs(x(t) - x(home)) < 30);
      for (let t = Math.ceil((lens ? hs : lo) / (15 * MIN)) * 15 * MIN; t <= (lens ? he : hi); t += 15 * MIN) {
        const major = t % (30 * MIN) === 0;
        // No half-hour label crowding the departure and home times.
        ticks.push({ t, major, text: major && !near(t) ? formatTime(new Date(t)) : undefined });
      }
      if (rides) {
        ticks.push({ t: first, major: true, text: formatTime(new Date(first)), bold: true });
        ticks.push({ t: home, major: true, text: formatTime(new Date(home)), bold: true });
      }
    } else {
      const every = hi - lo <= 9 * HOUR ? 1 : 3;
      for (let t = lo; t <= hi; t += HOUR) {
        const major = hourOf(t) % every === 0;
        ticks.push({ t, major, text: major ? `${hourOf(t)}:00` : undefined });
      }
    }
    // Where the lens changes scale: a small break mark on the ruler.
    const breaks = lens ? [hs, he].filter((t) => t > first && t < home).map((t) => x(t)) : [];

    // Season: hill colour, snow on the top, trees or flowers on the ground away from the hill.
    const season = seasonOf(new Date(hs));
    const r = seeded(5);
    const hillL = walk[0].x - 14;
    const hillR = walk[walk.length - 1].x + 14;
    const spots: [number, number][] = [];
    for (let i = 0; i < 16; i++) {
      const sx0 = PAD + r() * (W - 2 * PAD);
      if (sx0 > hillL && sx0 < hillR) continue;
      spots.push([sx0, HOR + 1 + r() * 2]);
    }
    const deco = seasonDetails(season, r, (i) => spots[i], spots.length);
    const snow = season === "zima" ? snowSvg(W, HOR, 9, 20) : "";
    const topY = Math.min(...walk.map((p) => p.y));
    const capY = topY + (HOR - topY) * 0.28;
    // The snow line: tongues of snow reaching down the gullies and rock showing between them,
    // softly rounded (Peter, 2026-10-22: a straight cut looked unlike a mountain).
    const cr = seeded(9);
    const pts: [number, number][] = [];
    for (let cx = W; cx > 0; ) {
      pts.push([cx, capY + (cr() < 0.5 ? 1 : -1) * (2 + cr() * 6) + (cr() < 0.25 ? 5 : 0)]);
      cx -= 9 + cr() * 9;
    }
    pts.push([0, capY]);
    // A smooth curve through the points (Catmull-Rom), so the edge has no sharp corners.
    let capEdge = `M0,0 H${W} V${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const [a, b, c, d] = [pts[Math.max(0, i - 1)], pts[i], pts[i + 1], pts[Math.min(pts.length - 1, i + 2)]];
      const c1 = [b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6];
      const c2 = [c[0] - (d[0] - b[0]) / 6, c[1] - (d[1] - b[1]) / 6];
      capEdge += ` C${c1.map((v) => v.toFixed(1)).join(",")} ${c2.map((v) => v.toFixed(1)).join(",")} ${c[0].toFixed(1)},${c[1].toFixed(1)}`;
    }
    capEdge += " Z";

    const sky = weather ? weatherSkySvg(weather, lo, hi, x, HOR, (at) => sunAltitude(new Date(at), sun.lat, sun.lon) < -3) : null;

    // The added stops: where on the hill the walk stands still, and when.
    const pauses = (profile?.pauses ?? []).map((pa) => {
      const t0 = hs + pa.from * (he - hs);
      const t1 = hs + pa.to * (he - hs);
      const i = Math.max(0, walk.findIndex((p) => p.t >= t0));
      return { t0, t1, name: pa.name, kind: pa.kind, icon: pa.icon, x: x((t0 + t1) / 2), x0: x(t0), x1: x(t1), y: walk[i].y };
    });

    return { lo, hi, x, tAt, y, arcX, sunY, walk, pauses, sky, goal: walk[goalIndex], goalT: walk[goalIndex].t, arc, dash, ridge, hill, ticks, breaks, season, deco, snow, capY, capEdge };
  }, [first, home, hs, he, sunrise, sunset, dusk, plan.dawn, profile, sun.lat, sun.lon, weather]);
  const land = LAND[scene.season];
  const sunR = 8.5 * land.sunScale;

  const ok = plan.verdict === "ok" || plan.verdict === "close";
  const restT = ok ? scene.goalT : Math.max(hs, he - 10 * MIN);

  // One sweep from departure to the resting point when the picture first appears.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const from = first;
    const to = restT;
    const t0 = performance.now();
    let raf = requestAnimationFrame(function step(now) {
      const f = Math.min(1, (now - t0) / 2400);
      const eased = 1 - Math.pow(1 - f, 3);
      setIntro(f < 1 ? from + (to - from) * eased : null);
      if (f < 1) raf = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(raf);
    // Only on first appearance, not on every change of departure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!playing) return;
    // The whole day in about ten seconds; from where the dial stands, or from the start once it reached the end.
    const span = scene.hi - scene.lo;
    const at = scrubRef.current ?? restT;
    let from = at >= scene.hi - span / 50 ? scene.lo : at;
    let last = performance.now();
    let raf = requestAnimationFrame(function step(now) {
      from = Math.min(scene.hi, from + ((now - last) / PLAY_MS) * span);
      last = now;
      setScrub(from);
      if (from < scene.hi) raf = requestAnimationFrame(step);
      else setPlaying(false);
    });
    return () => cancelAnimationFrame(raf);
    // Started and stopped by the button; the scene stays put while it plays.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);
  const scrubRef = useRef(scrub);
  scrubRef.current = scrub;
  // Any touch on the dial takes over from the playing day.
  const take = (at: number | null) => {
    setPlaying(false);
    setScrub(at);
  };

  const t = Math.max(scene.lo, Math.min(scene.hi, scrub ?? intro ?? restT));
  // The day map above follows this moment with its walker (lib/dayClock.ts).
  useEffect(() => publishDayMoment(t), [t]);
  useEffect(() => () => publishDayMoment(null), []);
  const alt = sunAltitude(new Date(t), sun.lat, sun.lon);
  // The weather at this moment greys the sky and dims the sun.
  const now = weather ? weatherAt(weather, t) : null;
  const kind = skyKind(now?.symbol ?? null);
  let [skyTop, skyBottom] = skyAt(alt);
  // Only a light tint: the sky keeps its blue so the neutral grey clouds stand out against it.
  const grey = (kind ? SKY_GREY[kind] ?? 0 : 0) * 0.3;
  if (grey && alt > -4) {
    skyTop = mix(skyTop, kind === "thunder" ? "#7c8698" : "#b8c2cf", grey);
    skyBottom = mix(skyBottom, "#d5dbe3", grey);
  }
  const sunShows = kind ? SUN_SHOWS[kind] ?? 1 : 1;
  const sx = scene.x(t);
  // The slider spans the dial's full width, but its knob centre can only travel
  // from half a knob in on each side. Give it the times found at those two
  // points of the picture so the knob and the time line always line up.
  // The slider runs 0..SLIDE over the knob's travel; each step is the time under that point of the
  // picture, so it follows the walk lens too.
  const knob = SLIDER_KNOB / 2;
  const travel = sliderW > 2 * knob ? sliderW - 2 * knob : 0;
  const slideX = (v: number) => (travel ? ((knob + (v / SLIDE) * travel) / sliderW) * W : PAD + (v / SLIDE) * (W - 2 * PAD));
  const slideLo = Math.max(scene.lo, scene.tAt(slideX(0)));
  const slideHi = Math.min(scene.hi, scene.tAt(slideX(SLIDE)));
  const slideOf = (at: number) => {
    const px = scene.x(Math.max(slideLo, Math.min(slideHi, at)));
    const v = travel ? ((px / W) * sliderW - knob) / travel : (px - PAD) / (W - 2 * PAD);
    return Math.round(Math.max(0, Math.min(1, v)) * SLIDE);
  };
  // On the drawn arc right above the time line (with the walk lens that is not quite the height at t).
  const sy = scene.sunY(sx);

  const onTrail = t >= hs && t <= he;
  // In the dark sky the car turns light.
  const night = alt < -2;
  const inCar = hasDrive && ((t >= first && t < hs) || (t > he && t < home));
  let walker: [number, number] = [sx, HOR];
  let climbed = 0;
  let height: number | null = null;
  // The trail marking under the walker at this moment.
  let markColour: string | null = null;
  if (onTrail) {
    const w = scene.walk;
    const i = Math.max(1, w.findIndex((p) => p.t >= t));
    const f = (t - w[i - 1].t) / (w[i].t - w[i - 1].t || 1);
    walker = [w[i - 1].x + (w[i].x - w[i - 1].x) * f, w[i - 1].y + (w[i].y - w[i - 1].y) * f];
    markColour = w[i].colour;
    if (profile) {
      const ele = w[i - 1].ele + (w[i].ele - w[i - 1].ele) * f;
      climbed = ele - w[0].ele;
      height = ele > 0 ? Math.round(ele) : null;
    }
  }
  // On the trail it is colder the higher you are.
  // With the walker right in front of the sun, its glow and white ring would sit round the head like a halo.
  const behindWalker = onTrail && Math.hypot(sx - walker[0], sy - (walker[1] - 18)) < sunR + 18;
  const temp = now ? Math.round(now.temp - climbed * LAPSE_PER_M) : null;
  // Height on the trail at that moment (Peter: see how it changes along the route): the number in the readout, "m n. m." small after it.
  const heightText = height === null ? null : height.toLocaleString(lang === "en" ? "en-GB" : "sk-SK");
  // The trail sign you are on: a small KST mark (white, colour, white) and its word.
  const markText = markColour ? tx(MARKING_SHORT[markColour] ?? "bez značky") : null;

  // Standing at an added stop: the walker shows as that place's pin.
  const atPause = onTrail ? scene.pauses.find((pa) => pa.kind && t >= pa.t0 && t <= pa.t1) : undefined;
  const marker = onTrail ? "walker" : inCar ? (byBus ? (byTrain ? "train" : "bus") : "car") : "dot";
  const goalWords = profile ? GOAL_WORDS[profile.goalKind] : null;
  const what =
    t < first || t >= home
      ? tx("Doma")
      : t < hs
        ? byBus
          ? byTrain
            ? tx("Cesta vlakom")
            : tx("Cesta autobusom")
          : tx("Cesta autom")
        : t > he
          ? tx("Cesta domov")
          : scene.pauses.some((pa) => t >= pa.t0 && t <= pa.t1)
            ? `${tx("Zastávka")}: ${tx(scene.pauses.find((pa) => t >= pa.t0 && t <= pa.t1)!.name)}`
            : Math.abs(t - scene.goalT) < 6 * MIN && goalWords
            ? `${tx(goalWords.at)}: ${profile!.goalName}`
            : t < scene.goalT
              ? tx("Cesta tam")
              : profile?.loop
                ? tx("Okruh späť")
                : tx("Cesta späť");

  const sunNote =
    t < sunrise ? (
      <>{tx("slnko vyjde o {time}", { time: formatTime(plan.sunrise) })}</>
    ) : t < sunset ? (
      <>
        {tx("do západu slnka")}
        <br />
        <strong>{formatDuration(Math.round((sunset - t) / MIN))}</strong>
      </>
    ) : t < dusk ? (
      <>
        {tx("po západe, šero")}
        <br />
        {tx("tma o {time}", { time: formatTime(plan.dusk) })}
      </>
    ) : (
      <>{tx("tma")}</>
    );

  const timeAt = (clientX: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    const vx = ((clientX - r.left) / r.width) * W;
    return scene.tAt(vx);
  };
  const onMove = (e: ReactPointerEvent) => {
    if (dragging.current) take(timeAt(e.clientX));
    // A mouse just passing over does not stop a playing day (it is on its way to the button).
    else if (e.pointerType === "mouse" && !playing) setScrub(timeAt(e.clientX));
  };
  const timeAtRef = useRef(timeAt);
  timeAtRef.current = timeAt;

  // Phones: a sideways finger moves through the day, an upward one scrolls the page. Pointer events
  // alone lose the drag when the browser reads a slightly slanted swipe as scrolling, so touches
  // decide the direction themselves and keep the page still once the drag is sideways.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    let x0 = 0;
    let y0 = 0;
    let sideways: boolean | null = null;
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1) return (sideways = false);
      x0 = e.touches[0].clientX;
      y0 = e.touches[0].clientY;
      sideways = null;
    };
    const move = (e: TouchEvent) => {
      if (e.touches.length !== 1 || sideways === false) return;
      const { clientX, clientY } = e.touches[0];
      if (sideways === null) {
        const dx = Math.abs(clientX - x0);
        const dy = Math.abs(clientY - y0);
        if (dx < 5 && dy < 5) return;
        sideways = dx >= dy * 0.7;
        if (!sideways) return;
      }
      if (e.cancelable) e.preventDefault();
      setPlaying(false);
      setScrub(timeAtRef.current(clientX));
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
    };
  }, []);

  // Ids unique per dial: on /ulozene every card would otherwise paint the first card's sky.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const skyId = `sunarc-sky-${uid}`;
  const capId = `sunarc-cap-${uid}`;
  const label = (x: number) => Math.max(34, Math.min(W - 34, x));
  const ground = "Figtree, system-ui, sans-serif";

  return (
    <div
      className="touch-pan-y select-none [-webkit-touch-callout:none]"
      onPointerMove={onMove}
      onPointerLeave={(e) => e.pointerType === "mouse" && !playing && setScrub(null)}
    >
      <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full cursor-ew-resize touch-pan-y"
        // A slider for keyboards and screen readers: arrows move through the day, the time and what happens are read out.
        role="slider"
        aria-label={tx("Priebeh dňa. Slnko vychádza o {rise} a zapadá o {set}. Túra od {from} do {to}.", { rise: formatTime(plan.sunrise), set: formatTime(plan.sunset), from: formatTime(plan.hikeStart), to: formatTime(plan.hikeEnd) })}
        aria-valuemin={slideLo}
        aria-valuemax={slideHi}
        aria-valuenow={Math.max(slideLo, Math.min(slideHi, t))}
        aria-valuetext={`${formatTime(new Date(t))}, ${what}`}
        tabIndex={0}
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          take(timeAt(e.clientX));
        }}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          take(t + (e.key === "ArrowRight" ? 10 : -10) * MIN);
        }}
      >
        <defs>
          <linearGradient id={skyId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={skyTop} />
            <stop offset="1" stopColor={skyBottom} />
          </linearGradient>
        </defs>
        <rect x={0} y={0} width={W} height={HOR + 1} fill={`url(#${skyId})`} />
        <g opacity={alt < -4 ? Math.min(1, (-4 - alt) / 4) : 0}>
          {STARS.map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r={1.1} fill="#fff" />
          ))}
        </g>
        {/* Constant markup from lib/season.ts. */}
        <g dangerouslySetInnerHTML={{ __html: scene.snow }} />
        {scene.sky && <g dangerouslySetInnerHTML={{ __html: scene.sky.back }} />}
        <path d={scene.ridge} fill="#6d7fa6" opacity={0.18} />
        <clipPath id={capId}>
          <path d={scene.capEdge} />
        </clipPath>
        <path d={scene.hill} fill={land.hill} />
        {(scene.season === "zima" || scene.season === "jar") && <path d={scene.hill} fill="#fff" clipPath={`url(#${capId})`} />}
        <rect x={0} y={HOR} width={W} height={H - HOR} fill="var(--card-bg)" />
        <rect x={0} y={HOR} width={W} height={9} fill={land.front} />
        <g dangerouslySetInnerHTML={{ __html: scene.deco }} />

        {hasDrive &&
          [
            [first, hs],
            [he, home],
          ]
            // No way back known (no train back that day): no return pill.
            .filter(([a, b]) => b > a)
            .map(([a, b]) => {
            const x1 = scene.x(a);
            const x2 = scene.x(b);
            const mid = (x1 + x2) / 2;
            return (
              <g key={a}>
                <rect x={x1} y={HOR - 1} width={Math.max(0, x2 - x1)} height={8} rx={4} fill={INK} stroke="#fff" strokeWidth={1} />
                <line x1={x1 + 4} x2={x2 - 4} y1={HOR + 3} y2={HOR + 3} stroke="#fff" strokeWidth={1.2} strokeDasharray="4 3.5" opacity={0.9} />
                {x2 - x1 > 30 && (
                  <g transform={`translate(${mid} ${HOR + 19})`} fill="var(--foreground)" style={{ color: "var(--foreground)" }}>
                    <g transform="translate(-27 -9) scale(.62)" dangerouslySetInnerHTML={{ __html: byTrain ? UI_ICON.train : byBus ? UI_ICON.bus : UI_ICON.car }} />
                    <text x={-11} y={2.5} fontSize={13.5} fontWeight={700} className="font-data">
                      {formatDurationShort(Math.round((b - a) / MIN))}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

        <path
          d={"M" + scene.walk.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("L")}
          fill="none"
          stroke="#fff"
          strokeWidth={4.6}
          strokeLinejoin="round"
        />
        {scene.walk.slice(1).map((p, i) => {
          const prev = scene.walk[i];
          const late = p.t > sunset;
          return (
            <line
              key={i}
              x1={prev.x}
              y1={prev.y}
              x2={p.x}
              y2={p.y}
              stroke={late ? LATE : p.colour}
              strokeWidth={2.6}
              strokeLinecap="round"
              strokeDasharray={late ? "3 2" : undefined}
            />
          );
        })}

        {/* Added stops: the time spent there cut out of the walk in the place's colour, its map pin above
            (Peter, 2026-10-24 and 2026-10-26). While the walker is there, the walker turns into the pin. */}
        {scene.pauses.map((pa) => {
          const c = pa.kind ? POI_COLOUR[pa.kind] : WALKER;
          // At least a few pixels wide, so a short stop on a long day still shows.
          const half = Math.max(3, (pa.x1 - pa.x0) / 2);
          return (
            <g key={pa.t0}>
              <line x1={pa.x - half} x2={pa.x + half} y1={pa.y} y2={pa.y} stroke="#fff" strokeWidth={8} strokeLinecap="round" />
              <line x1={pa.x - half} x2={pa.x + half} y1={pa.y} y2={pa.y} stroke={c} strokeWidth={5} strokeLinecap="round" />
              {pa.kind && pa !== atPause && (
                <g transform={`translate(${pa.x} ${pa.y - 17})`}>
                  <line y1={7} y2={12} stroke={c} strokeWidth={2.2} />
                  {/* A faint dark rim keeps the white edge visible on a pale sky or snow. */}
                  <circle r={9.6} fill={INK} opacity={0.3} />
                  <circle r={8.4} fill={c} stroke="#fff" strokeWidth={1.6} />
                  {/* Constant markup from lib/kindIcons.ts, no user data. */}
                  <g transform="translate(-5.5 -5.5) scale(0.46)" color="#fff" dangerouslySetInnerHTML={{ __html: KIND_ICON[pa.icon ?? pa.kind] }} />
                </g>
              )}
            </g>
          );
        })}

        {/* The moment shown: a slim line from the sky down to the hour ruler. */}
        <line x1={sx} x2={sx} y1={4} y2={RULER} stroke={INK} strokeWidth={1} opacity={0.45} />
        <path d={scene.arc} fill="none" stroke="#fff" strokeWidth={4} strokeLinecap="round" opacity={0.75} />
        <path d={scene.arc} fill="none" stroke="#e08a00" strokeWidth={1.7} strokeDasharray={`${scene.dash.toFixed(2)} ${scene.dash.toFixed(2)}`} strokeLinecap="round" />
        <g transform={`translate(${sx} ${sy})`} opacity={alt > -1 ? sunShows : 0}>
          {!behindWalker && <circle r={sunR + 8} fill="#ffd36b" opacity={0.45} />}
          {!behindWalker && <circle r={sunR + 2} fill="#fff" opacity={0.9} />}
          <circle r={sunR} fill={land.sun} />
          {scene.season === "leto" &&
            Array.from({ length: 10 }, (_, i) => {
              const a = (i * Math.PI) / 5;
              return (
                <line key={i} x1={Math.cos(a) * (sunR + 3)} y1={Math.sin(a) * (sunR + 3)} x2={Math.cos(a) * (sunR + 8)} y2={Math.sin(a) * (sunR + 8)} stroke="#ffaa00" strokeWidth={2} strokeLinecap="round" />
              );
            })}
        </g>
        {scene.sky && <g dangerouslySetInnerHTML={{ __html: scene.sky.front }} />}

        {profile && (
          <g>
            <line x1={scene.goal.x} x2={scene.goal.x} y1={scene.goal.y} y2={scene.goal.y - 13} stroke="#17213a" strokeWidth={1.2} />
            <path d={`M${scene.goal.x},${scene.goal.y - 13}l8,3l-8,3z`} fill="#f4a51c" />
            <text
              x={label(scene.goal.x)}
              y={scene.goal.y - 18 - (onTrail && Math.abs(walker[0] - scene.goal.x) < 40 ? 18 : 0)}
              textAnchor="middle"
              fontSize={11}
              fontWeight={700}
              fill="#fff"
              stroke="#17213a"
              strokeWidth={3}
              paintOrder="stroke"
              fontFamily={ground}
            >
              {profile.goalName} ~{formatTime(new Date(scene.goalT))}
            </text>
          </g>
        )}

        {[
          [sunrise, "východ"],
          [sunset, "západ"],
        ]
          // Zoomed in on a short trip, sunrise or sunset can lie outside the picture.
          .filter(([at]) => +at >= scene.lo && +at <= scene.hi)
          .map(([at, word]) => (
          <g key={word}>
            <circle cx={scene.arcX(+at)} cy={HOR} r={2.6} fill="#f4a51c" stroke="#fff" />
            <text
              x={label(scene.arcX(+at))}
              y={HOR - 7}
              textAnchor="middle"
              fontSize={11}
              fontWeight={700}
              fill="#9a4a06"
              stroke="#fff"
              strokeWidth={3}
              strokeOpacity={0.85}
              paintOrder="stroke"
              fontFamily={ground}
            >
              {tx(word as string)} {formatTime(new Date(+at))}
            </text>
          </g>
        ))}

        <line x1={PAD} x2={W - PAD} y1={RULER} y2={RULER} stroke="var(--muted)" strokeWidth={0.8} opacity={0.6} />
        {scene.ticks.map((tk) => {
          const x = scene.x(tk.t);
          return (
            <g key={tk.t}>
              <line x1={x} x2={x} y1={RULER} y2={RULER + (tk.major ? 5 : 3)} stroke="var(--muted)" />
              {tk.text && (
                <text
                  x={x}
                  y={RULER + 17}
                  textAnchor={x > W - 22 ? "end" : x < 22 ? "start" : "middle"}
                  fontSize={12}
                  fontWeight={tk.bold ? 700 : 600}
                  fill={tk.bold ? "var(--foreground)" : "var(--muted)"}
                  className="font-data"
                >
                  {tk.text}
                </text>
              )}
            </g>
          );
        })}
        {scene.breaks.map((bx) => (
          <path key={bx} d={`M${bx - 4},${RULER + 4}l4,-8M${bx},${RULER + 4}l4,-8`} fill="none" stroke="var(--muted)" strokeWidth={1.3} />
        ))}

        {/* Who is where: the car on the road, the walker on the trail (the place's pin at a stop), a dot at home. */}
        {atPause?.kind ? (
          <g transform={`translate(${walker[0]} ${walker[1] - 13})`}>
            <circle r={11.2} fill={INK} opacity={0.3} />
            <circle r={10} fill={POI_COLOUR[atPause.kind]} stroke="#fff" strokeWidth={1.8} />
            {/* Constant markup from lib/kindIcons.ts, no user data. */}
            <g transform="translate(-6.6 -6.6) scale(0.55)" color="#fff" dangerouslySetInnerHTML={{ __html: KIND_ICON[atPause.icon ?? atPause.kind] }} />
          </g>
        ) : (
        <g transform={`translate(${onTrail ? walker[0] : sx} ${onTrail ? walker[1] - 12 : inCar ? HOR - 11 : HOR + 3}) translate(-12.5 -12.5) scale(1.04)`}>
          {/* A thin even edge keeps the marker apart from what is behind it: white around the blue walker
              (a dark one made him hard to read on phones) and the dark car by day, dark around the white car at night. */}
          <g style={{ color: !onTrail && night ? INK : "#fff" }} dangerouslySetInnerHTML={{ __html: EDGE[marker] }} />
          <g
            style={{ color: onTrail ? WALKER : night ? "#fff" : INK }}
            dangerouslySetInnerHTML={{ __html: night && marker === "car" ? CAR_AT_NIGHT : UI_ICON[marker] }}
          />
        </g>
        )}

        <g transform={`translate(${W - 8} 8)`}>
          <rect x={-50} y={0} width={50} height={22} rx={11} fill="#fff" opacity={0.92} />
          <text x={-25} y={16} textAnchor="middle" fontSize={16} fontWeight={700} fill="#14233b" className="font-data">
            {formatTime(new Date(t))}
          </text>
        </g>
      </svg>
      <button
        type="button"
        onClick={() => setPlaying((p) => !p)}
        aria-pressed={playing}
        aria-label={playing ? tx("Zastaviť") : tx("Prehrať celý deň")}
        title={playing ? tx("Zastaviť") : tx("Prehrať celý deň")}
        className="absolute top-[2.2%] left-[2.2%] inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-[#14233b] shadow-sm focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      >
        {/* Just the sign, so it hides as little of the sky and weather as it can. */}
        <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
          {playing ? <path d="M4 3h3v10H4zM9 3h3v10H9z" fill="currentColor" /> : <path d="M5 2.5v11l9-5.5z" fill="currentColor" />}
        </svg>
      </button>
      </div>

      {/* Phones: a plain slider right under the picture, easier to hit with a thumb. Computers point with the mouse. */}
      <div className="-mt-1 pb-1 sm:hidden">
        <input
          ref={sliderRef}
          type="range"
          min={0}
          max={SLIDE}
          step={1}
          value={slideOf(t)}
          onChange={(e) => take(scene.tAt(slideX(Number(e.target.value))))}
          className="time-slider"
          aria-label={tx("Čas počas dňa")}
          aria-valuetext={formatTime(new Date(t))}
        />
      </div>

      {/* What the colours mean (Peter, 2026-10-26: "make it obvious what each one means"): only what this day's picture shows. */}
      <ul className="flex flex-wrap gap-x-3 gap-y-1 px-4 pb-2 text-[11.5px] text-[var(--muted)]" aria-label={tx("Vysvetlivky")}>
        {/* The trail colours are named under the day map above (components/DayMapLegend.tsx). */}
        {scene.walk.some((p) => p.t > sunset) && (
          <li className="inline-flex items-center gap-1.5">
            <svg width="16" height="6" aria-hidden="true"><line x1="1.5" x2="14.5" y1="3" y2="3" stroke={LATE} strokeWidth="2.6" strokeDasharray="3 2" /></svg>
            {tx("po západe slnka")}
          </li>
        )}
        {hasDrive && (
          <li className="inline-flex items-center gap-1.5">
            <svg width="16" height="8" aria-hidden="true"><rect x="0.5" y="0.5" width="15" height="7" rx="3.5" fill={INK} stroke="var(--foreground)" strokeWidth="1" /></svg>
            {tx(byTrain ? "vo vlaku" : byBus ? "v autobuse" : "v aute")}
          </li>
        )}
        <li className="inline-flex items-center gap-1.5">
          <svg width="16" height="6" aria-hidden="true"><line x1="1.5" x2="14.5" y1="3" y2="3" stroke="#e08a00" strokeWidth="1.7" strokeDasharray="2.5 2.5" /></svg>
          {tx("dráha slnka")}
        </li>
      </ul>

      <div className="flex justify-between gap-3 border-t border-[var(--border)] px-4 pt-2.5 pb-3.5 text-sm">
        <div className="min-w-0">
          <div className="font-data text-[22px] leading-none">{formatTime(new Date(t))}</div>
          <div className="truncate font-semibold">{what}</div>
          {/* Height and trail sign at that moment, only on the walk (while driving the line stays, empty). Always exactly one
              line, never wrapping (Peter, 2026-11-11: "neznačený chodník" wrapped to two lines and the readout jumped each time
              the trail went from marked to unmarked and back). */}
          <div className="flex h-[19px] min-w-0 flex-nowrap items-center gap-x-3 overflow-hidden text-[13px] text-[var(--muted)]">
          {onTrail && (heightText || markText) && (
            <>
              {heightText && (
                <span className="shrink-0 whitespace-nowrap">
                  <span className="font-data text-[14px] font-semibold text-[var(--foreground)]">{heightText}</span> {tx("m n. m.")}
                </span>
              )}
              {markText && markColour && (
                <span className="inline-flex min-w-0 items-center gap-1 whitespace-nowrap">
                  {/* The trail mark as painted on the trees: white band, colour stripe, white band, thin dark edge. */}
                  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="shrink-0">
                    <rect x="0.5" y="0.5" width="11" height="11" rx="2" fill="#fff" stroke={INK} strokeWidth="1" />
                    <rect x="1" y="4" width="10" height="4" fill={markColour} />
                  </svg>
                  <span className="truncate">{markText}</span>
                </span>
              )}
            </>
          )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5 text-right text-[13px] whitespace-nowrap text-[var(--muted)]">
          {now && (
            // One line always: icon, word and the temperature at that moment (higher up the trail it is colder).
            <span className="inline-flex items-center gap-1 font-semibold whitespace-nowrap text-[var(--foreground)]">
              {kind && <svg viewBox="0 0 22 22" className="h-[18px] w-[22px]" aria-hidden="true" dangerouslySetInnerHTML={{ __html: weatherIconSvg(kind) }} />}
              {kind && <>{weatherWords(baseSymbol(now.symbol!), lang).split(" (")[0]}</>}
              {temp !== null && (
                <span>
                  <span className="font-data">{temp}</span> °C
                </span>
              )}
            </span>
          )}
          <div>{sunNote}</div>
        </div>
      </div>
    </div>
  );
}
