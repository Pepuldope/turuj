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

/**
 * What the day map's lines and pins mean, right under it (Peter, 2026-11-13). The trail colours are the
 * ones the sun dial draws (lib/dayClock.ts trailColours), so they are named once, here, not in the dial.
 */
export function DayMapLegend({ colours, mode, stopKinds }: { colours: string[]; mode: DayModel["mode"]; stopKinds: PoiKind[] }) {
  const t = useT();
  const item = "inline-flex items-center gap-1.5";
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-[var(--muted)]" aria-label={t("Vysvetlivky mapy")}>
      {colours.map((c) => (
        <li key={c} className={item}>
          {/* White band under the colour, like the painted mark on the map. */}
          <svg width="16" height="8" aria-hidden="true">
            <line x1="2" x2="14" y1="4" y2="4" stroke="#fff" strokeWidth="7" strokeLinecap="round" />
            <line x1="2" x2="14" y1="4" y2="4" stroke={c} strokeWidth="3.4" strokeLinecap="round" />
          </svg>
          {t(WORD[c] ?? "bez značky")}
        </li>
      ))}
      {mode === "car" && (
        <li className={item}>
          <span className="font-data inline-flex h-[14px] w-[14px] items-center justify-center rounded-[4px] border border-white bg-[#1d4fa0] text-[10px] leading-none font-bold text-white">P</span>
          {t("parkovisko")}
        </li>
      )}
      {(mode === "bus" || mode === "train") && (
        <li className={item}>
          <span className="inline-flex h-[14px] w-[14px] items-center justify-center rounded-[4px] border border-[#1d3a6e] bg-white text-[#1d3a6e]">
            <UiIcon name={mode} size={10} />
          </span>
          {t("zastávka")}
        </li>
      )}
      {stopKinds.length > 0 && (
        <li className={item}>
          <span className="inline-flex gap-0.5" aria-hidden="true">
            {stopKinds.map((k) => (
              <span key={k} className="h-[14px] w-[14px] rounded-[4px] border border-white" style={{ background: POI_COLOUR[k] }} />
            ))}
          </span>
          {t(stopKinds.length > 1 ? "vaše zastávky" : "vaša zastávka")}
        </li>
      )}
      <li className={item}>
        <span className="inline-flex h-[14px] w-[14px] items-center justify-center rounded-full border border-white bg-[#1769d1] text-white">
          <UiIcon name="walker" size={10} />
        </span>
        {t("vy")}
      </li>
    </ul>
  );
}
