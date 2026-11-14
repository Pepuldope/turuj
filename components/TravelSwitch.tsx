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
  { value: "transit", label: "Bus / vlak", icon: "bus" },
];

/**
 * Car or public transport (and Pešo, when offered) as big selectable tiles (Peter, 2026-11-13, mockup D1): icon, label, the
 * travel time big and a small line under it. The plan, times and the way back follow. Remembered across visits, so the home
 * list follows it too. With no car park at the start (`noCar`) the car tile is greyed out with the warning and the bus is the
 * only choice, without changing what is remembered; tapping the greyed car says why. With no stop near the start (`noBus`) it is
 * the same the other way round.
 */
export function TravelSwitch({
  roadMin = null,
  trainMin = null,
  busPending = false,
  noCar = false,
  noBus = false,
  walkMin = null,
  walking = false,
  onWalk,
}: {
  roadMin?: number | null;
  trainMin?: number | null;
  /** The timetable or the route is still loading: the bus time would be a stand-in that then jumps, so none is shown yet. */
  busPending?: boolean;
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
  // With three tiles on a phone the time is a little smaller and the padding tighter.
  const pad = three ? "px-2.5 py-3 min-[400px]:px-3" : "px-3.5 py-3.5";
  const timeSize = three ? "text-[19px] min-[400px]:text-[22px]" : "text-[22px]";

  const tile = (key: string, o: { label: string; icon: UiIconName; time: string | null; on: boolean; onPick: () => void }) => (
    <button
      key={key}
      type="button"
      role="radio"
      aria-checked={o.on}
      onClick={o.onPick}
      className={`relative flex min-w-0 flex-col items-start gap-0.5 rounded-[14px] text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${pad} ${
        o.on ? "border-2 bg-[var(--accent-soft)] border-[var(--accent)]" : "border-[1.5px] border-[var(--border)] bg-[var(--card-bg)] hover:border-[var(--accent)]"
      }`}
    >
      {o.on && (
        <span aria-hidden="true" className="absolute top-2 right-2 grid h-[22px] w-[22px] place-items-center rounded-full bg-[var(--accent)] text-[var(--accent-contrast)]">
          <UiIcon name="check" size={14} />
        </span>
      )}
      <span className={o.on ? "text-[var(--accent)]" : "text-[var(--muted)]"}>
        <UiIcon name={o.icon} size={28} />
      </span>
      <span className="mt-1 text-base leading-tight font-bold text-[var(--foreground)]">{o.label}</span>
      {o.time && <span className={`font-data ${timeSize} leading-none font-semibold text-[var(--foreground)]`}>{o.time}</span>}
    </button>
  );

  return (
    <div className="flex flex-col gap-2">
      <div role="radiogroup" aria-label={t("Ako sa dopravíte")} className={`grid ${three ? "grid-cols-3" : "grid-cols-2"} gap-2`}>
        {OPTIONS.map((o) => {
          if ((noCar && o.value === "car") || (noBus && o.value === "transit"))
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={false}
                aria-disabled
                onClick={() => setWhy((w) => !w)}
                className={`flex min-w-0 cursor-help flex-col items-start gap-1 rounded-[14px] border-[1.5px] border-transparent bg-[var(--off-bg)] text-left text-[var(--off-fg)] ${pad}`}
              >
                <UiIcon name={o.icon} size={28} />
                <span className="mt-1 text-base leading-tight font-bold line-through">{t(o.label)}</span>
                {o.value === "car" ? <NoParkingChip /> : <NoStopChip />}
              </button>
            );
          const on = !walking && travel === o.value;
          const time =
            roadMin === null || (o.value === "transit" && busPending)
              ? null
              : o.value === "car"
                ? formatDurationShort(roadMin)
                : trainMin !== null
                  ? formatDurationShort(trainMin)
                  : `~${formatDurationShort(transitMinutes(roadMin))}`;
          return tile(o.value, {
            label: t(o.label),
            icon: o.icon,
            time,
            on,
            onPick: () => {
              onWalk?.(false);
              update({ travel: o.value });
            },
          });
        })}
        {walkMin !== null && tile("walk", { label: t("Pešo"), icon: "walker", time: formatDurationShort(walkMin), on: walking, onPick: () => onWalk?.(true) })}
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
