"use client";

import type { Fit, Timing } from "@/lib/reviewLimits";
import { useT } from "@/lib/i18n";
import type { ReviewAnswers } from "@/lib/sendReview";

const FIT_LABEL: [Fit, string][] = [
  ["popis", "Podľa popisu"],
  ["tazsie", "Ťažšie, ako sme čakali"],
  ["lahsie", "Ľahšie, ako sme čakali"],
];

const TIMING_LABEL: [Timing, string][] = [
  ["sedeli", "Sedeli"],
  ["dlhsie", "Trvalo nám to dlhšie"],
  ["kratsie", "Boli sme rýchlejší"],
];

export const NO_ANSWERS: ReviewAnswers = { stars: 0, fit: null, crowded: null, timing: null };

export const chip = (on: boolean) =>
  `rounded-full border px-3 py-1.5 text-[14px] font-semibold focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${on ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]" : "border-[var(--border)] bg-[var(--card-bg)]"}`;

/** The stars and the three choices of the quick review; with `detail` off only the stars (an old visit). */
export function ReviewFields({ value, onChange, detail }: { value: ReviewAnswers; onChange: (v: ReviewAnswers) => void; detail: boolean }) {
  const tx = useT();
  const { stars, fit, crowded, timing } = value;
  return (
    <>
      <div className="flex justify-center gap-1.5" role="radiogroup" aria-label={tx("Hviezdičky")}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={stars === n}
            aria-label={tx("{n} z 5", { n })}
            onClick={() => onChange({ ...value, stars: n })}
            className={`text-[38px] leading-none transition-transform active:scale-90 ${n <= stars ? "text-[#f5b301]" : "text-[var(--border)]"}`}
          >
            ★
          </button>
        ))}
      </div>
      {detail && (
        <>
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-bold text-[var(--muted)]">{tx("Trasa bola")}</span>
            <div className="flex flex-wrap gap-1.5">
              {FIT_LABEL.map(([f, label]) => (
                <button key={f} type="button" aria-pressed={fit === f} onClick={() => onChange({ ...value, fit: fit === f ? null : f })} className={chip(fit === f)}>
                  {tx(label)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-bold text-[var(--muted)]">{tx("Časy z nášho plánu")}</span>
            <div className="flex flex-wrap gap-1.5">
              {TIMING_LABEL.map(([t, label]) => (
                <button key={t} type="button" aria-pressed={timing === t} onClick={() => onChange({ ...value, timing: timing === t ? null : t })} className={chip(timing === t)}>
                  {tx(label)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-bold text-[var(--muted)]">{tx("Bolo tam veľa ľudí?")}</span>
            <div className="flex gap-1.5">
              {([true, false] as const).map((v) => (
                <button key={String(v)} type="button" aria-pressed={crowded === v} onClick={() => onChange({ ...value, crowded: crowded === v ? null : v })} className={chip(crowded === v)}>
                  {v ? tx("Áno") : tx("Nie")}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
