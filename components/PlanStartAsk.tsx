"use client";

import { useState } from "react";
import { StartPill, StartSheet } from "@/components/StartPill";
import { UiIcon } from "@/components/UiIcon";
import { useUserLocation } from "@/lib/userLocation";
import { useT } from "@/lib/i18n";

/**
 * Top of "Váš plán" (Peter, 2026-11-12): with no start the plan asks for it in a highlighted card, because the
 * ride, the departure and the time home all depend on it; with a start it is the quiet row again. Follows the state, no toggle.
 */
export function PlanStartAsk() {
  const { ready, start, status, message, locate } = useUserLocation();
  const [open, setOpen] = useState(false);
  const t = useT();
  if (!ready || start) return <StartPill quiet />;
  return (
    <>
      <section id="plan-start" aria-label={t("Odkiaľ vyrážate?")} className="flex scroll-mt-[calc(64px+env(safe-area-inset-top))] flex-col gap-3 rounded-[var(--radius-card)] border-[1.5px] border-[var(--accent)] bg-[var(--accent-soft)] p-4 lg:scroll-mt-3">
        <p className="flex items-center gap-2 text-base font-bold">
          <span className="text-[var(--accent)]">
            <UiIcon name="pin" size={20} />
          </span>
          {t("Odkiaľ vyrážate?")}
        </p>
        <p className="text-sm">{t("Dopočítame cestu autom, kedy vyraziť a kedy budete doma.")}</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={locate}
            disabled={status === "locating"}
            className="flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-[var(--accent)] px-4 text-[15px] font-bold text-[var(--accent-contrast)] transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-70"
          >
            <UiIcon name="pin" size={16} />
            {status === "locating" ? t("Hľadáme vašu polohu…") : t("Použiť moju polohu")}
          </button>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            className="flex min-h-11 cursor-pointer items-center justify-center rounded-full border border-[var(--accent)] bg-[var(--card-bg)] px-4 text-[15px] font-bold text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            {t("Vybrať mesto…")}
          </button>
        </div>
        {message && status !== "locating" && (
          <p role="alert" className="flex items-start gap-1.5 text-sm font-semibold text-[var(--warn)]">
            <UiIcon name="warn" size={14} className="mt-0.5" />
            {t(message)}
          </p>
        )}
      </section>
      {open && <StartSheet onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * One muted line at the top of a step while there is no start (Peter, 2026-11-12: every step's data depends on it a little):
 * what that step can't work out (already translated by the caller), and a link up to the card that asks.
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
    <p className="flex items-start gap-1.5 text-sm text-[var(--muted)]">
      <span className="mt-0.5 shrink-0 text-[var(--accent)]">
        <UiIcon name="pin" size={14} />
      </span>
      <span>
        {children}{" "}
        <button type="button" onClick={toCard} className="cursor-pointer font-semibold text-[var(--accent)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
          {t("Zadať, odkiaľ vyrážate")} ›
        </button>
      </span>
    </p>
  );
}
