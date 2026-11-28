"use client";

import { useMemo } from "react";
import type { TripCardItem } from "@/components/TripCard";
import { UiIcon } from "@/components/UiIcon";
import { DIFFICULTY_LABEL, GOAL_LABEL, formatDurationShort, formatTime } from "@/lib/format";
import { GOAL_COLOUR } from "@/lib/palette";
import { kindSvg } from "@/lib/kindIcons";
import { LangLink, useLang, useT } from "@/lib/i18n";
import { MIN_SHOWN, knownTitle, pickKnown } from "@/lib/knownTrips";
import { smoothScroll } from "@/lib/motion";

/**
 * Known trips on the first phone screen (C155, Peter 14 Nov: option C): a swipe strip of the best known trips
 * that fit the day and the month, above the search; AllTripsLink, under it or under "Výlety okolo …", goes to the full list.
 * The rule for "well-known" is in lib/knownTrips.ts.
 */
export function KnownTripsStrip({ items, month, hasStart, transit }: { items: readonly TripCardItem[]; month: number; hasStart: boolean; transit: boolean }) {
  const t = useT();
  const lang = useLang();
  const picks = useMemo(
    () =>
      pickKnown(
        items.map((item) => ({
          item,
          rank: item.detail.trail.rank ?? 0,
          hikeMin: item.hikeMin,
          driveMin: item.driveMin,
          fits: !item.closed && (!item.fit || item.fit.status === "fits"),
          viaLonger: item.longMin != null,
        })),
        month,
        hasStart
      ),
    [items, month, hasStart]
  );
  if (picks.length < MIN_SHOWN) return null;

  return (
    <section aria-labelledby="zname-vylety" className="-mx-4 flex flex-col gap-2" data-known-strip>
      <h2 id="zname-vylety" className="px-4 text-[17px] leading-tight font-bold">
        {knownTitle(month, lang)}
      </h2>
      <ul className="flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto overscroll-x-contain px-4 pb-1 [scrollbar-width:none]">
        {picks.map(({ item }) => {
          const { trail } = item.detail;
          const goal = trail.goal ?? "ine";
          return (
            <li key={trail.slug} className="w-[220px] shrink-0 snap-start">
              <LangLink
                href={`/trasa/${trail.slug}`}
                className="flex h-full flex-col gap-1.5 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card-bg)] p-3 transition-transform duration-150 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
              >
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white"
                    style={{ background: GOAL_COLOUR[goal] }}
                    // Constant markup from lib/kindIcons.ts, no user data.
                    dangerouslySetInnerHTML={{ __html: kindSvg(goal, 17) }}
                  />
                  <span className="text-xs font-semibold text-[var(--muted)]">
                    {t(GOAL_LABEL[goal])} · {t(DIFFICULTY_LABEL[trail.difficulty])}
                  </span>
                </span>
                <span className="line-clamp-2 text-[15px] leading-snug font-bold">{trail.name}</span>
                <span className="font-data mt-auto flex flex-wrap gap-x-3 text-[13px] font-semibold">
                  {item.driveMin !== null && (
                    <span className="inline-flex items-center gap-1">
                      <UiIcon name={transit && item.stop ? "bus" : "car"} size={13} />
                      {item.driveApprox ? "~" : ""}
                      {formatDurationShort(item.driveMin)}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <UiIcon name="boot" size={13} />
                    {formatDurationShort(item.hikeMin)}
                  </span>
                </span>
                {item.fit?.status === "fits" && (
                  <span className="text-xs text-[var(--muted)]">
                    {t(item.driveMin !== null ? "Vyrazte do {time}" : "Začnite do {time}", { time: formatTime(item.fit.latest) })}
                  </span>
                )}
              </LangLink>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** "Všetky výlety v zozname": jumps to the full list. Under "Výlety okolo …" when that shows, else under the strip (Peter, 28 Nov). */
export function AllTripsLink() {
  const t = useT();
  return (
    <a
      href="#vylety"
      onClick={(e) => {
        const list = document.getElementById("vylety");
        if (!list) return;
        e.preventDefault();
        list.scrollIntoView({ behavior: smoothScroll(), block: "start" });
        list.focus({ preventScroll: true });
      }}
      className="inline-flex w-fit items-center gap-1 text-sm font-semibold text-[var(--accent)]"
    >
      {t("Všetky výlety v zozname")}
      <UiIcon name="down" size={14} />
    </a>
  );
}
