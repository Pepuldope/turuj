import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { trailDetailFrom } from "@/lib/data";
import { getLoop, getTrip } from "@/lib/tripFiles";
import { TripSheet } from "@/components/TripSheet";
import { langPath, tr } from "@/lib/lang";
import type { Lang } from "@/lib/lang";

const loadLoop = cache(async (slug: string) => {
  const loop = await getLoop(slug);
  return loop ? { ...loop, detail: trailDetailFrom(loop.trip) } : null;
});

export async function loopMetadata(slug: string, lang: Lang): Promise<Metadata> {
  const loop = await loadLoop(slug);
  return {
    title: loop ? tr(lang, "{name} – okruh", { name: loop.trip.name }) : tr(lang, "Trasa sa nenašla"),
    // The trip page itself is the one to find in search.
    robots: { index: false },
  };
}

export async function LoopTrip({ slug, lang }: { slug: string; lang: Lang }) {
  const loop = await loadLoop(slug);
  if (!loop) {
    if (await getTrip(slug)) permanentRedirect(langPath(lang, `/trasa/${slug}`));
    notFound();
  }
  return <TripSheet trip={loop.trip} detail={loop.detail} loopBack={loop.back} lang={lang} />;
}
