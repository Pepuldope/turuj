"use client";

import { track } from "@/lib/analytics";
import { useLang, useT } from "@/lib/i18n";
import { smoothScroll } from "@/lib/motion";
import { PLAN_CARD_ID, planDay, stillPlanned } from "@/lib/nextPlan";
import { usePutPlanBack } from "@/lib/openPlan";
import { useSavedTrips } from "@/lib/savedTrips";
import { useTripSettings } from "@/lib/tripSettings";
import { UiIcon } from "@/components/UiIcon";

/**
 * The way back to a plan on the planned trip's own page (Peter, 25 Nov 2026, C213): a row at the bottom of
 * the first card, "Váš plán: sobota 28. 11. o 09:00 · Otvoriť". "Otvoriť" puts the plan's day, time, start
 * and stops back on this page and moves down to the plan. Shown while the trip is still ahead; the day
 * after, "Boli ste na výlete?" (TripReviews) takes over.
 */
export function PlanRow({ slug }: { slug: string }) {
  const { trips } = useSavedTrips();
  const { today } = useTripSettings();
  const putBack = usePutPlanBack();
  const t = useT();
  const lang = useLang();
  const plan = trips.find((x) => x.slug === slug);
  if (!today || !plan || !stillPlanned(plan, today)) return null;
  const day = planDay(plan.date, today, lang);

  return (
    <p className="mt-1 flex min-h-10 items-center gap-2.5 border-t border-[var(--border)] pt-3 text-[14.5px]">
      <UiIcon name="cal" size={20} className="text-[var(--accent)]" />
      <span className="min-w-0 flex-1">
        <b>{t("Váš plán")}:</b>{" "}
        <span className="whitespace-nowrap">
          {day.word} <span className="font-data text-[17px]">{day.date}</span>
        </span>{" "}
        <span className="whitespace-nowrap">
          {t("o")} <span className="font-data text-[17px]">{plan.time}</span>
        </span>
      </span>
      <button
        type="button"
        onClick={() => {
          putBack(plan);
          track("plan_open", { from: "trip" });
          document.getElementById(PLAN_CARD_ID)?.scrollIntoView({ block: "start", behavior: smoothScroll() });
        }}
        className="-my-2 -mr-2 shrink-0 p-2 text-sm font-bold text-[var(--accent)] underline underline-offset-[3px] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      >
        {t("Otvoriť")}
      </button>
    </p>
  );
}
