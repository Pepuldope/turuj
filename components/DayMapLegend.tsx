"use client";

import { UiIcon } from "@/components/UiIcon";
import { UNMARKED_COLOUR } from "@/lib/dayClock";
import type { DayModel } from "@/lib/dayClock";
import { MARKING_COLOR, MARKING_LABEL } from "@/lib/mapLayers";
import { POI_COLOUR } from "@/lib/palette";
import { useT } from "@/lib/i18n";
import type { PoiKind } from "@/lib/tripSchema";

/** The trail colour as the legend names it ("po žltej"). */
const WORD = Object.fromEntries([
  ...(Object.keys(MARKING_COLOR) as (keyof typeof MARKING_COLOR)[]).map((k) => [MARKING_COLOR[k], MARKING_LABEL[k]]),
  [UNMARKED_COLOUR, "bez značky"],
]) as Record<string, string>;

/** The ride entry, by way of travel. */
const RIDING: Partial<Record<DayModel["mode"], string>> = { train: "vo vlaku", bus: "v autobuse", car: "v aute" };

/**
 * What the day map's lines and pins mean, right under it (Peter, 2026-11-13). The trail colours are the
 * ones the sun dial draws (lib/dayClock.ts trailColours), so they are named once, here, not in the dial.
 * One legend for the map and the sun dial under them (Peter, 2026-11-13): the dial's entries live here too.
 */
export function DayMapLegend({
  colours,
  mode,
  stopKinds,
  map = true,
  sun = false,
  hasDrive = false,
  late = false,
}: {
  colours: string[];
  mode: DayModel["mode"];
  stopKinds: PoiKind[];
  /** The day map is above (its trail colours, parking, stops and "vy" are listed). */
  map?: boolean;
  /** The sun dial is part of the block (its "dráha slnka" and, when the walk ends after sunset, "po západe slnka" are listed). */
  sun?: boolean;
  /** There is a ride (drawn as the dark line on the map and as the dial's car bar). */
  hasDrive?: boolean;
  /** The walk ends after sunset. */
  late?: boolean;
}) {
  const t = useT();
  const item = "inline-flex items-center gap-1.5";
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-[var(--muted)]" aria-label={t("Vysvetlivky mapy")}>
      {map && colours.map((c) => (
        <li key={c} className={item}>
          {/* White band under the colour, like the painted mark on the map. */}
          <svg width="16" height="8" aria-hidden="true">
            <line x1="2" x2="14" y1="4" y2="4" stroke="#fff" strokeWidth="7" strokeLinecap="round" />
            <line x1="2" x2="14" y1="4" y2="4" stroke={c} strokeWidth="3.4" strokeLinecap="round" />
          </svg>
          {t(WORD[c] ?? "bez značky")}
        </li>
      ))}
      {map && mode === "car" && (
        <li className={item}>
          <span className="font-data inline-flex h-[14px] w-[14px] items-center justify-center rounded-[4px] border border-white bg-[#1d4fa0] text-[10px] leading-none font-bold text-white">P</span>
          {t("parkovisko")}
        </li>
      )}
      {map && (mode === "bus" || mode === "train") && (
        <li className={item}>
          <span className="inline-flex h-[14px] w-[14px] items-center justify-center rounded-[4px] border border-[#1d3a6e] bg-white text-[#1d3a6e]">
            <UiIcon name={mode} size={10} />
          </span>
          {t("zastávka")}
        </li>
      )}
      {map && stopKinds.length > 0 && (
        <li className={item}>
          <span className="inline-flex gap-0.5" aria-hidden="true">
            {stopKinds.map((k) => (
              <span key={k} className="h-[14px] w-[14px] rounded-[4px] border border-white" style={{ background: POI_COLOUR[k] }} />
            ))}
          </span>
          {t(stopKinds.length > 1 ? "vaše zastávky" : "vaša zastávka")}
        </li>
      )}
      {map && (
        <li className={item}>
          <span className="inline-flex h-[14px] w-[14px] items-center justify-center rounded-full border border-white bg-[#1769d1] text-white">
            <UiIcon name="walker" size={10} />
          </span>
          {t("vy")}
        </li>
      )}
      {sun && late && (
        <li className={item}>
          <svg width="16" height="6" aria-hidden="true"><line x1="1.5" x2="14.5" y1="3" y2="3" stroke="#9a4a06" strokeWidth="2.6" strokeDasharray="3 2" /></svg>
          {t("po západe slnka")}
        </li>
      )}
      {hasDrive && mode !== "foot" && (
        <li className={item}>
          <svg width="16" height="8" aria-hidden="true"><rect x="0.5" y="0.5" width="15" height="7" rx="3.5" fill="#14233b" stroke="var(--foreground)" strokeWidth="1" /><line x1="4" x2="12" y1="4" y2="4" stroke="#fff" strokeWidth="1.2" strokeDasharray="1.6 2" /></svg>
          {t(RIDING[mode] ?? "v aute")}
        </li>
      )}
      {sun && (
        <li className={item}>
          <svg width="16" height="6" aria-hidden="true"><line x1="1.5" x2="14.5" y1="3" y2="3" stroke="#e08a00" strokeWidth="1.7" strokeDasharray="2.5 2.5" /></svg>
          {t("dráha slnka")}
        </li>
      )}
    </ul>
  );
}
