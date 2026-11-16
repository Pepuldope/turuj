"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { UiIcon } from "@/components/UiIcon";
import { useLang, useT } from "@/lib/i18n";
import { langPath } from "@/lib/lang";
import { townOf } from "@/lib/townNames";
import type { Town } from "@/lib/tripSchema";

/**
 * The town page a trip was opened from: its tiles link with ?z=<town id> (components/TownTile.tsx).
 * Read after load, not from the server: the trip page is one cached page for every visitor.
 */
export function useTownParam(): Town | null {
  const pathname = usePathname();
  const [town, setTown] = useState<Town | null>(null);
  useEffect(() => {
    const z = new URLSearchParams(window.location.search).get("z");
    if (!z) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTown(null);
      return;
    }
    let live = true;
    import("@/lib/trips")
      .then(({ getTowns }) => live && setTown(getTowns().find((t) => t.id === z) ?? null))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [pathname]);
  return town;
}

/** "Všetky výlety" back home; opened from a town page, back to that town page instead (Peter, 15 Nov, C170). */
export function TripBackLink() {
  const t = useT();
  const lang = useLang();
  const town = useTownParam();
  return (
    <Link
      href={langPath(lang, town ? `/vylety-z/${town.id}` : "/")}
      className="inline-flex items-center gap-0.5 rounded-full border border-[var(--border)] bg-[var(--card-bg)]/90 px-3 py-1.5 text-sm font-semibold"
    >
      <UiIcon name="back" size={15} />
      {town ? t("Okolo {town}", { town: townOf(lang, town.id, town.name) }) : t("Všetky výlety")}
    </Link>
  );
}
