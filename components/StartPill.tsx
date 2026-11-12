"use client";

import { useEffect, useRef, useState } from "react";
import { StartChip } from "@/components/StartChip";
import { UiIcon } from "@/components/UiIcon";
import { useUserLocation } from "@/lib/userLocation";
import { useT } from "@/lib/i18n";
import { useStartFlash } from "@/lib/startFlash";

/**
 * The trip page's first line under the header (Peter, 2026-10-19, option B): where the day is
 * planned from, and "Zmeniť štart" opening the same start picker as a panel from the bottom.
 */
export function StartPill({ quiet = false }: { /** A full-width start row ("Vyrážate z / Žilina / Zmeniť") for inside the plan card, not the round pill. */ quiet?: boolean } = {}) {
  const { start, ready, auto } = useUserLocation();
  const row = useRef<HTMLDivElement>(null);
  // Any start, not only one found by GPS: a start typed on an earlier visit is just as easy to forget (Peter, 2026-11-12).
  const flash = useStartFlash(quiet && !!start && (auto || start.source !== "gps"), row);
  const [open, setOpen] = useState(false);
  const t = useT();

  return (
    <>
      {quiet ? (
        // Where the day starts, as big as the home page's start row (Peter, 2026-11-11): a box above step 1.
        <div ref={row} className={`flex min-h-[60px] items-center gap-3 rounded-xl bg-[var(--segment-bg)] py-2 pr-1.5 pl-3 ${flash ? "start-flash" : ""}`}>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[var(--accent-soft)] text-[var(--accent)]">
            <UiIcon name="pin" size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <span className={`block leading-snug ${ready && !start ? "text-base font-bold" : "text-[12.5px] text-[var(--muted)]"}`}>
              {ready && start ? t("Vyrážate z") : ready ? t("Odkiaľ vyrážate?") : "…"}
              {ready && start?.source === "gps" && ` · ${t("vaša poloha")}`}
            </span>
            {ready && start && <strong className="block truncate text-lg leading-tight">{start.label.trim() ? t(start.label.split(",")[0]) : t("Vaša poloha")}</strong>}
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            className="min-h-10 shrink-0 cursor-pointer rounded-lg px-3 font-bold text-[var(--accent)] hover:bg-[var(--accent-soft)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          >
            {ready && !start ? t("Vybrať štart") : t("Zmeniť")}
          </button>
        </div>
      ) : (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="inline-flex max-w-full min-w-0 items-center gap-1.5 self-start rounded-full border border-[var(--border)] bg-[var(--card-bg)] py-1.5 pr-3.5 pl-2.5 text-sm font-semibold shadow-[var(--shadow-float)]"
      >
        <span className="shrink-0 text-[var(--accent)]">
          <UiIcon name="pin" size={16} />
        </span>
        <span className="min-w-0 truncate">
          <span className="font-medium text-[var(--muted)]">{t("Štart:")}</span> {ready && start ? t(start.label.split(",")[0]) : ready ? t("nevybraný") : "…"}
        </span>
        <span className="shrink-0 pl-1 font-bold text-[var(--accent)]">{ready && !start ? t("Vybrať štart") : t("Zmeniť štart")}</span>
      </button>
      )}
      {open && <StartSheet onClose={() => setOpen(false)} />}
    </>
  );
}

/** The start picker as a panel from the bottom (Escape or a tap outside closes it); the pill and the plan's "where from" card open the same one. */
export function StartSheet({ onClose }: { onClose: () => void }) {
  const t = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={t("Odkiaľ vyrážate")}>
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-[20px] bg-[var(--card-bg)] px-4 pt-[18px] pb-[max(28px,env(safe-area-inset-bottom))] shadow-[var(--shadow-float)] lg:w-[460px]">
        <StartChip onDone={onClose} />
      </div>
    </div>
  );
}
