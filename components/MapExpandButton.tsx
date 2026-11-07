"use client";

import { UiIcon } from "@/components/UiIcon";
import { useT } from "@/lib/i18n";

/** Phones: opens a map in the page full screen (where it can be moved and zoomed) and closes it again. */
export function MapExpandButton({ full, onClick, side = "right" }: { full: boolean; onClick: () => void; side?: "left" | "right" }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      className={`absolute top-2.5 ${side === "left" ? "left-2.5" : "right-2.5"} z-[6] inline-flex h-12 items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card-bg)] px-3.5 text-[15px] font-bold shadow-[var(--shadow-float)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]`}
      style={full ? { top: "calc(10px + env(safe-area-inset-top))" } : undefined}
      aria-label={full ? t("Zavrieť mapu") : t("Celá mapa na celú obrazovku")}
    >
      {full ? <UiIcon name="close" size={16} /> : <UiIcon name="expand" size={20} />}
      {full ? t("Zavrieť") : t("Celá mapa")}
    </button>
  );
}
