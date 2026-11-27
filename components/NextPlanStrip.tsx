"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { track } from "@/lib/analytics";
import { confirmPlanVisit } from "@/lib/confirmPlanVisit";
import { shortDate, weekdayInSentence } from "@/lib/days";
import { useReviewed } from "@/lib/reviewed";
import type { SavedTrip } from "@/lib/savedTrips";
import { VisitSheet } from "@/components/VisitSheet";
import { LangLink, useLang, useT } from "@/lib/i18n";
import { langPath } from "@/lib/lang";
import { nextPlan, planDay, planToAsk } from "@/lib/nextPlan";
import { usePutPlanBack } from "@/lib/openPlan";
import { useSavedTrips } from "@/lib/savedTrips";
import { useVisits } from "@/lib/visits";
import { myTripsCounts, myTripsParts } from "@/lib/myTripsCount";
import { useTripSettings } from "@/lib/tripSettings";
import { UiIcon } from "@/components/UiIcon";

/**
 * The way back to a plan on the home page (Peter, 25 Nov 2026, C213): the nearest saved plan under the
 * headline; a tap opens its trip page with the plan's day, time, start and stops put back. Nothing is
 * shown without a plan ahead, so the home page stays as it was for everyone else. The saved list lives on
 * the device, so the strip appears only after the page has loaded.
 */
export function NextPlanStrip() {
  const { trips, patch } = useSavedTrips();
  const { visits } = useVisits();
  const reviewedMap = useReviewed();
  // The plan the window is open for: kept here, because confirming it takes the plan out of the question.
  const [confirming, setConfirming] = useState<SavedTrip | null>(null);
  const { today } = useTripSettings();
  const putBack = usePutPlanBack();
  const t = useT();
  const lang = useLang();
  const upNext = today ? nextPlan(trips, today) : null;
  const ask = today && upNext?.date !== today ? planToAsk(trips, today) : null;
  const plan = ask ? null : upNext;
  // On the page's body, not inside the strip: the strip sits in a low layer of the home page, and the search
  // box, the map's buttons and the top bar would otherwise be drawn over the window.
  const sheet = confirming && createPortal(
    <VisitSheet
      name={confirming.name}
      slug={confirming.slug}
      plan={{ date: confirming.date }}
      reviewed={!!confirming.reviewed || reviewedMap[confirming.slug] !== undefined}
      onSave={(date) => confirmPlanVisit(confirming, date, patch, "home")}
      onClose={() => setConfirming(null)}
    />,
    document.body
  );
  if (ask) {
    return (
      <>
        <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border-[1.5px] border-[var(--accent)] bg-[var(--card-bg)] px-3.5 py-3 shadow-[var(--shadow-float)]">
          <span className="block truncate text-[12.5px] text-[var(--muted)]">
            {t("Váš plán")} · {ask.name}
          </span>
          <strong className="block text-lg leading-tight">
            {t("Boli ste tam")} {weekdayInSentence(ask.date, lang)} <span className="font-data whitespace-nowrap text-xl">{shortDate(ask.date, lang)}</span>?
          </strong>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setConfirming(ask)} className="min-h-10 rounded-full bg-[var(--accent)] px-4 text-sm font-bold text-[var(--accent-contrast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">
              {t("Áno, boli sme")}
            </button>
            <button type="button" onClick={() => patch(ask.slug, { skipAsk: true })} className="min-h-10 rounded-full border border-[var(--border)] px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">
              {t("Nie")}
            </button>
          </div>
        </div>
        {sheet}
      </>
    );
  }
  if (!today) return sheet || null;
  if (!plan) {
    // No plan ahead and nothing to ask: a quiet way to Moje výlety, when the device holds a trip or a visit.
    const parts = myTripsParts(myTripsCounts(trips, visits));
    if (parts.length === 0) return sheet || null;
    return (
      <>
        <LangLink
          href="/ulozene"
          onClick={() => track("my_trips_open", { from: "home" })}
          className="flex items-center gap-3 rounded-[var(--radius-card)] border border-[var(--card-edge)] bg-[var(--card-bg)] px-3.5 py-2.5 shadow-[var(--shadow-float)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
            <UiIcon name="list" size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <strong className="block text-base leading-tight">{t("Moje výlety")}</strong>
            <span className="block text-sm text-[var(--muted)]">
              {parts.map((p, i) => (
                <span key={p.word}>
                  {i > 0 && " · "}
                  <span className="whitespace-nowrap">
                    <span className="font-data text-base text-[var(--foreground)]">{p.n}</span> {t(p.word)}
                  </span>
                </span>
              ))}
            </span>
          </span>
          <UiIcon name="chev" size={20} className="text-[var(--accent)]" />
        </LangLink>
        {sheet}
      </>
    );
  }
  const day = planDay(plan.date, today, lang);
  const href = `/trasa/${plan.slug}`;

  return (
    <>
    <div className="rounded-[var(--radius-card)] border-[1.5px] border-[var(--accent)] bg-[var(--card-bg)] px-3.5 pt-3 pb-1 shadow-[var(--shadow-float)]">
    <LangLink
      href={href}
      onClick={(e) => {
        putBack(plan);
        track("plan_open", { from: "home" });
        // Without signal a full page load lets the service worker serve the saved copy.
        if (!navigator.onLine) {
          e.preventDefault();
          window.location.assign(langPath(lang, href));
        }
      }}
      className="flex items-center gap-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[var(--accent-soft)] text-[var(--accent)]">
        <UiIcon name="cal" size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] text-[var(--muted)]">{t("Váš plán")}</span>
        <strong className="block truncate text-lg leading-tight">{plan.name}</strong>
        <span className="block text-sm text-[var(--muted)]">
          <span className="whitespace-nowrap">
            {day.word} <span className="font-data text-base text-[var(--foreground)]">{day.date}</span>
          </span>
          {" · "}
          <span className="whitespace-nowrap">
            {t("odchod")} <span className="font-data text-base text-[var(--foreground)]">{plan.time}</span>
          </span>
        </span>
      </span>
      <UiIcon name="chev" size={20} className="text-[var(--accent)]" />
    </LangLink>
    <LangLink
      href="/ulozene"
      onClick={() => track("my_trips_open", { from: "home-plan" })}
      className="ml-auto flex min-h-10 w-fit items-center gap-0.5 text-sm font-bold text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
    >
      {t("všetky výlety")}
      <UiIcon name="chev" size={14} />
    </LangLink>
    </div>
    {sheet}
    </>
  );
}
