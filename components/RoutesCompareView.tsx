import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { getRouteWalks, getTrip, withLoopRoutes } from "@/lib/tripFiles";
import { UiIcon } from "@/components/UiIcon";
import { RouteCompare } from "@/components/RouteCompare";
import { langPath, tr } from "@/lib/lang";
import type { Lang } from "@/lib/lang";

const loadTrip = cache((slug: string) => getTrip(slug));

export async function compareMetadata(slug: string, lang: Lang): Promise<Metadata> {
  const trip = await loadTrip(slug);
  return {
    title: trip ? tr(lang, "Cesty k cieľu: {name}", { name: trip.destination.name }) : tr(lang, "Trasa sa nenašla"),
    // The same routes as the trip pages: those are the ones to find in search.
    robots: { index: false },
  };
}

/** Every route to one place on one map, side by side, to pick from. */
export async function RoutesCompareView({ slug, lang }: { slug: string; lang: Lang }) {
  const trip = await loadTrip(slug);
  if (!trip) notFound();
  const base = trip.routes ?? [];
  if (base.length < 2) permanentRedirect(langPath(lang, `/trasa/${slug}`));
  // Loops are compared with the rest, each as its own route (Peter, 2026-10-24).
  const routes = await withLoopRoutes(base);
  const walks = await getRouteWalks(routes.map((r) => r.slug));

  return (
    <main className="flex flex-1 flex-col lg:h-dvh lg:flex-none lg:flex-row lg:overflow-hidden">
      <RouteCompare slug={slug} destination={trip.destination.name} goal={trip.destination.location} routes={routes} walks={walks}>
        <nav aria-label={tr(lang, "Navigácia")} className="flex items-center gap-3">
          <Link
            href={langPath(lang, `/trasa/${slug}`)}
            className="inline-flex items-center gap-0.5 rounded-full border border-[var(--border)] bg-[var(--card-bg)] px-3 py-1.5 text-sm font-semibold"
          >
            <UiIcon name="back" size={15} />
            {tr(lang, "Späť")}
          </Link>
          <h1 className="text-xl font-extrabold tracking-tight">{tr(lang, "Cesty k cieľu: {name}", { name: trip.destination.name })}</h1>
        </nav>
      </RouteCompare>
    </main>
  );
}
