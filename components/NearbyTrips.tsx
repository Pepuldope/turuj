import Link from "next/link";
import { formatDuration } from "@/lib/format";
import { langPath, tr } from "@/lib/lang";
import type { Lang } from "@/lib/lang";
import { closedSeason } from "@/lib/townTrips";
import { roundKm } from "@/lib/nearbyTrips";
import type { Nearby } from "@/lib/nearbyTrips";

/**
 * "Ďalšie výlety v okolí": plain links to the nearest other places, with the walk and how far it is
 * from here. Server HTML, so every trip page links to its neighbours without JavaScript (C53).
 */
export function NearbyTrips({ lang, items, walks }: { lang: Lang; items: Nearby[]; walks: Map<string, number> }) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-1.5 text-sm">
      <h2 className="text-base font-bold">{tr(lang, "Ďalšie výlety v okolí")}</h2>
      <ul className="flex flex-col gap-1">
        {items.map(({ trip, m }) => {
          // The yearly rule only (the page is built once), same mark as the town tiles.
          const closed = closedSeason(trip);
          return (
            <li key={trip.slug}>
              <Link href={langPath(lang, `/trasa/${trip.slug}`)} className="font-semibold text-[var(--accent)] underline">
                {trip.name}
              </Link>
              <span className="text-[var(--muted)]">
                {" · "}
                {formatDuration(walks.get(trip.slug) ?? trip.duration_min)}
                {" · "}
                {tr(lang, "{km} km odtiaľto", { km: roundKm(m) })}
              </span>
              {closed && (
                <span className="font-semibold text-[var(--danger)]">
                  {" · "}
                  {tr(lang, "zatvorené {when}", { when: closed })}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
