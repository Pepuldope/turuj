"use client";

import { transitMinutes } from "@/lib/drive";
import { useEffect, useState } from "react";
import { EARLIEST_DEPARTURE_HOUR } from "@/lib/days";
import type { DayFit } from "@/lib/days";
import { DIFFICULTY_LABEL, GOAL_LABEL, formatDurationShort, formatFromUser, formatTime, stopLabel } from "@/lib/format";
import { kindSvg } from "@/lib/kindIcons";
import { GOAL_COLOUR } from "@/lib/palette";
import { formatKm } from "@/lib/walkFacts";
import type { Difficulty, ParkingLot, TrailDetail, TransitStop } from "@/lib/types";
import { useTripSettings } from "@/lib/tripSettings";
import { UiIcon } from "@/components/UiIcon";
import { CARD_SCENES, FRONT_HILL } from "@/lib/cardScenes";
import type { DestinationKind } from "@/lib/tripSchema";
import { LangLink, useLang } from "@/lib/i18n";
import { regionIn, tr } from "@/lib/lang";
import type { Lang } from "@/lib/lang";

export interface TripCardItem {
  detail: TrailDetail;
  /** Walking time for this group (kids pace applied), from the parking or stop as the trip page counts it (lib/walkFacts.ts). */
  hikeMin: number;
  /** The walk of a clearly shorter route to the same place (kids pace applied); null when there is none. */
  shortMin: number | null;
  /** Listed through an easier route to the same place (a difficulty filter): that route's difficulty. */
  easierRoute?: Difficulty | null;
  /** ...its length and climb. */
  walkM: number;
  ascentM: number;
  /** One-way drive used for the plan; null by train/bus or when unknown. */
  driveMin: number | null;
  /** One-way drive for display, also shown when travelling by train/bus. */
  carMin: number | null;
  /** The drive is a straight-line estimate (routing unavailable). */
  driveApprox: boolean;
  driveLoading: boolean;
  /** Straight-line metres to the trailhead; null without a start. */
  distanceM: number | null;
  /** Only when a day is picked. */
  fit: DayFit | null;
  /** A closure (e.g. TANAP winter) covers the picked day. */
  closed: boolean;
  /** By train/bus: the stop the walk starts from. */
  stop: TransitStop | null;
  /** The nearest stop, whatever the travel choice. */
  nearStop: TransitStop | null;
  /** By train/bus, and no stop near the start. */
  noStop: boolean;
}

interface Props {
  item: TripCardItem;
  /** "dnes", "v sobotu": for the "doesn't fit" line. */
  dayWord: string | null;
  /** Travelling by train/bus: its line is the one in focus. */
  transit: boolean;
  active: boolean;
  /** Picked on the map (computer): a bigger card with a few more facts, closed with ✕. */
  onClose?: () => void;
  onActive: (slug: string) => void;
  registerItem: (slug: string, el: HTMLElement | null) => void;
}

/** Leaving within this long counts as "tesne" (amber). */
const TIGHT_MIN = 90;

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type Pill = { tone: "ok" | "tight" | "no" | "closed"; text: string; time?: string };

function pillFor(item: TripCardItem, dayWord: string | null, lang: Lang): Pill | null {
  const { fit, closed, driveMin, stop } = item;
  const t = (sk: string, vars?: Record<string, string | number>) => tr(lang, sk, vars);
  const day = capitalize(dayWord ?? t("v tento deň"));
  const isToday = dayWord === "dnes" || dayWord === "today";
  if (closed) return { tone: "closed", text: t("{Day} je chodník uzavretý", { Day: day }) };
  if (!fit) return null;
  if (fit.status === "too-late") return { tone: "no", text: isToday ? t("Dnes už nestihnete · skúste zajtra") : t("Vtedy už nestihnete · skúste zajtra") };
  if (fit.status === "too-early") return { tone: "no", text: t("{Day} by ste museli vyraziť pred {h}:00", { Day: day, h: EARLIEST_DEPARTURE_HOUR }) };
  if (fit.status === "too-long") return { tone: "no", text: t("{Day} je na to málo svetla", { Day: day }) };
  const verb = t(driveMin !== null ? "vyraziť najneskôr" : stop ? "na zastávke najneskôr" : "začať najneskôr");
  const tight = isToday && fit.latest.getTime() - Date.now() < TIGHT_MIN * 60000;
  return tight
    ? { tone: "tight", text: `${t("Tesne")} · ${verb}`, time: formatTime(fit.latest) }
    : { tone: "ok", text: capitalize(verb), time: formatTime(fit.latest) };
}

const PILL_CLASS = {
  ok: "bg-[var(--ok-bg)] text-[var(--ok)]",
  tight: "bg-[var(--warn-bg)] text-[var(--warn)]",
  no: "bg-[var(--neutral-bg)] text-[var(--muted)]",
  // A closure by law, in the closures' red: not the grey of "not today".
  closed: "bg-[var(--danger-bg)] text-[var(--danger)]",
};

/** The list card's picture strip fades out over its last 16 px on an eased curve (a mask, so it works on any card colour, dark mode too). */
const STRIP_FADE =
  "linear-gradient(to right, #000 calc(100% - 16px), rgba(0,0,0,.82) calc(100% - 12px), rgba(0,0,0,.5) calc(100% - 7px), rgba(0,0,0,.18) calc(100% - 3px), transparent)";

/** The card strip for a trip without a photo: two hill tones mixed from the kind colour, and the kind's icon centred in front. */
function NoPhotoScene({ goal, colour }: { goal: DestinationKind; colour: string }) {
  const scene = CARD_SCENES[goal] ?? CARD_SCENES.ine;
  const back = { fill: `color-mix(in srgb, #fff 15%, ${colour})` };
  const front = { fill: `color-mix(in srgb, #fff 30%, ${colour})` };
  return (
    <>
      <svg viewBox="0 0 96 150" preserveAspectRatio="xMidYMax slice" aria-hidden className="absolute inset-0 h-full w-full">
        <path d={scene.back} fillRule={scene.backEvenOdd ? "evenodd" : undefined} style={back} />
        {scene.water && <path d={scene.water} style={front} />}
        <path d={scene.front ?? FRONT_HILL} fillRule={scene.frontEvenOdd ? "evenodd" : undefined} style={front} />
      </svg>
      {/* Constant markup from lib/kindIcons.ts, no user data. */}
      <span className="absolute top-1/2 left-0 grid w-[90px] -translate-y-1/2 place-items-center text-white" dangerouslySetInnerHTML={{ __html: kindSvg(goal, 30) }} />
    </>
  );
}

let thumbsP: Promise<Record<string, string>> | null = null;

/** Card photos by trip slug (scripts/photo-thumbs.mjs), loaded once for every card. */
function useThumb(slug: string): string | null {
  const [thumbs, setThumbs] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    let live = true;
    thumbsP ??= fetch("/data/photo-thumbs.json")
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => {
        thumbsP = null;
        return {};
      });
    thumbsP.then((t) => live && setThumbs(t));
    return () => {
      live = false;
    };
  }, []);
  return thumbs?.[slug] ?? null;
}

/** One trip: what it is, how long to get there and walk, and when to leave. */
export function TripCard({ item, dayWord, transit, active, onClose, onActive, registerItem }: Props) {
  const { detail, hikeMin, carMin, driveMin, driveApprox, driveLoading, distanceM, nearStop } = item;
  const { withKids } = useTripSettings();
  const lang = useLang();
  const t = (sk: string, vars?: Record<string, string | number>) => tr(lang, sk, vars);
  const thumb = useThumb(item.detail.trail.slug);
  const { trail } = detail;
  const goal = trail.goal ?? "ine";
  const colour = GOAL_COLOUR[goal];
  // No stop near this one: shown by car even when planning by bus (its trip page plans it so too).
  const byBus = transit && !item.noStop;
  const approx = driveApprox || byBus ? "~" : "";
  const pill = pillFor(item, dayWord, lang);
  const dim = (pill?.tone === "no" || pill?.tone === "closed") && onClose === undefined;
  const km = formatKm(item.walkM, lang);
  // A stop up the trail counts from where its walk meets the trail, as on the trip page.
  const stopWalkM = nearStop ? (nearStop.join?.walk_m ?? nearStop.distance_m) : 0;
  const total = driveMin !== null && !item.fit ? hikeMin + 2 * driveMin : null;
  const big = onClose !== undefined;
  const th = detail.trailheads.find((t) => t.is_primary) ?? detail.trailheads[0];
  const parking = detail.parkingLots[0];
  // List cards: a leave-by time (fits / tight) sits small on the right of the two time lines (Peter, 16 Nov: as the last
  // line it left the right half empty; the earlier big box made the card messy). "Doesn't fit" and closures are
  // sentences and keep their line below.
  const sidePill = !big && pill?.time !== undefined;
  // "autom / busom / pešo" for screen readers only: shown on screen they made the card a line taller (Peter, 15 Nov).
  const word = "sr-only";
  const leg = (on: boolean) => `inline-flex items-center gap-1 ${on ? "text-[var(--foreground)]" : "text-[var(--muted)]"}`;

  return (
    <LangLink
      ref={(el) => registerItem(trail.slug, el)}
      href={`/trasa/${trail.slug}`}
      onMouseEnter={() => onActive(trail.slug)}
      onFocus={() => onActive(trail.slug)}
      className={`relative grid ${big ? "grid-cols-[64px_minmax(0,1fr)]" : "grid-cols-[84px_minmax(0,1fr)]"} gap-3 overflow-hidden rounded-[var(--radius-card)] border bg-[var(--card-bg)] p-3 transition-colors hover:border-[var(--accent)] focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
        big ? "border-2 border-[var(--accent)] shadow-[0_10px_28px_rgba(20,35,59,0.22)]" : active ? "trip-card-active border-[var(--accent)]" : "border-[var(--border)]"
      }`}
    >
      {/* Picked on the map and closed that day: the warning comes first, above the title (Peter, 8 Nov). */}
      {big && pill?.tone === "closed" && (
        <span className={`col-span-2 -mt-0.5 flex items-start gap-1.5 rounded-xl px-2.5 py-1.5 text-[13.5px] font-semibold ${PILL_CLASS.closed}`}>
          <UiIcon name="warn" size={15} className="mt-0.5" />
          {pill.text}
        </span>
      )}
      {!big ? (
        // List cards: the picture runs the card's full height down the left edge, as wide as the old square
        // plus its padding, and fades out on the right into the card (Peter, 15 Nov). The grid keeps a spacer column.
        <>
          <span
            aria-hidden
            className={`absolute inset-y-0 left-0 w-[96px] ${dim ? "opacity-50 grayscale-[75%]" : ""}`}
            style={{ background: colour, maskImage: STRIP_FADE, WebkitMaskImage: STRIP_FADE }}
          >
            {thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumb} alt="" loading="lazy" decoding="async" crossOrigin="anonymous" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
            ) : (
              // No photo: the kind's colour and icon in front of quiet hills whose outline hints at the kind (Peter, 15 Nov).
              <NoPhotoScene goal={goal} colour={colour} />
            )}
          </span>
          {thumb && (
            <span
              aria-hidden
              className={`absolute bottom-2 left-2 grid h-[22px] w-[22px] place-items-center rounded-[7px] text-white shadow-[0_0_0_1.5px_#fff] ${dim ? "opacity-50 grayscale-[75%]" : ""}`}
              style={{ background: colour }}
              dangerouslySetInnerHTML={{ __html: kindSvg(goal, 15) }}
            />
          )}
          <span aria-hidden />
        </>
      ) : thumb ? (
        // A photo of the place in place of the kind icon (Peter, 2026-10-22); the kind sits on it as a small badge.
        <span aria-hidden className={`relative h-[64px] w-[64px] overflow-hidden rounded-[14px] ${dim ? "opacity-50 grayscale-[75%]" : ""}`} style={{ background: colour }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumb} alt={trail.name} loading="lazy" decoding="async" crossOrigin="anonymous" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
          <span
            className="absolute bottom-1 left-1 grid h-[22px] w-[22px] place-items-center rounded-[7px] text-white shadow-[0_0_0_1.5px_#fff]"
            style={{ background: colour }}
            dangerouslySetInnerHTML={{ __html: kindSvg(goal, 15) }}
          />
        </span>
      ) : (
        <span
          aria-hidden
          // A trip that doesn't work that day fades its icon and title only: the pill saying why keeps full contrast.
          className={`grid h-[64px] w-[64px] place-items-center rounded-[14px] text-white ${dim ? "opacity-50 grayscale-[75%]" : ""}`}
          style={{ background: colour }}
          // Constant markup from lib/kindIcons.ts, no user data.
          dangerouslySetInnerHTML={{ __html: kindSvg(goal, 30) }}
        />
      )}
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex items-baseline justify-between gap-2">
          <span data-trip-name className={`leading-tight font-bold ${big ? "text-xl" : "text-base"} ${dim ? "text-[var(--muted)]" : ""}`}>{trail.name}</span>
          {big ? (
            <button
              type="button"
              aria-label={t("Zavrieť")}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClose();
              }}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--segment-bg)] text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              <UiIcon name="close" size={12} />
            </button>
          ) : (
            <span className="shrink-0 text-xs font-semibold text-[var(--muted)]">{t(DIFFICULTY_LABEL[trail.difficulty]).toLowerCase()}</span>
          )}
        </span>
        {/* One row, always (A11, Peter 2026-10-27): a long region gives way with "…" so "aj pre deti" never wraps the card taller. */}
        <span className="flex items-center gap-x-1.5 text-[12.5px] whitespace-nowrap text-[var(--muted)]">
          {/* The kind as a filled chip: with a photo in place of the icon it must read on its own (Peter, 2026-10-22). */}
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-px text-[11.5px] font-bold text-white" style={{ background: `color-mix(in oklab, ${colour} 88%, black)` }}>
            <span aria-hidden className="inline-flex" dangerouslySetInnerHTML={{ __html: kindSvg(goal, 12) }} />
            {t(GOAL_LABEL[goal])}
          </span>
          {/* Under 360 px there is no room left for it: rather none than a lone "…". */}
          {/* List cards leave the region to the map and the trip page: one column, less to read (Peter, 16 Nov). */}
          {big && trail.region_name && <span className="min-w-0 truncate max-[359px]:hidden">· {regionIn(lang, trail.region_name)}</span>}
          {big && <span className="shrink-0">· {km}</span>}
          {/* With kids on, every card listed is kid-friendly: the tag would say nothing. */}
          {trail.family_friendly && !withKids && <span className="on-card-ok shrink-0 font-semibold text-[var(--ok)]">· {t("aj pre deti")}</span>}
        </span>
        {/* Two lines (Peter, 15 Nov): getting there by car / bus, then the walk itself; the leave-by time small beside them. */}
        <span className="flex items-center gap-2">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-data flex flex-wrap items-center gap-x-2 text-[15px] leading-[1.2]">
          <span className={leg(!byBus)}>
            <UiIcon name="car" size={15} />
            {carMin !== null ? `${driveApprox ? "~" : ""}${formatDurationShort(carMin)}` : driveLoading ? "…" : distanceM !== null ? formatFromUser(distanceM, lang) : "–"}
            {carMin !== null && <small className={word}>{t("autom")}</small>}
          </span>
          <span aria-hidden className="font-sans text-[var(--muted)]">·</span>
          <span className={leg(byBus)} title={nearStop ? t("Zastávka {stop}, {m} k trase", { stop: stopLabel(nearStop.name), m: formatFromUser(stopWalkM, lang) }) : t("Bez zastávky pri štarte")}>
            <UiIcon name="bus" size={15} />
            {/* By car too, the bus as a time (muted), never the walk from the stop: "350 m" read as minutes next to the car's time (Peter, 2026-10-23). */}
            {byBus && driveMin !== null
              ? `~${formatDurationShort(driveMin)}`
              : nearStop && carMin !== null
                ? `~${formatDurationShort(transitMinutes(carMin))}`
                : nearStop
                  ? // No start yet: no time to show, and the stop's metres read as the trip's (Peter, 2026-10-26).
                    driveLoading ? "…" : ""
                  : "–"}
            {nearStop && (byBus ? driveMin !== null : carMin !== null) && <small className={word}>{t("busom")}</small>}
          </span>
        </span>
        <span className="font-data flex flex-wrap items-center gap-x-3 text-[15px] leading-[1.2]">
          {/* Each piece stays whole; on a narrow phone the line breaks between them. */}
          <span className="inline-flex min-w-0 flex-wrap items-center gap-x-1 text-[var(--foreground)]">
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <span className="font-sans text-[12px] font-semibold text-[var(--muted)]">{t("túra")}:</span>
              <UiIcon name="boot" size={15} />
              {formatDurationShort(hikeMin)}
            </span>
            <small className={word}>{t("pešo")}</small>
            {withKids && (
              <span className="text-[var(--warn)]" title={t("S deťmi: čas na trase o 30 % dlhší")}>
                <UiIcon name="kid" size={14} />
              </span>
            )}
            {/* A long main route hid a short way up (Peter, 2026-10-23: "4 hours scares people"). */}
            {item.shortMin !== null && (
              <span className="whitespace-nowrap text-[var(--muted)]" title={t("Kratšia cesta k tomu istému cieľu, na stránke výletu")}>
                · {t("kratšia {t}", { t: formatDurationShort(item.shortMin) })}
              </span>
            )}
          </span>
          {item.easierRoute && (
            <span className="font-sans text-[12.5px] text-[var(--muted)]" title={t("Ľahšia cesta k tomu istému cieľu, na stránke výletu")}>
              {t("aj {d} cesta", { d: t(DIFFICULTY_LABEL[item.easierRoute]).toLowerCase() })}
            </span>
          )}
          {total !== null && (
            <span className="text-[var(--muted)]">
              {t("spolu")} {approx}
              {formatDurationShort(total)}
            </span>
          )}
        </span>
        </span>
        {sidePill && pill?.time && (
          <span
            title={t("Najneskôr, kedy treba vyraziť, aby ste boli späť za svetla")}
            className={`flex w-[64px] shrink-0 flex-col items-center rounded-lg px-1 py-1 text-center ${PILL_CLASS[pill.tone]}`}
          >
            <span className="text-[10.5px] leading-tight font-semibold">{pill.text}</span>
            <span className="font-data text-[17px] leading-tight font-bold">{pill.time}</span>
          </span>
        )}
        </span>
        {big && (
          <>
            <span className="mt-1.5 grid grid-cols-4 gap-1.5 border-y border-[var(--border)] py-2.5">
              {[
                ["chôdza", formatDurationShort(hikeMin)],
                ["dĺžka", km],
                ["stúpanie", `${item.ascentM} m`],
                ["náročnosť", t(DIFFICULTY_LABEL[trail.difficulty]).toLowerCase()],
              ].map(([label, value]) => (
                <span key={label} className="flex flex-col">
                  <span className="text-[11.5px] text-[var(--muted)]">{t(label)}</span>
                  <span className={label === "náročnosť" ? "text-[15px] font-bold" : "font-data text-[17px] leading-tight font-bold"}>{value}</span>
                </span>
              ))}
            </span>
            <span className="flex flex-col gap-0.5 text-[13.5px]">
              {th && <span>{t("Štart: {name}", { name: th.name })}</span>}
              {parking && <span>{t("Parkovanie {where}", { where: parkingWhere(parking, lang) })}</span>}
              {nearStop && <span>{t("Zastávka {stop}, {m} pešo k trase", { stop: stopLabel(nearStop.name), m: formatFromUser(stopWalkM, lang) })}</span>}
            </span>
          </>
        )}
        {pill && !sidePill && !(big && pill.tone === "closed") && (
          <span
            title={pill.time ? t("Najneskôr, kedy treba vyraziť, aby ste boli späť za svetla") : undefined}
            className={`mt-0.5 inline-flex items-baseline gap-1.5 self-start rounded-full px-2.5 py-1 text-[12.5px] font-semibold whitespace-nowrap ${PILL_CLASS[pill.tone]}`}
          >
            {pill.tone === "closed" && <UiIcon name="warn" size={13} className="self-center" />}
            {pill.text}
            {pill.time && <span className="font-data text-[17px] leading-none font-bold">{pill.time}</span>}
          </span>
        )}
        {big && (
          <span className="mt-1.5 flex h-11 items-center justify-center rounded-xl bg-[var(--accent)] font-bold text-[var(--accent-contrast)]">{t("Otvoriť výlet")}</span>
        )}
      </span>
    </LangLink>
  );
}

/** Where the parking is, as the trip page counts the walk: a parking up the trail is beside it. */
function parkingWhere(p: ParkingLot, lang: Lang): string {
  const m = p.join?.walk_m ?? p.walk_m;
  if (m < 150) return tr(lang, p.join ? "pri trase" : "pri štarte");
  return tr(lang, p.join ? "{m} k trase" : "{m} od štartu", { m: formatFromUser(m, lang) });
}
