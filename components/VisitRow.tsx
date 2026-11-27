"use client";

import { useEffect, useMemo, useState } from "react";
import { confirmPlanVisit } from "@/lib/confirmPlanVisit";
import { track } from "@/lib/analytics";
import { shortDate } from "@/lib/days";
import { useLang, useT } from "@/lib/i18n";
import { useMyStars } from "@/lib/reviewed";
import { useSavedTrips } from "@/lib/savedTrips";
import { useTripSettings } from "@/lib/tripSettings";
import type { DestinationKind, GeoPoint, RouteBrief } from "@/lib/tripSchema";
import { addVisitByHand, fillPlace, routeTrip, useVisits, visitsAt } from "@/lib/visits";
import type { RouteWalk } from "@/lib/walkFacts";
import { whenLabel } from "@/lib/visitWhen";
import { ReviewSheet } from "@/components/ReviewSheet";
import type { RoutePickData } from "@/components/RoutePick";
import { VisitMark } from "@/components/VisitMark";
import { VisitSheet } from "@/components/VisitSheet";
import { VisitsSheet } from "@/components/VisitsSheet";

const focus = "focus-visible:outline-2 focus-visible:outline-[var(--accent)]";
const rowClass = "flex min-h-10 items-center gap-2 text-[14.5px]";
/** The slim card of the row, between the plan card and "Navigácia a zdieľanie"; `VisitLink` scrolls here. */
export const VISIT_CARD_ID = "navstevy";
const card =
  "scroll-mt-[calc(64px+env(safe-area-inset-top))] rounded-[var(--radius-card)] border border-[var(--card-edge)] bg-[var(--card-bg)] px-4 py-2.5 shadow-[var(--shadow-card)] lg:scroll-mt-3";
const textLink = `-my-2 -mr-2 shrink-0 py-2 pr-2 pl-1 text-sm font-bold text-[var(--accent)] underline underline-offset-[3px] ${focus}`;

type Open = "ask" | "hand" | "list" | "review" | null;

/**
 * What the visited row and the line that points to it (VisitLink) both go by: the saved plan of this page, the
 * visits of this place, and whether to ask about a plan whose day has passed. `today` is "" until known.
 */
export function useVisitState(slug: string, place: string, routes: string[]) {
  const { trips, patch } = useSavedTrips();
  const { visits } = useVisits();
  const { today } = useTripSettings();
  const saved = trips.find((x) => x.slug === slug);
  const mine = visitsAt(visits, place, routes);
  const ask = !!today && !!saved && !saved.doneAt && !saved.skipAsk && saved.date < today;
  return { trips, patch, today, saved, mine, ask };
}

/**
 * The visited row, its own slim card between the plan card and "Navigácia a zdieľanie" (Peter, 27 Nov 2026; the
 * line at the old place is VisitLink): asks about a plan whose day has passed, shows the visits of this place, or
 * offers "Boli sme tu" by hand. At a place with several routes (`briefs`) the window also asks which route was
 * walked. The card is part of this component so that nothing, not even an empty frame, shows before `today` is known.
 */
export function VisitRow({
  slug,
  name,
  place,
  route,
  routes,
  briefs,
  walks,
  goal,
}: {
  slug: string;
  name: string;
  place: string;
  /** The route of the page on screen. */
  route: string;
  /** The trip slugs of the place's routes (no loops). */
  routes: string[];
  /** The place's routes as step 1 lists them, loops included; one or none at a place with a single route. */
  briefs: RouteBrief[];
  walks: Record<string, RouteWalk>;
  goal: { kind: DestinationKind; name: string; location: GeoPoint };
}) {
  const { trips, patch, today, saved, mine, ask } = useVisitState(slug, place, routes);
  const reviewedMap = useMyStars();
  const t = useT();
  const lang = useLang();
  const [open, setOpen] = useState<Open>(null);
  const routesKey = routes.join("|");

  useEffect(() => {
    fillPlace(place, routes);
    // routes is stable per page (keyed by its contents).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place, routesKey]);

  const pick = useMemo<RoutePickData | undefined>(() => (briefs.length > 1 ? { routes: briefs, walks, current: route, goal } : undefined), [briefs, walks, route, goal]);
  // A review is about one route: the one of the latest visit when it is known, else this page's.
  const walked = mine.length ? routeTrip(mine[0].route) : "";
  const reviewSlug = walked && routes.includes(walked) ? walked : slug;
  const reviewed = !!trips.find((x) => x.slug === reviewSlug)?.reviewed || reviewedMap[reviewSlug] !== undefined;
  const close = () => setOpen(null);

  const dialogs = (
    <>
      {open === "ask" && saved && (
        <VisitSheet name={name} slug={slug} plan={{ date: saved.date }} reviewed={reviewed} onSave={(date) => confirmPlanVisit(saved, date, patch, "ask")} onClose={close} />
      )}
      {open === "hand" && (
        <VisitSheet
          name={name}
          slug={slug}
          reviewed={reviewed}
          pick={pick}
          onSave={(date, picked) => {
            addVisitByHand({ slug: place, route: picked ?? route, name, date });
            track("trip_done", { trail: slug, how: "page" });
          }}
          onClose={close}
        />
      )}
      {open === "list" && <VisitsSheet visits={mine} name={name} slug={slug} place={place} route={route} pick={pick} reviewSlug={reviewSlug} reviewed={reviewed} onClose={close} />}
      {open === "review" && (
        <ReviewSheet
          slug={reviewSlug}
          name={name}
          onDone={(sent) => {
            if (sent && trips.some((x) => x.slug === reviewSlug)) patch(reviewSlug, { reviewed: true });
            close();
          }}
        />
      )}
    </>
  );

  if (!today) return null;

  if (ask && saved) {
    return (
      <>
        <section id={VISIT_CARD_ID} aria-label={t("Vaše návštevy")} data-nosnippet className={card}>
          <p className={rowClass}>
            <VisitMark done={false} />
            {/* The answers sit beside the question, not at the card's far edge (Peter, 26 Nov 2026). */}
            <span className="mr-1 min-w-0">
              <b>{t("Boli ste tu")}</b> <span className="font-data whitespace-nowrap text-[17px]">{shortDate(saved.date, lang)}</span>?
            </span>
            <button type="button" onClick={() => setOpen("ask")} className={`min-h-10 shrink-0 rounded-full bg-[var(--accent)] px-4 text-sm font-bold text-[var(--accent-contrast)] ${focus}`}>
              {t("Áno")}
            </button>
            <button type="button" onClick={() => patch(slug, { skipAsk: true })} className={`min-h-10 shrink-0 rounded-full border border-[var(--border)] px-4 text-sm font-semibold ${focus}`}>
              {t("Nie")}
            </button>
          </p>
        </section>
        {dialogs}
      </>
    );
  }

  if (mine.length > 0) {
    const latest = mine[0];
    const dated = latest.date !== "";
    const rate = mine.length === 1 && !reviewed;
    return (
      <>
        <section id={VISIT_CARD_ID} aria-label={t("Vaše návštevy")} data-nosnippet className={card}>
          <p className={rowClass}>
            <button type="button" aria-label={t("Vaše návštevy")} onClick={() => setOpen("list")} className={`flex min-h-10 min-w-0 flex-1 items-center gap-2 text-left ${focus}`}>
              <VisitMark done />
              {/* Two pieces that never break inside: on a narrow phone "naposledy" and its date go to the second line together. */}
              <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
                <span className="whitespace-nowrap">
                  <b>{t("Boli ste tu")}</b>
                  {mine.length > 1 && <span className="font-data text-[17px]"> {mine.length}×</span>}
                  {mine.length > 1 && dated && ","}
                </span>
                {dated && (
                  <span className="whitespace-nowrap">
                    {mine.length > 1 && `${t("naposledy")} `}
                    <span className="font-data text-[17px]">{whenLabel(latest.date, lang)}</span>
                  </span>
                )}
              </span>
            </button>
            <button type="button" onClick={() => setOpen(rate ? "review" : "list")} className={textLink}>
              {rate ? t("Ohodnotiť") : t("Upraviť")}
            </button>
          </p>
        </section>
        {dialogs}
      </>
    );
  }

  return (
    <>
      <section id={VISIT_CARD_ID} aria-label={t("Vaše návštevy")} data-nosnippet className={card}>
          <p className={rowClass}>
          {/* One control, the answer right beside its question (Peter, 26 Nov 2026: at the card's far edge the
              button "has no connection to the text"). The circle and the question open the window too. */}
          <button type="button" onClick={() => setOpen("hand")} className={`group flex min-h-10 items-center gap-2 rounded-full text-left ${focus}`}>
            <VisitMark done={false} />
            <span>{t("Už ste tu boli?")}</span>
            <span className="ml-1 grid min-h-10 shrink-0 place-items-center rounded-full border border-[var(--accent)] px-4 text-sm font-bold text-[var(--accent)] group-hover:bg-[var(--accent-soft)]">
              {t("Boli sme tu")}
            </span>
          </button>
        </p>
      </section>
      {dialogs}
    </>
  );
}
