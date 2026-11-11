"use client";

import { useEffect, useState } from "react";
import { StartChip } from "@/components/StartChip";
import { UiIcon } from "@/components/UiIcon";
import { useUserLocation } from "@/lib/userLocation";
import { useT } from "@/lib/i18n";

/**
 * The trip page's first line under the header (Peter, 2026-10-19, option B): where the day is
 * planned from, and "Zmeniť štart" opening the same start picker as a panel from the bottom.
 */
export function StartPill({ quiet = false }: { /** One small muted line ("Štart: Žilina · zmeniť") for inside the plan card, not the round pill. */ quiet?: boolean } = {}) {
  const { start, ready } = useUserLocation();
  const [open, setOpen] = useState(false);
  const t = useT();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {quiet ? (
        <p className={`flex min-w-0 flex-wrap items-center gap-x-1 text-[13px] ${ready && !start ? "font-semibold" : "text-[var(--muted)]"}`}>
          {ready && start ? (
            <>
              <span>{t("Štart:")}</span>
              <span className="min-w-0 truncate font-semibold text-[var(--foreground)]">{t(start.label.split(",")[0])}</span>
              <span aria-hidden>·</span>
            </>
          ) : (
            <span>{ready ? t("Odkiaľ vyrážate?") : "…"}</span>
          )}
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            className="-my-2 inline-flex min-h-10 items-center px-1 font-bold text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          >
            {ready && !start ? t("Vybrať štart") : t("zmeniť")}
          </button>
        </p>
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
      {open && (
        <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={t("Odkiaľ vyrážate")}>
          <div className="absolute inset-0 bg-black/45" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-[20px] bg-[var(--card-bg)] px-4 pt-[18px] pb-[max(28px,env(safe-area-inset-bottom))] shadow-[var(--shadow-float)] lg:w-[460px]">
            <StartChip onDone={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
