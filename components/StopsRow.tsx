"use client";

import { KindIcon } from "@/components/KindIcon";
import { formatDurationShort } from "@/lib/format";
import { useEffect, useSyncExternalStore } from "react";
import type { PoiIcon } from "@/lib/food";
import { POI_COLOUR } from "@/lib/palette";
import type { PoiKind } from "@/lib/types";
import { LUNCH, useTripStops } from "@/lib/tripStops";
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

// StopsRow and PoiList are siblings in the plan card, and the lunch row sits in PoiList's "Vybrané" box
// (Peter, 12 Nov 2026), so StopsRow hands the planner's lunch choices over through this small store.
const LUNCH_EVENT = "turuj-lunch-pick";
let published: Record<string, LunchPick | undefined> = {};

function subscribeLunch(cb: () => void) {
  window.addEventListener(LUNCH_EVENT, cb);
  return () => window.removeEventListener(LUNCH_EVENT, cb);
}

function publishLunch(slug: string, pick: LunchPick | undefined) {
  if (published[slug] === pick) return;
  published = { ...published, [slug]: pick };
  window.dispatchEvent(new Event(LUNCH_EVENT));
}

/** The lunch choices StopsRow was given for this trip (undefined until it has mounted). */
export function useLunchPick(slug: string): LunchPick | undefined {
  return useSyncExternalStore(subscribeLunch, () => published[slug], () => undefined);
}

/**
 * The top of "Zastávky po ceste": the lunch break in one tap and the hint. The stops themselves are in
 * PoiList's "Vybrané" box, with the places to add (Peter, 12 Nov 2026: keep the map and structure, add the rest).
 */
export function StopsRow({
  slug,
  hasPlaces,
  lunch,
}: {
  slug: string;
  hasPlaces: boolean;
  /** Kept for the planner's call; the way picker now sits on each stop's row in PoiList. */
  loop?: boolean;
  lunch?: LunchPick;
}) {
  const { stops, lunchAt, has, toggle, minutes } = useTripStops(slug);
  const t = useT();
  useEffect(() => {
    publishLunch(slug, lunch);
    return () => publishLunch(slug, undefined);
  }, [slug, lunch]);
  return (
    <div id="zastavky" className="flex flex-col gap-1.5 scroll-mt-24">
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
        {hasPlaces
          ? t("Zastávku pridáte tlačidlom + pri mieste na trase alebo na mape.")
          : stops.length === 0
            ? t("Pridajte prestávku, časy sa posunú.")
            : t("Zastávky predĺžia deň o {t}, časy aj obrázok dňa nižšie ich už rátajú.", { t: formatDurationShort(minutes) })}
      </p>
    </div>
  );
}

/** When to eat: at the goal (default) or a half hour during the walk. */
export function LunchTime({ lunch, at, onPick }: { lunch: LunchPick; at: string | undefined; onPick: (at: string | undefined) => void }) {
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
