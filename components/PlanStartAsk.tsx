"use client";

import { useState } from "react";
import { StartPill, StartSheet, focusStandIn } from "@/components/StartPill";
import { UiIcon } from "@/components/UiIcon";
import { PickStartMap } from "@/components/PickStartMap";
import { useUserLocation } from "@/lib/userLocation";
import { useT } from "@/lib/i18n";

/**
 * Top of "Váš plán" (Peter, 2026-11-12): with no start the plan asks for it in a highlighted card, because the
 * ride, the departure and the time home all depend on it; with a start it is the quiet row again. Follows the state, no toggle.
 */
export function PlanStartAsk() {
  const { ready, start, status, message, locate } = useUserLocation();
  const [open, setOpen] = useState(false);
  const [pickMap, setPickMap] = useState(false);
  const t = useT();
  if (!ready || start) return <StartPill quiet />;
  return (
    <>
      <section id="plan-start" aria-label={t("Odkiaľ vyrážate?")} className="flex scroll-mt-[calc(64px+env(safe-area-inset-top))] flex-col gap-3.5 rounded-[var(--radius-card)] border-[1.5px] border-[var(--accent)] bg-[var(--accent-soft)] p-[18px] lg:scroll-mt-3">
        <p className="flex items-center gap-2 text-base font-bold">
          <span className="text-[var(--accent)]">
            <UiIcon name="pin" size={20} />
          </span>
          {t("Odkiaľ vyrážate?")}
        </p>
        <p className="text-sm">{t("Dopočítame cestu autom, kedy vyraziť a kedy budete doma.")}</p>
        {/* Both buttons the card's full width, one under the other (Peter, 2026-11-14: odd sizes side by side). */}
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={locate}
            disabled={status === "locating"}
            className="flex min-h-12 w-full cursor-pointer items-center justify-center gap-1.5 rounded-full bg-[var(--accent)] px-4 text-[15px] font-bold text-[var(--accent-contrast)] transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-70"
          >
            <UiIcon name="pin" size={16} />
            {status === "locating" ? t("Hľadáme vašu polohu…") : t("Použiť moju polohu")}
          </button>
          {/* Looks like the search it opens (Peter, 16 Nov: "there is no start location search"). The sheet opens with
              the keyboard up: iPhone only raises it for a focus inside the tap, so a stand-in field takes the focus now and
              hands it to the sheet's field when that appears (StartSheet). */}
          <button
            type="button"
            onClick={() => {
              focusStandIn();
              setOpen(true);
            }}
            aria-haspopup="dialog"
            className="flex min-h-12 w-full cursor-text items-center gap-2 rounded-xl border-2 border-[var(--accent)] bg-[var(--card-bg)] px-3 text-left text-base text-[var(--muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            <span className="text-[var(--accent)]">
              <UiIcon name="search" size={18} />
            </span>
            {t("Napíšte mesto alebo obec")}
          </button>
          {/* A point on the map, right here too (Peter, 16 Nov): in the sheet it sat under the keyboard. */}
          <button
            type="button"
            onClick={() => setPickMap(true)}
            className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--accent)] bg-[var(--card-bg)]/60 text-sm font-semibold text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            <UiIcon name="pin" size={16} />
            {t("Vybrať bod na mape")}
          </button>
        </div>
        {message && status !== "locating" && (
          <p role="alert" className="flex items-start gap-1.5 text-sm font-semibold text-[var(--warn)]">
            <UiIcon name="warn" size={14} className="mt-0.5" />
            {t(message)}
          </p>
        )}
      </section>
      {open && <StartSheet onClose={() => setOpen(false)} focusSearch />}
      {pickMap && <PickStartMap onClose={() => setPickMap(false)} />}
    </>
  );
}

/**
 * A box at the top of a step while there is no start (Peter, 2026-11-12: every step's data depends on it a little):
 * what that step can't work out (already translated by the caller), and a button up to the card that asks.
 */
export function NoStartNote({ children }: { children: string }) {
  const { ready, start } = useUserLocation();
  const t = useT();
  if (!ready || start) return null;
  const toCard = () => {
    const card = document.getElementById("plan-start");
    if (!card) return;
    card.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    card.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
  };
  return (
    <div className="flex items-start gap-3 rounded-xl bg-[var(--accent-soft)] p-3">
      <span className="mt-0.5 shrink-0 text-[var(--accent)]">
        <UiIcon name="pin" size={18} />
      </span>
      <div className="flex min-w-0 flex-col items-start gap-2">
        <p className="text-sm text-[var(--foreground)]">{children}</p>
        <button type="button" onClick={toCard} className="min-h-10 cursor-pointer rounded-full bg-[var(--accent)] px-3 py-1.5 text-sm font-bold text-[var(--accent-contrast)] transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">
          {t("Zadať štart")}
        </button>
      </div>
    </div>
  );
}
