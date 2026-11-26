"use client";

import { useEffect, useMemo, useState } from "react";
import { GOAL_LABEL } from "@/lib/format";
import { useLang, useT } from "@/lib/i18n";
import { kindSvg } from "@/lib/kindIcons";
import { GOAL_COLOUR } from "@/lib/palette";
import { photoFocus } from "@/lib/photoFocus";
import { useMyStars } from "@/lib/reviewed";
import { useSavedTrips } from "@/lib/savedTrips";
import type { DestinationKind, GeoPoint, RouteBrief } from "@/lib/tripSchema";
import { byYear, visitedPlaces } from "@/lib/visitedList";
import type { VisitedPlace } from "@/lib/visitedList";
import { fillPlace, routeTrip, useVisits } from "@/lib/visits";
import { parseWhen, whenLabel } from "@/lib/visitWhen";
import { MyStars } from "@/components/MyStars";
import { ReviewSheet } from "@/components/ReviewSheet";
import type { RoutePickData } from "@/components/RoutePick";
import { useThumb } from "@/components/TripCard";
import { UiIcon } from "@/components/UiIcon";
import { VisitsSheet } from "@/components/VisitsSheet";

const focus = "focus-visible:outline-2 focus-visible:outline-[var(--accent)]";
const LOOP = "/okruh";
const NO_WALKS = {};

/** What the list needs of a trip's own file (public/data/trips/<slug>.json). */
interface TripFile {
  slug: string;
  name: string;
  variant_of?: string;
  destination: { name: string; kind: DestinationKind; location: GeoPoint };
  routes?: RouteBrief[];
}

/** "gone": the trip is no longer offered (its file is not there). "unknown": it could not be asked (no signal). */
type Info = { state: "ok"; trip: TripFile } | { state: "gone" } | { state: "unknown" };

const asked = new Map<string, Promise<Info>>();

function tripInfo(slug: string): Promise<Info> {
  let p = asked.get(slug);
  if (!p) {
    p = fetch(`/data/trips/${slug}.json`)
      .then(async (r): Promise<Info> => {
        if (r.status === 404) return { state: "gone" };
        if (!r.ok) throw new Error(String(r.status));
        return { state: "ok", trip: (await r.json()) as TripFile };
      })
      .catch((): Info => {
        // Asked again the next time the list is shown.
        asked.delete(slug);
        return { state: "unknown" };
      });
    asked.set(slug, p);
  }
  return p;
}

/** Each listed place's own trip, loaded when the list shows (a visitor has a handful of them, about 15 kB each). */
function useTripInfos(keys: string[]): Record<string, Info> {
  const [infos, setInfos] = useState<Record<string, Info>>({});
  const all = keys.join("|");
  useEffect(() => {
    let live = true;
    for (const key of keys) {
      tripInfo(key).then((info) => {
        if (!live) return;
        setInfos((prev) => (prev[key]?.state === info.state ? prev : { ...prev, [key]: info }));
        // A visit from a plan saved before visits existed learns its place here, as on the trip's page.
        if (info.state === "ok") fillPlace(info.trip.variant_of ?? info.trip.slug, routeSlugs(info.trip));
      });
    }
    return () => {
      live = false;
    };
    // keys is new on every render; its contents are in `all`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all]);
  return infos;
}

/** The trip slugs of a place's routes (no loops), as the trip page gives them to its visited row. */
const routeSlugs = (trip: TripFile): string[] => (trip.routes?.length ? trip.routes.map((r) => r.slug).filter((s) => !s.endsWith(LOOP)) : [trip.slug]);

/**
 * "Navštívené" in Moje výlety (Peter, 25 Nov 2026, C213; before: "Absolvované", the saved trips marked done):
 * every place the visitor has been to, from the visits, under the year of the latest one. A row opens the
 * place's "Vaše návštevy": fix or remove a visit, rate, plan the trip again. The stars are the visitor's own.
 */
export function VisitedList() {
  const { visits } = useVisits();
  const { trips, patch } = useSavedTrips();
  const stars = useMyStars();
  const t = useT();
  const places = useMemo(() => visitedPlaces(visits), [visits]);
  const infos = useTripInfos(places.map((p) => p.key));
  const [open, setOpen] = useState<string | null>(null);
  const [rating, setRating] = useState<string | null>(null);
  // A place whose last visit was removed is not open any more: it must not come back by itself, window and all,
  // when the place is visited again (the list itself is gone while there is no visit, so the window cannot say so).
  if (open && !places.some((p) => p.key === open)) setOpen(null);
  if (rating && !places.some((p) => p.key === rating)) setRating(null);

  if (places.length === 0) return null;

  const rows = places.map((place) => {
    const info = infos[place.key];
    const trip = info?.state === "ok" ? info.trip : null;
    const routes = trip ? routeSlugs(trip) : [place.key];
    const latest = place.visits[0];
    // A review is about one route: the one of the latest visit when it is known, else the place's main one.
    const walked = latest.route ? routeTrip(latest.route) : "";
    const reviewSlug = walked && (!trip || routes.includes(walked)) ? walked : place.key;
    const mine: number | undefined = stars[reviewSlug];
    const reviewed = mine !== undefined || !!trips.find((x) => x.slug === reviewSlug)?.reviewed;
    return { place, trip, gone: info?.state === "gone", name: trip?.name ?? latest.name, reviewSlug, mine, reviewed };
  });
  const row = (key: string | null) => rows.find((r) => r.place.key === key);
  const opened = row(open);
  const rated = row(rating);

  let pick: RoutePickData | undefined;
  if (opened?.trip?.routes && opened.trip.routes.length > 1) {
    const { trip, place } = opened;
    const last = place.visits.find((v) => v.route)?.route;
    pick = { routes: trip.routes!, walks: NO_WALKS, current: last ?? trip.slug, goal: trip.destination };
  }

  return (
    <section data-visited-list className="flex flex-col gap-3 pt-2">
      <h2 className="text-base font-bold">
        {t("Navštívené")} <span className="font-semibold text-[var(--muted)]">· {places.length}</span>
      </h2>
      {byYear(places).map((section) => (
        <div key={section.year ?? "none"} className="flex flex-col gap-1.5">
          <h3 className="px-1 text-[12px] font-bold tracking-wide text-[var(--muted)] uppercase">
            {section.year ?? t("Kedysi")} · {section.places.length}
          </h3>
          <ul className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card-bg)]">
            {section.places.map((p) => {
              const r = row(p.key)!;
              return <PlaceRow key={p.key} place={p} name={r.name} kind={r.trip?.destination.kind ?? null} gone={r.gone} mine={r.mine} reviewed={r.reviewed} onOpen={() => setOpen(p.key)} onRate={() => setRating(p.key)} />;
            })}
          </ul>
        </div>
      ))}
      {opened && (
        <VisitsSheet
          visits={opened.place.visits}
          name={opened.name}
          slug={opened.place.key}
          place={opened.trip?.variant_of ?? opened.place.key}
          route={opened.place.key}
          pick={pick}
          reviewSlug={opened.reviewSlug}
          reviewed={opened.reviewed}
          canAdd={!!opened.trip}
          gone={opened.gone}
          openHref={opened.gone ? undefined : `/trasa/${opened.place.key}`}
          onClose={() => setOpen(null)}
        />
      )}
      {rated && (
        <ReviewSheet
          slug={rated.reviewSlug}
          name={rated.name}
          onDone={(sent) => {
            if (sent && trips.some((x) => x.slug === rated.reviewSlug)) patch(rated.reviewSlug, { reviewed: true });
            setRating(null);
          }}
        />
      )}
    </section>
  );
}

function PlaceRow({
  place,
  name,
  kind,
  gone,
  mine,
  reviewed,
  onOpen,
  onRate,
}: {
  place: VisitedPlace;
  name: string;
  /** Null until the trip's own data is there, and for a trip no longer offered. */
  kind: DestinationKind | null;
  gone: boolean;
  /** The visitor's stars; undefined when they did not rate, or when the stars of an old review are not known yet. */
  mine: number | undefined;
  reviewed: boolean;
  onOpen: () => void;
  onRate: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const thumb = useThumb(place.key);
  const latest = place.visits[0];
  const dated = parseWhen(latest.date).kind !== "unknown";
  const colour = kind ? GOAL_COLOUR[kind] : "var(--neutral-bg)";
  return (
    <li className="flex items-center gap-1 border-t border-[var(--border)] pr-1.5 first:border-t-0">
      <button type="button" onClick={onOpen} className={`flex min-h-[60px] min-w-0 flex-1 items-center gap-3 py-2 pl-3 text-left outline-offset-[-2px] ${focus}`}>
        <span aria-hidden className={`relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-[12px] ${kind ? "text-white" : "text-[var(--muted)]"} ${gone ? "opacity-60 grayscale" : ""}`} style={{ background: colour }}>
          {thumb && !gone ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="" loading="lazy" decoding="async" crossOrigin="anonymous" referrerPolicy="no-referrer" style={{ objectPosition: photoFocus(thumb) }} className="h-full w-full object-cover" />
          ) : kind ? (
            // Constant markup from lib/kindIcons.ts, no user data.
            <span className="grid" dangerouslySetInnerHTML={{ __html: kindSvg(kind, 22) }} />
          ) : (
            <UiIcon name="check" size={18} />
          )}
        </span>
        <span className="flex min-w-0 flex-col leading-snug">
          <b className={`truncate text-[15px] ${gone ? "text-[var(--muted)]" : ""}`}>{name}</b>
          <span className="text-[13px] text-[var(--muted)]">
            {kind && !gone && `${t(GOAL_LABEL[kind])} · `}
            {dated ? <span className="font-data text-[15px] text-[var(--foreground)]">{whenLabel(latest.date, lang)}</span> : whenLabel(latest.date, lang)}
            {place.visits.length > 1 && (
              <>
                {" · "}
                <span className="font-data text-[15px]">{place.visits.length}×</span>
              </>
            )}
            {gone && ` · ${t("už nie je v ponuke")}`}
          </span>
        </span>
      </button>
      {gone ? null : mine !== undefined ? (
        // How the visitor rated it, never the word "ohodnotené" (Peter, 26 Nov 2026); a tap opens the rating again.
        <button type="button" onClick={onRate} aria-label={t("Vaše hodnotenie: {n} z 5. Zmeniť.", { n: mine })} className={`grid min-h-10 shrink-0 place-items-center rounded-lg px-1.5 ${focus}`}>
          <MyStars stars={mine} />
        </button>
      ) : reviewed ? null : (
        <button type="button" onClick={onRate} className={`min-h-9 shrink-0 rounded-full border border-[var(--accent)] px-3 text-[13px] font-bold text-[var(--accent)] hover:bg-[var(--accent-soft)] ${focus}`}>
          {t("Ohodnotiť")}
        </button>
      )}
      <button type="button" tabIndex={-1} aria-hidden="true" onClick={onOpen} className="grid h-10 w-7 shrink-0 place-items-center text-[var(--muted)]">
        <UiIcon name="chev" size={18} />
      </button>
    </li>
  );
}
