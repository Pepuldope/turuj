import Link from "next/link";
import { formatDuration } from "@/lib/format";
import { langPath, tr } from "@/lib/lang";
import type { Lang } from "@/lib/lang";
import { Nums } from "@/components/Nums";
import { UiIcon } from "@/components/UiIcon";
import { closedSeason } from "@/lib/townTrips";
import { roundKm } from "@/lib/nearbyTrips";
import type { Nearby } from "@/lib/nearbyTrips";

/**
 * "Ďalšie výlety v okolí": plain links to the nearest other places, with the walk and how far it is
 * from here. Server HTML, so every trip page links to its neighbours without JavaScript (C53).
 * Same separate cards as the question cards above (components/TripAnswers.tsx).
 */
export function NearbyTrips({ lang, items, walks }: { lang: Lang; items: Nearby[]; walks: Map<string, number> }) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-base font-semibold text-[var(--foreground)]">{tr(lang, "Ďalšie výlety v okolí")}</h2>
      <ul className="flex flex-col gap-2.5">
        {items.map(({ trip, m }) => {
          // The yearly rule only (the page is built once), same mark as the town tiles.
          const closed = closedSeason(trip);
          return (
            <li key={trip.slug} className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card-bg)] hover:border-[var(--accent)]">
              <Link href={langPath(lang, `/trasa/${trip.slug}`)} className="flex min-h-14 items-center gap-3 rounded-[var(--radius-card)] px-4 py-3">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-base font-semibold leading-snug text-[var(--foreground)]">{trip.name}</span>
                  <span className="text-sm leading-snug text-[var(--muted)]">
                    <Nums text={`${formatDuration(walks.get(trip.slug) ?? trip.duration_min)} · ${tr(lang, "{km} km odtiaľto", { km: roundKm(m) })}`} />
                  </span>
                  {closed && (
                    <span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-[var(--danger-bg)] px-2.5 py-1 text-xs font-semibold text-[var(--danger)]">
                      <UiIcon name="lock" size={12} />
                      {tr(lang, "zatvorené {when}", { when: closed })}
                    </span>
                  )}
                </span>
                <span className="text-[var(--muted)]">
                  <UiIcon name="chev" size={16} />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
