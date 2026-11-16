"use client";

import { KIDS_PACE } from "@/lib/dayPlan";
import { DIFFICULTY_LABEL, formatDuration } from "@/lib/format";
import type { Difficulty } from "@/lib/types";
import { useTripSettings } from "@/lib/tripSettings";
import { formatKm, skippedNote, walkMinutes } from "@/lib/walkFacts";
import { useTripAccess } from "@/components/TripAccess";
import { UiIcon } from "@/components/UiIcon";
import { useLang, useT } from "@/lib/i18n";

interface Props {
  /** A loop: the length is round, not there and back. */
  loop: boolean;
  difficulty: Difficulty;
  familyFriendly: boolean;
}

/** Length, climb and walking time of the walk the day counts: from the parking or stop, at the group's pace. */
export function TripFacts({ loop, difficulty, familyFriendly }: Props) {
  const { walk, transit } = useTripAccess();
  const { withKids } = useTripSettings();
  const t = useT();
  const lang = useLang();
  return (
    <p className="font-data flex flex-wrap items-center gap-x-3.5 text-[17px]">
      <span className="inline-flex items-baseline gap-1">
        {formatKm(walk.m, lang)}
        <small className={small}>{t(loop ? "okruh" : "tam a späť")}</small>
      </span>
      <span className="inline-flex items-center gap-1">
        <UiIcon name="up" size={16} />
        {walk.ascentM} m
      </span>
      <span className="inline-flex items-center gap-1">
        <UiIcon name="clock" size={16} />
        {formatDuration(walkMinutes(walk, withKids))}
        {withKids && (
          // Plain to see that kids make the day longer (Peter, 2026-10-22).
          <span className="ml-0.5 rounded-full bg-[var(--warn-bg)] px-2 py-0.5 font-sans text-[12px] font-bold text-[var(--warn)]">+{Math.round((KIDS_PACE - 1) * 100)} % {t("s deťmi")}</span>
        )}
      </span>
      <span className="font-sans text-[13px] font-medium text-[var(--muted)]">{t("{level} obtiažnosť", { level: t(DIFFICULTY_LABEL[difficulty]).toLowerCase() })}</span>
      {familyFriendly && <span className="font-sans text-[13px] font-semibold text-[var(--ok)]">{t("aj pre deti")}</span>}
      {/* Only when the walk is shorter than the route's own start; "Aj s chôdzou…" said nothing (Peter, 2026-10-22). */}
      {walk.skipped && <span className="w-full font-sans text-[13px] text-[var(--muted)]">{t(skippedNote(transit, walk.approachMin))}</span>}
    </p>
  );
}

/** Words next to a number: what it counts. */
const small = "font-sans text-[12px] font-semibold text-[var(--muted)]";
