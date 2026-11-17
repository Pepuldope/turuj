"use client";

import { useId, useState } from "react";
import { STAY_MAX, STAY_STEP } from "@/lib/goalStay";
import type { StayDefault } from "@/lib/goalStay";
import { GOAL_LABEL } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { DestinationKind } from "@/lib/tripSchema";

/**
 * "Čas v cieli" at the top of step 2 (C190, Peter 17 Nov): how long you stay at the goal, a field that looks
 * editable like the start time in step 4, because it moves the whole day (back home, sunset). − and + step by
 * 5 min; the number can be typed too. Under it: where the default comes from, and "Vrátiť" once changed.
 */
export function GoalStayRow({
  min,
  changed,
  fallback,
  kind,
  onSet,
  onReset,
}: {
  min: number;
  changed: boolean;
  fallback: StayDefault;
  kind: DestinationKind;
  onSet: (min: number) => void;
  onReset: () => void;
}) {
  const t = useT();
  const id = useId();
  const [typed, setTyped] = useState<string | null>(null);
  const commit = () => {
    if (typed === null) return;
    const n = parseInt(typed, 10);
    if (Number.isFinite(n)) onSet(n);
    setTyped(null);
  };
  const step = (dir: 1 | -1) => onSet(Math.max(0, Math.min(STAY_MAX, (Math.round(min / STAY_STEP) + dir) * STAY_STEP)));
  const btn =
    "grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-lg text-[1.5rem] leading-none font-bold text-[var(--accent)] transition-colors hover:bg-[var(--segment-bg)] focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:cursor-default disabled:opacity-35";
  const g = fallback.guided;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="shrink-0 text-[15px] font-bold whitespace-nowrap">
          {t("Čas v cieli")}
        </label>
        <span className="flex max-w-[11rem] min-w-0 flex-1 items-center overflow-hidden rounded-xl border border-[var(--card-edge)] bg-[var(--card-bg)] p-0.5 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-[var(--accent)]">
          <button type="button" className={btn} onClick={() => step(-1)} disabled={min <= 0} aria-label={t("O 5 minút kratšie")}>
            −
          </button>
          <span className="flex min-w-0 flex-1 items-baseline justify-center gap-1">
            <input
              id={id}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={typed ?? String(min)}
              onChange={(e) => setTyped(e.target.value.replace(/\D/g, "").slice(0, 3))}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                  e.preventDefault();
                  step(e.key === "ArrowUp" ? 1 : -1);
                }
              }}
              // 16 px at least: an iPhone zooms into a smaller-text field when it is tapped.
              className="font-data w-[3ch] min-w-0 bg-transparent text-right text-[1.45rem] leading-tight font-semibold outline-none min-[380px]:text-[1.6rem]"
            />
            <span className="text-[15px] font-semibold text-[var(--muted)]">min</span>
          </span>
          <button type="button" className={btn} onClick={() => step(1)} disabled={min >= STAY_MAX} aria-label={t("O 5 minút dlhšie")}>
            +
          </button>
        </span>
      </div>
      <p className="text-[13px] leading-snug text-[var(--muted)]">
        {g
          ? g.wait > 0
            ? t("Prehliadka {tour} min a čakanie na vstup asi {wait} min ({source}).", { tour: String(g.tour), wait: String(g.wait), source: t(g.source) })
            : t("Prehliadka asi {tour} min ({source}).", { tour: String(g.tour), source: t(g.source) })
          : t("Odhad podľa typu cieľa ({kind}). Nastavte si, koľko tam chcete byť.", { kind: t(GOAL_LABEL[kind]).toLowerCase() })}{" "}
        {t("Ráta sa do návratu a západu slnka.")}
        {changed && (
          <>
            {" "}
            <button type="button" onClick={onReset} className="cursor-pointer font-semibold text-[var(--accent)] underline underline-offset-2">
              {t("Vrátiť na {min} min", { min: String(fallback.min) })}
            </button>
          </>
        )}
      </p>
    </div>
  );
}
