"use client";

import { useEffect, useState } from "react";
import { confirmPlanVisit } from "@/lib/confirmPlanVisit";
import { track } from "@/lib/analytics";
import { shortDate } from "@/lib/days";
import { useLang, useT } from "@/lib/i18n";
import { useReviewed } from "@/lib/reviewed";
import { useSavedTrips } from "@/lib/savedTrips";
import { useTripSettings } from "@/lib/tripSettings";
import { addVisitByHand, fillPlace, useVisits, visitsAt } from "@/lib/visits";
import { whenLabel } from "@/lib/visitWhen";
import { ReviewSheet } from "@/components/ReviewSheet";
import { VisitMark } from "@/components/VisitMark";
import { VisitSheet } from "@/components/VisitSheet";
import { VisitsSheet } from "@/components/VisitsSheet";

const focus = "focus-visible:outline-2 focus-visible:outline-[var(--accent)]";
const rowClass = "mt-1 flex min-h-10 items-center gap-2 border-t border-[var(--border)] pt-3 text-[14.5px]";
const textLink = `-my-2 -mr-2 shrink-0 py-2 pr-2 pl-1 text-sm font-bold text-[var(--accent)] underline underline-offset-[3px] ${focus}`;

type Open = "ask" | "hand" | "list" | "review" | null;

/**
 * The visited row at the bottom of the trip page's first card (Peter, 25 Nov 2026): asks about a plan whose day
 * has passed, shows the visits of this place, or offers "Boli sme tu" by hand.
 */
export function VisitRow({ slug, name, place, route, routes, single }: { slug: string; name: string; place: string; route: string; routes: string[]; single: boolean }) {
  const { trips, patch } = useSavedTrips();
  const { visits } = useVisits();
  const reviewedMap = useReviewed();
  const { today } = useTripSettings();
  const t = useT();
  const lang = useLang();
  const [open, setOpen] = useState<Open>(null);
  const routesKey = routes.join("|");

  useEffect(() => {
    fillPlace(place, routes);
    // routes is stable per page (keyed by its contents).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place, routesKey]);

  const saved = trips.find((x) => x.slug === slug);
  const reviewed = !!saved?.reviewed || reviewedMap[slug] !== undefined;
  const mine = visitsAt(visits, place, routes);
  const ask = !!today && !!saved && !saved.doneAt && !saved.skipAsk && saved.date < today;
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
          onSave={(date) => {
            addVisitByHand({ slug: place, route, name, date });
            track("trip_done", { trail: slug, how: "page" });
          }}
          onClose={close}
        />
      )}
      {open === "list" && <VisitsSheet visits={mine} name={name} slug={slug} place={place} route={route} single={single} reviewed={reviewed} onClose={close} />}
      {open === "review" && (
        <ReviewSheet
          slug={slug}
          name={name}
          onDone={(sent) => {
            if (sent && saved) patch(slug, { reviewed: true });
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
        <p className={rowClass}>
          <VisitMark done={false} />
          <span className="min-w-0 flex-1">
            <b>{t("Boli ste tu")}</b> <span className="font-data whitespace-nowrap text-[17px]">{shortDate(saved.date, lang)}</span>?
          </span>
          <button type="button" onClick={() => setOpen("ask")} className={`min-h-10 shrink-0 rounded-full bg-[var(--accent)] px-4 text-sm font-bold text-[var(--accent-contrast)] ${focus}`}>
            {t("Áno")}
          </button>
          <button type="button" onClick={() => patch(slug, { skipAsk: true })} className={`min-h-10 shrink-0 rounded-full border border-[var(--border)] px-4 text-sm font-semibold ${focus}`}>
            {t("Nie")}
          </button>
        </p>
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
        {dialogs}
      </>
    );
  }

  return (
    <>
      {single && (
        <p className={rowClass}>
          <VisitMark done={false} />
          <span className="min-w-0 flex-1">{t("Už ste tu boli?")}</span>
          <button type="button" onClick={() => setOpen("hand")} className={`min-h-10 shrink-0 rounded-full border border-[var(--border)] px-4 text-sm font-semibold ${focus}`}>
            {t("Boli sme tu")}
          </button>
        </p>
      )}
      {dialogs}
    </>
  );
}
