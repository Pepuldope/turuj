"use client";

import { UiIcon } from "@/components/UiIcon";
import { useT } from "@/lib/i18n";
import { moreKey } from "@/lib/showMore";
import type { MoreKind } from "@/lib/showMore";

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

/**
 * The button under a folded list: "Zobraziť ďalšie 5 miest" / "Zobraziť menej". A full-width tinted,
 * bordered control (not the filled accent, that is for the step's own action) so it is not missed.
 */
export function ShowMore({ kind, hidden, open, onToggle }: { kind: MoreKind; hidden: number; open: boolean; onToggle: () => void }) {
  const t = useT();
  if (hidden <= 0 && !open) return null;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-4 text-sm font-bold text-[var(--accent)] transition-colors hover:border-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] motion-reduce:transition-none"
    >
      {open ? t("Zobraziť menej") : t(moreKey(kind, hidden), { n: hidden })}
      <UiIcon name="chev" size={16} className={open ? "-rotate-90" : "rotate-90"} />
    </button>
  );
}
