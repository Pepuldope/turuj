"use client";

import { formatDuration, formatWalk } from "@/lib/format";
import { focusOnMap } from "@/lib/mapFocus";
import { useTripAccess } from "@/components/TripAccess";
import { approachMin } from "@/lib/dayPlan";
import type { ParkingLot } from "@/lib/types";
import { useLang, useT } from "@/lib/i18n";
import { decimal, tr } from "@/lib/lang";
import type { Lang } from "@/lib/lang";

/** How many parking options to offer; the rest are far or duplicates. */
export const MAX_OPTIONS = 4;

export function feeLabel(p: ParkingLot, lang: Lang): string | null {
  return p.fee === true ? tr(lang, "spoplatnené") : p.fee === false ? tr(lang, "zadarmo") : null;
}

function walkLabel(p: ParkingLot, lang: Lang): string {
  if (p.join) {
    const min = approachMin(p.join.walk_m);
    const km = decimal(lang, p.join.skip_m / 1000);
    const walk = min > 0 ? tr(lang, "{m} pešo k trase (~{t})", { m: formatWalk(p.join.walk_m, lang), t: formatDuration(min) }) : tr(lang, "priamo pri trase");
    return p.join.skip_m > 0 ? tr(lang, "{walk}, túra kratšia o {km} km", { walk, km }) : walk;
  }
  const min = approachMin(p.walk_m);
  return min > 0 ? tr(lang, "{m} pešo k začiatku (~{t})", { m: formatWalk(p.walk_m, lang), t: formatDuration(min) }) : tr(lang, "pri začiatku trasy");
}

export function summaryWalk(p: ParkingLot, lang: Lang): string {
  if (p.join) return p.join.walk_m < 150 ? tr(lang, "pri trase") : tr(lang, "{m} k trase", { m: formatWalk(p.join.walk_m, lang) });
  return p.walk_m < 150 ? tr(lang, "pri štarte") : formatWalk(p.walk_m, lang);
}

/**
 * Where to leave the car, as the options of the "Ako sa tam dostanete" step. With several parking
 * spots near the start the visitor picks one; the drive, the walk to the trail and the plan follow.
 */
export function ParkingOptions() {
  const { parkingLots, choice, choose, parking, transit, stops, walking, trailStart } = useTripAccess();
  const options = parkingLots.slice(0, MAX_OPTIONS);
  const t = useT();
  const lang = useLang();
  if (transit || walking) return null;

  return (
    <div className="flex flex-col gap-2">
      {!parking && (
        <p className="text-sm">
          {t("Pri začiatku trasy nemáme parkovisko. Navigácia vás dovedie na najbližšiu cestu, odtiaľ pešo.")}
          {stops.length > 0 && ` ${t("Skúste aj vlak alebo autobus.")}`}
        </p>
      )}
      {options.length > 1 && <p className="text-sm text-[var(--muted)]">{t("Vyberte, kde zaparkujete. Cesta autom aj pešo sa prepočíta.")}</p>}
      {options.length > 0 && (
        <ul className="flex flex-col gap-1.5" role="radiogroup" aria-label={t("Parkovisko")}>
          {options.map((p, i) => {
            const selected = i === choice;
            const fee = feeLabel(p, lang);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    choose(i);
                    // The map beside it centres on this parking, with where it meets the trail in view.
                    focusOnMap({ location: p.location, scope: "access", context: p.join?.location ?? trailStart ?? undefined });
                  }}
                  disabled={options.length === 1}
                  className={`flex min-h-11 w-full items-start gap-3 rounded-xl border px-3 py-2 text-left text-sm disabled:cursor-default ${
                    selected ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)] hover:border-[var(--accent)]"
                  }`}
                >
                  <span className="mt-pin mt-pin-parking shrink-0" aria-hidden>
                    P
                  </span>
                  <span className="flex flex-col">
                    <span className="font-semibold">{t(p.name)}</span>
                    <span className="text-[var(--muted)]">
                      {walkLabel(p, lang)}
                      {fee ? `, ${fee}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {parking && (
        <p className="text-xs text-[var(--muted)]">
          {t("Súradnice:")}{" "}
          <span className="font-data select-all text-sm">
            {parking.location.lat.toFixed(5)}, {parking.location.lon.toFixed(5)}
          </span>{" "}
          · {t("Zdroj: OpenStreetMap")}
        </p>
      )}
    </div>
  );
}
