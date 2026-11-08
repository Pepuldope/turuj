"use client";

import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n";

/** First Tab stop on the home page: jumps past the search, filters and map to the trip list (WCAG 2.4.1). */
export function SkipToTrips() {
  const t = useT();
  const path = usePathname();
  if (path !== "/" && path !== "/en") return null;
  return (
    <a
      href="#vylety"
      onClick={(e) => {
        // Focus the list itself (tabIndex -1) so the next Tab is the first trip.
        const list = document.getElementById("vylety");
        if (!list) return;
        e.preventDefault();
        list.focus();
      }}
      className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-2 focus-visible:left-2 focus-visible:z-[100] focus-visible:rounded-full focus-visible:border focus-visible:border-[var(--border)] focus-visible:bg-[var(--card-bg)] focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:font-semibold focus-visible:shadow-[var(--shadow-float)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
    >
      {t("Preskočiť na výlety")}
    </a>
  );
}
