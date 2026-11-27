"use client";

import type { Closure } from "@/lib/types";
import { ClosureGuard } from "@/components/ClosureGuard";
import { shortDate } from "@/lib/days";
import { newestVerified, trailStatus } from "@/lib/trailStatus";
import { useLang, useT } from "@/lib/i18n";

const quiet = "rounded-xl border border-[var(--border)] bg-[var(--neutral-bg)] px-3 py-2 text-[13.5px] text-[var(--muted)]";

/**
 * The trail's status directly above the Save button (Peter's pick, 26 Nov 2026): a closure that day is the red
 * ClosureGuard; otherwise a quiet grey line that never reads as "open".
 */
export function TrailStatusLine({ closures, date }: { closures: Closure[]; date: string | null }) {
  const t = useT();
  const lang = useLang();
  const status = trailStatus(closures, date);
  if (status === null) return null;
  if (status === "closed") return <ClosureGuard closures={closures} date={date} />;
  if (status === "unverified") return <p className={quiet}>{t("Stav chodníka neoverený")}</p>;
  const verified = newestVerified(closures);
  return (
    <p className={quiet}>
      {t("Bez známej uzávery")} · {t("stav neoverený")}
      {verified && (
        <>
          {" "}
          · {t("overené")} <span className="font-data whitespace-nowrap text-base text-[var(--foreground)]">{shortDate(verified, lang)}</span>
        </>
      )}
    </p>
  );
}
