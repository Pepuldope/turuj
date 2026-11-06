import { getAllTrails, getAllTripSlugs, getTripIndex } from "@/lib/tripFiles";
import { closureManager, closurePeriod } from "@/lib/closures";
import { BIG_TOWNS } from "@/lib/townTrips";
import { getTowns } from "@/lib/trips";
import { townGenitive } from "@/lib/townNames";
import { EN_TRIPS_AHEAD, SITE_DESCRIPTION, SITE_NAME, absoluteUrl } from "@/lib/site";

// A plain-text guide for AI assistants and AI search (the llms.txt proposal, llmstxt.org): what
// the site is, which pages answer which questions, and the best-known trips. Built once per deploy.
export const dynamic = "force-static";

const TOP = 40;

export async function GET() {
  const all = await getAllTrails();
  const trails = all.slice(0, TOP);
  // F8: the sitemap lists the main routes only; the other routes of a place (variants, /okruh) are reached from their main page.
  const mainCount = all.length;
  const totalCount = (await getAllTripSlugs()).length;
  const round = (n: number) => Math.round(n / 10) * 10;
  // Only a real date: when the pipeline last ran, as written in the trip index (empty = no line).
  const updated = (await getTripIndex()).generated_at.slice(0, 10);
  const towns = getTowns();
  const big = BIG_TOWNS.map((id) => towns.find((t) => t.id === id)).filter((t) => t !== undefined);
  const body = `# ${SITE_NAME}

> ${SITE_DESCRIPTION}

${SITE_NAME} is a free Slovak planner for one-day trips into the mountains and nature in Slovakia: castles, peaks, viewpoints, caves, tarns, waterfalls and gorges. For each trip it shows the walk (distance, climb, time), where to park, the nearest bus or train stop, entry fees, official trail closures (TANAP), and the latest time to set off to be back before dark. The site is in Slovak, with a full English version under [/en](${absoluteUrl("/en")}); place and trail names stay Slovak in both.

Data: OpenStreetMap (trails, parking, stops), Slovak train timetables (GTFS), TANAP closure notices, photos from Wikimedia Commons and Mapillary. Times are estimates; weather and fitness decide on the day.

Method (as on [About](${absoluteUrl("/o-nas")})): walking time follows the DIN 33466 norm (4 km/h on the flat, 300 m up and 500 m down per hour, rounded up to 15 minutes), 1.3 times longer with children; the latest departure is the sunset time on the day minus the walk and the way back. Closure rules are kept by hand, each with an official source and a date it was last checked; a trip without a rule shows "Stav chodníka neoverený" (trail status not checked), never "open".${updated ? `\n\nÚdaje aktualizované: ${updated}.` : ""}

## Pages

- [Home: trips that fit today from your start](${absoluteUrl("/")}): pick a start, a day and whether children come along.
- [Trips by town](${absoluteUrl("/vylety-z")}): one page per Slovak town with day trips within 90 minutes by car.
- [English version](${absoluteUrl("/en")}): the same pages under ${absoluteUrl("/en/...")}; English trip pages exist for the ${EN_TRIPS_AHEAD.toLocaleString("en")} best-known trips.
- Trip pages: ${absoluteUrl("/trasa/<slug>")}. About ${round(mainCount).toLocaleString("en")} places (main routes) are listed in the [sitemap](${absoluteUrl("/sitemap.xml")}); the other routes to the same places (about ${round(totalCount).toLocaleString("en")} pages in all) are linked from those main pages.
- [Sources and licences](${absoluteUrl("/zdroje")})
- [About](${absoluteUrl("/o-nas")})

## Trips from the biggest towns

${big.map((t) => `- [Výlety okolo ${townGenitive(t.id, t.name)}](${absoluteUrl(`/vylety-z/${t.id}`)})`).join("\n")}

## Best-known trips

${trails
  .map(({ trail, closures }) => {
    const shut = closures.length ? ` (zatvorené ${closures.map((c) => `${closurePeriod(c).replace(" do ", " – ")}, ${closureManager(c)}`).join("; ")})` : "";
    return `- [${trail.name}](${absoluteUrl(`/trasa/${trail.slug}`)})${trail.description ? `: ${trail.description}` : ""}${shut}`;
  })
  .join("\n")}
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
