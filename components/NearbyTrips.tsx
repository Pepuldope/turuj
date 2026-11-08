import { formatDuration } from "@/lib/format";
import { langPath, tr } from "@/lib/lang";
import type { Lang } from "@/lib/lang";
import { NearbyList } from "@/components/NearbyList";
import type { NearbyItem } from "@/components/NearbyList";
import { monthDayOf } from "@/lib/closedToday";
import { closedSeason } from "@/lib/townTrips";
import { closureRulesFor } from "@/lib/trips";
import { roundKm } from "@/lib/nearbyTrips";
import type { Nearby } from "@/lib/nearbyTrips";

/**
 * "Ďalšie výlety v okolí": plain links to the nearest other places, with the walk and how far it is
 * from here. Server HTML, so every trip page links to its neighbours without JavaScript (C53).
 * Same separate cards as the question cards above (components/TripAnswers.tsx).
 */
export function NearbyTrips({ lang, items, walks }: { lang: Lang; items: Nearby[]; walks: Map<string, number> }) {
  if (items.length === 0) return null;
  // The yearly rule only (the page is built once): the browser decides which ones are closed today (NearbyList).
  const list: NearbyItem[] = items.map(({ trip, m }) => {
    const rule = closureRulesFor(trip).find((r) => r.kind === "rocna");
    const closed = closedSeason(trip);
    return {
      slug: trip.slug,
      href: langPath(lang, `/trasa/${trip.slug}`),
      name: trip.name,
      meta: `${formatDuration(walks.get(trip.slug) ?? trip.duration_min)} · ${tr(lang, "{km} km odtiaľto", { km: roundKm(m) })}`,
      chip: closed ? tr(lang, "zatvorené {when}", { when: closed }) : null,
      from: rule ? monthDayOf(rule.starts_on) : null,
      to: rule ? monthDayOf(rule.ends_on) : null,
    };
  });
  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-base font-semibold text-[var(--foreground)]">{tr(lang, "Ďalšie výlety v okolí")}</h2>
      <NearbyList lang={lang} items={list} />
    </section>
  );
}
