"use client";

import { useT } from "@/lib/i18n";

/** How many rows a step's long list shows before "Zobraziť ďalšie". */
export const SHOWN = 3;

/**
 * Which of `total` rows a folded list shows: the first few, and every row in `keep` (the picked one,
 * the added ones) even when it is further down. Open, all of them.
 */
export function shownRows(total: number, open: boolean, keep: number[] = [], limit = SHOWN): number[] {
  const all = Array.from({ length: total }, (_, i) => i);
  if (open || total <= limit) return all;
  const kept = keep.filter((i) => i >= 0 && i < total);
  // The kept rows take places from the end of the first few, so the list stays at `limit` rows where it can.
  const first = all.slice(0, Math.max(0, limit - kept.filter((i) => i >= limit).length));
  return [...new Set([...first, ...kept])].sort((a, b) => a - b);
}

/** The quiet text button under a folded list: "Zobraziť ďalšie (3)" / "Zobraziť menej". */
export function ShowMore({ hidden, open, onToggle }: { hidden: number; open: boolean; onToggle: () => void }) {
  const t = useT();
  if (hidden <= 0 && !open) return null;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="min-h-10 w-fit cursor-pointer px-1 text-sm font-semibold text-[var(--accent)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
    >
      {open ? t("Zobraziť menej") : t("Zobraziť ďalšie ({n})", { n: hidden })}
    </button>
  );
}
