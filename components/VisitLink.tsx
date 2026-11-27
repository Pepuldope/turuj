"use client";

import { shortDate } from "@/lib/days";
import { useLang, useT } from "@/lib/i18n";
import { smoothScroll } from "@/lib/motion";
import { whenLabel } from "@/lib/visitWhen";
import { UiIcon } from "@/components/UiIcon";
import { VISIT_CARD_ID, useVisitState } from "@/components/VisitRow";
import { VisitMark } from "@/components/VisitMark";

const focus = "focus-visible:outline-2 focus-visible:outline-[var(--accent)]";
const rowClass = "mt-1 flex min-h-10 items-center gap-2 border-t border-[var(--border)] pt-3 text-[14.5px]";
const jump = () => document.getElementById(VISIT_CARD_ID)?.scrollIntoView({ block: "center", behavior: smoothScroll() });

/**
 * The quiet line at the bottom of the trip page's first card (Peter, 27 Nov 2026) that points down to the visit
 * card (VisitRow): a link to add a visit, the mark of the visits already there, or the question about a plan
 * whose day has passed. It only scrolls; the windows open from the card.
 */
export function VisitLink({ slug, place, routes }: { slug: string; place: string; routes: string[] }) {
  const { today, saved, mine, ask } = useVisitState(slug, place, routes);
  const t = useT();
  const lang = useLang();

  if (!today) return null;

  if (ask && saved) {
    return (
      <p className={rowClass}>
        <VisitMark done={false} />
        <span className="mr-1 min-w-0">
          <b>{t("Boli ste tu")}</b> <span className="font-data whitespace-nowrap text-[17px]">{shortDate(saved.date, lang)}</span>?
        </span>
        <button type="button" onClick={jump} className={`-my-2 flex min-h-10 shrink-0 items-center gap-1 rounded-full px-1 text-sm font-bold text-[var(--accent)] underline underline-offset-[3px] ${focus}`}>
          {t("Odpovedať")}
          <UiIcon name="down" size={14} />
        </button>
      </p>
    );
  }

  if (mine.length > 0) {
    const latest = mine[0];
    const dated = latest.date !== "";
    return (
      <p className={rowClass}>
        <button type="button" onClick={jump} className={`flex min-h-10 min-w-0 flex-1 items-center gap-2 text-left ${focus}`}>
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
          <UiIcon name="down" size={14} className="ml-auto shrink-0 text-[var(--muted)]" />
        </button>
      </p>
    );
  }

  return (
    <p className={rowClass}>
      <button type="button" onClick={jump} className={`flex min-h-10 flex-wrap items-center gap-x-1.5 text-left ${focus}`}>
        <span className="text-[var(--muted)]">{t("Už ste tu boli?")}</span>
        <span className="inline-flex items-center gap-1 text-sm font-bold whitespace-nowrap text-[var(--accent)] underline underline-offset-[3px]">
          {t("Pridajte si návštevu")}
          <UiIcon name="down" size={14} />
        </span>
      </button>
    </p>
  );
}
