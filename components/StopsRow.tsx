"use client";

import { KindIcon } from "@/components/KindIcon";
import { formatDurationShort } from "@/lib/format";
import type { PoiIcon } from "@/lib/food";
import { POI_COLOUR } from "@/lib/palette";
import type { PoiKind } from "@/lib/types";
import { LUNCH, useTripStops, visits } from "@/lib/tripStops";
import type { StopWay, TripStop } from "@/lib/tripStops";
import { useT } from "@/lib/i18n";

/** The lunch break's choices, worked out by the planner from the day's times. */
export interface LunchPick {
  /** Half hours during the walk ("12:30"). */
  times: string[];
  /** When the walk reaches the goal: lunch's default. */
  goalTime: string;
  /** Food places or huts the walk passes around lunch, nearest in time first. */
  foods: { stop: TripStop; kind: PoiKind; icon: PoiIcon; time: string }[];
}

const WAYS: [StopWay, string][] = [
  ["tam", "Tam"],
  ["spat", "Späť"],
  ["oboje", "Tam aj späť"],
];

/**
 * The stops the group added (Peter 2026-10-23), each with its time; a lunch break is one tap.
 * On a there-and-back walk each place can be a stop on the way there, back, or both times.
 */
export function StopsRow({
  slug,
  hasPlaces,
  loop,
  lunch,
}: {
  slug: string;
  hasPlaces: boolean;
  loop: boolean;
  lunch?: LunchPick;
}) {
  const { stops, toggle, setWay, patch, lunchAt, has, minutes } = useTripStops(slug);
  const t = useT();
  return (
    <div id="zastavky" className="flex flex-col gap-1.5 scroll-mt-24">
      {stops.length > 0 && (
        <ul className="flex flex-col gap-1.5" aria-label={t("Zastávky")}>
          {stops.map((s) => (
            <li key={s.id} className="flex min-w-0">
              {/* One chip per stop, the way picker inside it: a separate switch wrapped onto its own line (Peter, 2026-10-24). */}
              <span className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border border-[var(--accent)] bg-[var(--accent-soft)] py-1 pr-1 pl-3 text-[13px] font-semibold text-[var(--accent)]">
                <span className="truncate">{t(s.name)}</span>
                <span className="font-data shrink-0">+{formatDurationShort(s.min * visits(s))}</span>
                {!loop && s.id !== LUNCH.id && <WaySwitch name={s.name} way={s.way} onPick={(way) => setWay(s.id, way)} />}
                {s.id === LUNCH.id && lunch && (
                  <LunchTime lunch={lunch} at={s.at} onPick={(at) => patch(LUNCH.id, { at })} />
                )}
                <button
                  type="button"
                  onClick={() => toggle(s)}
                  aria-label={t("Odobrať zastávku {name}", { name: t(s.name) })}
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-base leading-none hover:bg-[var(--card-bg)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {has(LUNCH.id) && lunch && lunch.foods.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold text-[var(--muted)]">{t("Okolo obeda idete popri:")}</p>
          <ul className="flex flex-wrap gap-1.5">
            {lunch.foods.map((f) => (
              <li key={f.stop.id} className="min-w-0 max-w-full">
                <button
                  type="button"
                  onClick={() => lunchAt(f.stop)}
                  aria-label={t("Obed v {name}", { name: f.stop.name })}
                  className="flex max-w-full min-w-0 items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card-bg)] py-1 pr-3 pl-1.5 text-[13px] font-semibold hover:border-[var(--accent)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                >
                  <KindIcon kind={f.icon} colour={POI_COLOUR[f.kind]} size={20} />
                  <span className="truncate">{f.stop.name}</span>
                  <span className="font-data shrink-0 text-[var(--muted)]">{f.time}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!has(LUNCH.id) && (
        <button
          type="button"
          onClick={() => toggle(LUNCH)}
          className="min-h-10 w-fit rounded-full border border-[var(--border)] bg-[var(--segment-bg)] px-3 py-1 text-[13px] font-semibold transition-colors hover:border-[var(--accent)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        >
          + {t("Prestávka na obed")}
        </button>
      )}
      <p className="text-xs text-[var(--muted)]">
        {minutes > 0
          ? t("Zastávky predĺžia deň o {t}, časy aj obrázok dňa nižšie ich už rátajú.", { t: formatDurationShort(minutes) })
          : hasPlaces
            ? t("Zastávku pridáte tlačidlom + pri mieste na trase alebo na mape.")
            : t("Pridajte prestávku, časy sa posunú.")}
      </p>
    </div>
  );
}

/** When to eat: at the goal (default) or a half hour during the walk. */
function LunchTime({ lunch, at, onPick }: { lunch: LunchPick; at: string | undefined; onPick: (at: string | undefined) => void }) {
  const t = useT();
  return (
    // The pill shows the choice at 13 px; the phone's own picker sits on top, invisible, at 16 px, because
    // iPhone Safari zooms the page into any field with smaller text.
    <span className="relative inline-flex h-7 shrink-0 items-center rounded-full border border-[var(--border)] bg-[var(--card-bg)] pr-6 pl-2.5 text-[13px] font-semibold text-[var(--foreground)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--accent)]">
      <span aria-hidden>{at ?? t("na cieli {t}", { t: lunch.goalTime })}</span>
      <select
        value={at ?? ""}
        onChange={(e) => onPick(e.target.value || undefined)}
        aria-label={t("Kedy obed")}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none text-base opacity-0"
      >
        <option value="">{t("na cieli {t}", { t: lunch.goalTime })}</option>
        {at && !lunch.times.includes(at) && <option value={at}>{at}</option>}
        {lunch.times.map((time) => (
          <option key={time} value={time}>
            {time}
          </option>
        ))}
      </select>
      <span aria-hidden className="pointer-events-none absolute right-2 text-[10px] text-[var(--muted)]">
        ▼
      </span>
    </span>
  );
}

/**
 * Stop on the way there, back, or both times (a there-and-back walk passes each place twice): a small
 * dropdown, the phone's own picker, so it fits beside the stop instead of a three-button switch.
 */
export function WaySwitch({ name, way, onPick }: { name: string; way: StopWay | undefined; onPick: (way: StopWay) => void }) {
  const t = useT();
  return (
    // Same as LunchTime: visible pill at 13 px, the invisible picker on top at 16 px (no iPhone zoom).
    <span className="relative inline-flex h-7 shrink-0 items-center rounded-full border border-[var(--border)] bg-[var(--card-bg)] pr-6 pl-2.5 text-[13px] font-semibold text-[var(--foreground)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--accent)]">
      <span aria-hidden>{t(WAYS.find(([w]) => w === (way ?? "tam"))?.[1] ?? WAYS[0][1])}</span>
      <select
        value={way ?? "tam"}
        onChange={(e) => onPick(e.target.value as StopWay)}
        aria-label={t("Kedy sa zastavíte: {name}", { name: t(name) })}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none text-base opacity-0"
      >
        {WAYS.map(([w, label]) => (
          <option key={w} value={w}>
            {t(label)}
          </option>
        ))}
      </select>
      <span aria-hidden className="pointer-events-none absolute right-2 text-[10px] text-[var(--muted)]">
        ▼
      </span>
    </span>
  );
}
