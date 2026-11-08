"use client";

import type { Closure } from "@/lib/types";
import { activeClosures } from "@/lib/closures";
import { formatDateSk } from "@/lib/format";
import { UiIcon } from "@/components/UiIcon";
import { useLang, useT } from "@/lib/i18n";

/**
 * One red line right at the Save and Navigate buttons: the planned day is a closed day.
 * The buttons stay active (the closure banner higher up explains it); this only makes sure the warning is where the thumb is.
 */
export function ClosureGuard({ closures, date }: { closures: Closure[]; date: string | null }) {
  const t = useT();
  const lang = useLang();
  if (!date || activeClosures(closures, date).length === 0) return null;
  return (
    <p className="flex items-start gap-1.5 rounded-xl bg-[var(--danger-bg)] p-3 text-sm font-semibold text-[var(--danger)]">
      <UiIcon name="warn" size={16} className="mt-0.5 shrink-0" />
      <span>
        {t("Chodník je v deň výletu ({date}) uzavretý", { date: formatDateSk(date, lang) })}. {t("Vyberte iný deň alebo iný výlet.")}
      </span>
    </p>
  );
}
