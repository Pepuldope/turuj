"use client";

import { useState } from "react";
import { addDaysIso, longDay } from "@/lib/days";
import { useLang, useT } from "@/lib/i18n";
import { compareMonths, monthGrid, monthOf, monthTitle, shiftMonth, weekdayHeads } from "@/lib/monthGrid";
import type { Month } from "@/lib/monthGrid";
import { UiIcon } from "@/components/UiIcon";

const focus = "focus-visible:outline-2 focus-visible:outline-[var(--accent)]";
const arrow = `grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[var(--border)] disabled:opacity-30 ${focus}`;

/**
 * A month to pick a past day from, drawn by the page itself (Peter, 26 Nov 2026: the browser's own date picker
 * did not work for him; it is a different thing in every browser). No day after `today` can be picked; the year
 * is a list, so a visit from years ago is two taps away, not thirty. With `ahead` it is the other way round, for moving
 * a plan (C229): today and the year after it, nothing before today.
 */
export function DayCalendar({
  value,
  today,
  oldestYear = 1980,
  ahead = false,
  onPick,
}: {
  value: string | null;
  today: string;
  oldestYear?: number;
  ahead?: boolean;
  onPick: (iso: string) => void;
}) {
  const t = useT();
  const lang = useLang();
  const last = ahead ? monthOf(addDaysIso(today, 365)) : monthOf(today);
  const first: Month = ahead ? monthOf(today) : { year: oldestYear, month: 1 };
  const shut = (iso: string) => (ahead ? iso < today : iso > today);
  const [shown, setShown] = useState<Month>(() => (value ? monthOf(value) : ahead ? first : last));
  const go = (m: Month) => setShown(compareMonths(m, last) > 0 ? last : compareMonths(m, first) < 0 ? first : m);
  const weeks = monthGrid(shown);
  const [monthName] = monthTitle(shown, lang).split(" ");

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[var(--border)] p-2.5">
      <div className="flex items-center gap-2">
        <button type="button" aria-label={t("Predchádzajúci mesiac")} disabled={compareMonths(shown, first) <= 0} onClick={() => go(shiftMonth(shown, -1))} className={arrow}>
          <UiIcon name="back" size={18} />
        </button>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5" aria-live="polite">
          <b className="text-[15px]">{monthName}</b>
          <select
            aria-label={t("Rok")}
            value={shown.year}
            onChange={(e) => go({ year: Number(e.target.value), month: shown.month })}
            className={`font-data min-h-10 rounded-lg border border-[var(--border)] bg-[var(--card-bg)] px-1.5 text-[16px] ${focus}`}
          >
            {Array.from({ length: last.year - first.year + 1 }, (_, i) => (ahead ? first.year + i : last.year - i)).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <button type="button" aria-label={t("Ďalší mesiac")} disabled={compareMonths(shown, last) >= 0} onClick={() => go(shiftMonth(shown, 1))} className={arrow}>
          <UiIcon name="chev" size={18} />
        </button>
      </div>
      <div role="grid" aria-label={monthTitle(shown, lang)} className="flex flex-col gap-0.5">
        <div role="row" className="grid grid-cols-7">
          {weekdayHeads(lang).map((d) => (
            <span key={d} role="columnheader" className="py-1 text-center text-[12px] font-bold text-[var(--muted)]">
              {d}
            </span>
          ))}
        </div>
        {weeks.map((week, i) => (
          <div key={i} role="row" className="grid grid-cols-7">
            {week.map((iso, j) =>
              iso === null ? (
                <span key={j} role="gridcell" />
              ) : (
                <span key={j} role="gridcell" className="grid place-items-center">
                  <button
                    type="button"
                    disabled={shut(iso)}
                    aria-pressed={iso === value}
                    aria-label={longDay(iso, lang)}
                    onClick={() => onPick(iso)}
                    className={`font-data grid h-10 w-full max-w-11 place-items-center rounded-full text-[16px] disabled:opacity-30 ${
                      iso === value ? "bg-[var(--accent)] font-bold text-[var(--accent-contrast)]" : iso === today ? "border border-[var(--accent)]" : "hover:bg-[var(--accent-soft)]"
                    } ${focus}`}
                  >
                    {Number(iso.slice(8))}
                  </button>
                </span>
              ),
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
