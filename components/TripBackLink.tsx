"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { backClick, useCameFrom } from "@/components/CameFrom";
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

/**
 * Back to the page the trip was opened from, by its name: another trip, a town page, the list (Peter,
 * 25 Nov 2026, C219). Opened directly: "Všetky výlety" home, or the town of a ?z= link (Peter, 15 Nov, C170).
 */
export function TripBackLink() {
  const t = useT();
  const lang = useLang();
  const town = useTownParam();
  const from = useCameFrom();
  return (
    <Link
      href={from ? from.href : langPath(lang, town ? `/vylety-z/${town.id}` : "/")}
      onClick={from ? (e) => backClick(e, from) : undefined}
      // Below lg the top bar's two round buttons lie over the right end of this row: a long name stops short of them.
      className="inline-flex max-w-[calc(100%-6rem)] min-w-0 items-center gap-0.5 rounded-full lg:max-w-full border border-[var(--border)] bg-[var(--card-bg)]/90 px-3 py-1.5 text-sm font-semibold"
    >
      <UiIcon name="back" size={15} className="shrink-0" />
      <span className="truncate">{from ? from.label : town ? t("Okolo {town}", { town: townOf(lang, town.id, town.name) }) : t("Všetky výlety")}</span>
    </Link>
  );
}
