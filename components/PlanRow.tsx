"use client";

import { track } from "@/lib/analytics";
import { useLang, useT } from "@/lib/i18n";
import { smoothScroll } from "@/lib/motion";
import { PLAN_CARD_ID, planDay, stillPlanned } from "@/lib/nextPlan";
import { usePutPlanBack } from "@/lib/openPlan";
import { planKey, useSavedTrips } from "@/lib/savedTrips";
import type { SavedTrip } from "@/lib/savedTrips";
import { useTripSettings } from "@/lib/tripSettings";
import { UiIcon } from "@/components/UiIcon";

/**
 * The way back to a plan on the planned trip's own page (Peter, 25 Nov 2026, C213): a row at the bottom of
 * the first card, "Váš plán: sobota 28. 11. o 09:00 · Otvoriť". "Otvoriť" puts the plan's day, time, start
 * and stops back on this page and moves down to the plan. Shown while the trip is still ahead; the day
 * after, "Boli ste tu?" takes over (VisitLink here, the answer itself in the VisitRow card).
 */
export function PlanRow({ slug }: { slug: string }) {
  const { trips } = useSavedTrips();
  const { today, date: pageDate } = useTripSettings();
  const putBack = usePutPlanBack();
  const t = useT();
  const lang = useLang();
  const ahead = today ? trips.filter((x) => x.slug === slug && stillPlanned(x, today)).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)) : [];
  const plan = ahead[0];
  if (!today || !plan) return null;
  const day = planDay(plan.date, today, lang);
  const openIt = (p: SavedTrip) => {
    putBack(p);
    track("plan_open", { from: "trip" });
    document.getElementById(PLAN_CARD_ID)?.scrollIntoView({ block: "start", behavior: smoothScroll() });
  };

  // Several plans for this route (C235, Peter's pick B): one chip per plan, the one for the page's day ticked.
  if (ahead.length > 1)
    return (
      <div className="mt-1 flex flex-col gap-2 border-t border-[var(--border)] pt-3 text-[14.5px]">
        <b>
          {t("Vaše plány")} ({ahead.length}):
        </b>
        <div className="flex flex-wrap gap-1.5">
          {ahead.map((p) => {
            const here = p.date === pageDate;
            const d = planDay(p.date, today, lang);
            return (
              <button
                key={planKey(p)}
                type="button"
                onClick={() => openIt(p)}
                aria-current={here ? "true" : undefined}
                className={`inline-flex min-h-10 items-center gap-1 rounded-[var(--radius-chip)] border px-3 text-sm whitespace-nowrap focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
                  here ? "border-[color-mix(in_srgb,var(--ok)_35%,transparent)] bg-[var(--ok-bg)] font-bold text-[var(--ok)]" : "border-[var(--border)] bg-[var(--card-bg)]"
                }`}
              >
                {d.word} <span className="font-data text-base">{d.date}</span> · <span className="font-data text-base">{p.time}</span>
                {here && <UiIcon name="check" size={15} />}
              </button>
            );
          })}
        </div>
      </div>
    );

  return (
    <p className="mt-1 flex min-h-10 items-center gap-2 border-t border-[var(--border)] pt-3 text-[14.5px]">
      {/* Below 380 px the icon gives its room to the text, so a 360 px phone keeps one line. */}
      <UiIcon name="cal" size={20} className="text-[var(--accent)] max-[379px]:hidden" />
      {/* Two pieces that never break inside: on a 320 px phone the day and time go under the label as one piece. */}
      <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1.5">
        <b className="whitespace-nowrap">{t("Váš plán")}:</b>
        <span className="whitespace-nowrap">
          {day.word} <span className="font-data text-[17px]">{day.date}</span> {t("o")} <span className="font-data text-[17px]">{plan.time}</span>
        </span>
      </span>
      <button
        type="button"
        onClick={() => openIt(plan)}
        className="-my-2 -mr-2 shrink-0 py-2 pr-2 pl-1 text-sm font-bold text-[var(--accent)] underline underline-offset-[3px] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      >
        {t("Otvoriť")}
      </button>
    </p>
  );
}
