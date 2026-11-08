"use client";

import { useState } from "react";
import { transitMinutes } from "@/lib/drive";
import { formatDurationShort } from "@/lib/format";
import { useTripSettings } from "@/lib/tripSettings";
import type { Travel } from "@/lib/tripSettings";
import type { UiIconName } from "@/lib/uiIcons";
import { UiIcon } from "@/components/UiIcon";
import { NoParkingChip, NoStopChip } from "@/components/routeBits";
import { useT } from "@/lib/i18n";

const OPTIONS: { value: Travel; label: string; icon: UiIconName }[] = [
  { value: "car", label: "Autom", icon: "car" },
  { value: "transit", label: "Bus/vlak", icon: "bus" },
];

/**
 * Car or public transport, as two equal options: the plan, times and the way
 * back follow. Remembered across visits, so the home list follows it too.
 * With no car park at the start (`noCar`) the car is greyed out with the warning
 * and the bus is the only choice, without changing what is remembered; tapping the
 * greyed car says why. With no stop near the start (`noBus`) it is the same the other way round.
 */
/** Three options (Pešo offered): label and minutes stacked so they fit a phone. */
const stack = (three: boolean) => (three ? "flex-col gap-0 py-1.5 leading-tight" : "gap-1.5 py-2.5");

export function TravelSwitch({
  roadMin = null,
  trainMin = null,
  noCar = false,
  noBus = false,
  walkMin = null,
  walking = false,
  onWalk,
}: {
  roadMin?: number | null;
  trainMin?: number | null;
  noCar?: boolean;
  noBus?: boolean;
  /** Minutes on foot from the start to the trail when it's close enough to offer Pešo (not remembered: depends on the start). */
  walkMin?: number | null;
  walking?: boolean;
  onWalk?: (on: boolean) => void;
}) {
  const settings = useTripSettings();
  const t = useT();
  const { update } = settings;
  const travel: Travel = noCar ? "transit" : noBus ? "car" : settings.travel;
  const [why, setWhy] = useState(false);
  const three = walkMin !== null;
  return (
    <div className="flex flex-col gap-2">
      <div
        role="radiogroup"
        aria-label={t("Ako sa dopravíte")}
        className={`grid ${walkMin !== null ? "grid-cols-3" : "grid-cols-2"} gap-[3px] rounded-xl bg-[var(--segment-bg)] p-[3px]`}
      >
        {OPTIONS.map((o) => {
          const on = !walking && travel === o.value;
          if ((noCar && o.value === "car") || (noBus && o.value === "transit"))
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={false}
                aria-disabled
                onClick={() => setWhy((w) => !w)}
                className="inline-flex cursor-help flex-wrap items-center justify-center gap-x-1.5 gap-y-1 rounded-[10px] bg-[var(--off-bg)] px-2 py-2 text-sm font-semibold text-[var(--off-fg)]"
              >
                <UiIcon name={o.icon} size={18} />
                <span className="line-through">{t(o.label)}</span>
                {o.value === "car" ? <NoParkingChip /> : <NoStopChip />}
              </button>
            );
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                onWalk?.(false);
                update({ travel: o.value });
              }}
              className={`inline-flex items-center justify-center ${stack(three)} rounded-[10px] px-2 text-sm font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
                on
                  ? "bg-[var(--card-bg)] text-[var(--foreground)] shadow-sm"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              <span className={on ? "text-[var(--accent)]" : ""}>
                <UiIcon name={o.icon} size={18} />
              </span>
              {t(o.label)}
              {roadMin !== null && (
                <span className="font-data text-[13px] font-semibold text-[var(--muted)]">
                  {o.value === "car"
                    ? formatDurationShort(roadMin)
                    : trainMin !== null
                      ? formatDurationShort(trainMin)
                      : `~${formatDurationShort(transitMinutes(roadMin))}`}
                </span>
              )}
            </button>
          );
        })}
        {walkMin !== null && (
          <button
            type="button"
            role="radio"
            aria-checked={walking}
            onClick={() => onWalk?.(true)}
            className={`inline-flex items-center justify-center ${stack(three)} rounded-[10px] px-2 text-sm font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
              walking ? "bg-[var(--card-bg)] text-[var(--foreground)] shadow-sm" : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            <span className={walking ? "text-[var(--accent)]" : ""}>
              <UiIcon name="walker" size={18} />
            </span>
            {t("Pešo")}
            <span className="font-data text-[13px] font-semibold text-[var(--muted)]">{formatDurationShort(walkMin)}</span>
          </button>
        )}
      </div>
      {noBus && why && (
        <p
          role="status"
          className="flex items-start gap-1.5 rounded-xl border-2 border-[var(--warn)] bg-[var(--warn-bg)] px-3 py-2 text-sm text-[var(--warn)]"
        >
          <UiIcon name="warn" size={16} className="mt-0.5" />
          <span>
            <b>{t("Autobusom ani vlakom sa sem nedá.")}</b>{" "}
            {t("Pri štarte tejto cesty nepoznáme zastávku, preto plánujeme cestu autom. Ak chcete ísť autobusom, vyberte inú cestu so zastávkou.")}
          </span>
        </p>
      )}
      {noCar && why && (
        <p
          role="status"
          className="flex items-start gap-1.5 rounded-xl border-2 border-[var(--warn)] bg-[var(--warn-bg)] px-3 py-2 text-sm text-[var(--warn)]"
        >
          <UiIcon name="warn" size={16} className="mt-0.5" />
          <span>
            <b>{t("Autom sa sem nedá.")}</b>{" "}
            {t("Pri štarte tejto cesty nie je kde nechať auto, preto plánujeme cestu autobusom alebo vlakom. Ak chcete ísť autom, vyberte inú cestu s parkoviskom.")}
          </span>
        </p>
      )}
    </div>
  );
}
