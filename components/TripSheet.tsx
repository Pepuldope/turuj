import Link from "next/link";
import { primaryTrailhead, routeWalk, sunLocation } from "@/lib/data";
import { pickWalk, stopsByWalk } from "@/lib/walkFacts";
import { gpxUrlFor } from "@/lib/gpx";
import { GpxDownload } from "@/components/GpxDownload";
import { getAllTrips, getCarWalks, getRouteWalks, getTownDrives, getTrip, getTripIndex, getTripPhoto, photoSource, withLoopRoutes } from "@/lib/tripFiles";
import type { PlacePhoto } from "@/lib/tripFiles";
import { aboutTrip } from "@/lib/describeSk";
import { buildProfile } from "@/lib/tripProfile";
import { GOAL_LABEL, POI_LABEL } from "@/lib/format";
import { kindSvg } from "@/lib/kindIcons";
import { GOAL_COLOUR, POI_COLOUR, ROUTE_COLOURS } from "@/lib/palette";
import { seasonOf } from "@/lib/season";
import { SeasonScene } from "@/components/SeasonScene";
import { UiIcon } from "@/components/UiIcon";
import { PoiList } from "@/components/PoiList";
import { StepMap } from "@/components/PlanStep";
import { ShorterRouteHint } from "@/components/RouteRows";
import { ClosureBanner } from "@/components/ClosureBanner";
import { isIndexedVariant, variantHeading } from "@/lib/variantTitles";
import { NearbyTrips } from "@/components/NearbyTrips";
import { nearestMainTrips, noYearlyClosure, withoutYearlyClosure } from "@/lib/nearbyTrips";
import { TripAnswers, TripHeaderFacts } from "@/components/TripAnswers";
import { TripPlanner } from "@/components/TripPlanner";
import { TripReviews } from "@/components/TripReviews";
import { SiteFooter } from "@/components/SiteFooter";
import { TripFacts } from "@/components/TripFacts";
import { TripMap } from "@/components/TripMap";
import type { OtherRoute } from "@/components/TripMap";
import { RoutesStep } from "@/components/RouteChoice";
import { TripAccessProvider } from "@/components/TripAccess";
import { JsonLd } from "@/components/JsonLd";
import { TrackEvent } from "@/components/TrackEvent";
import { TripSeenFlag } from "@/components/TripSeenFlag";
import { absoluteUrl } from "@/lib/site";
import type { RouteBrief, Town, TripDetail } from "@/lib/tripSchema";
import type { TrailDetail } from "@/lib/types";
import { LOOP_SUFFIX } from "@/lib/loopRoute";
import { nearestTown } from "@/lib/trips";
import { townOf } from "@/lib/townNames";
import { langPath, tr } from "@/lib/lang";
import type { Lang } from "@/lib/lang";
import { describeEn } from "@/lib/describeEn";
import { describeTripEn } from "@/lib/tripJsonLdEn";
import { markSigns } from "@/lib/markSigns";
import { startLines, subtitle } from "@/lib/tripAnswers";

/**
 * How many neighbours the "Ďalšie výlety v okolí" block holds in the HTML: the browser shows the first
 * seven that are not closed today and folds the closed ones away (components/NearbyList.tsx).
 */
const NEARBY_COUNT = 14;
/** Trips without a yearly closure the nearby list always has to offer (C70). */
const NEARBY_OPEN = 7;

/**
 * The photo as a schema.org ImageObject with the credit fields Google's image metadata reads (F17):
 * only for Commons photos, and only the fields the photo data has. Others stay a bare URL.
 */
function photoImage(photo: PlacePhoto) {
  if (photoSource(photo) !== "Wikimedia Commons") return photo.url;
  return {
    "@type": "ImageObject",
    contentUrl: photo.url,
    ...(photo.license_url ? { license: photo.license_url } : {}),
    acquireLicensePage: photo.page,
    ...(photo.author ? { creditText: `${photo.author}, ${photo.license}, Wikimedia Commons`, creator: { "@type": "Person", name: photo.author } } : {}),
  };
}

/** schema.org data: the trail as a place to visit + breadcrumbs (all trips > the nearest town's page > this one). */
function trailJsonLd(detail: TrailDetail, photo: PlacePhoto | null, town: Town | null, lang: Lang, about: string[], enDescription: string | null, updated: string | null) {
  const { trail } = detail;
  const url = absoluteUrl(langPath(lang, `/trasa/${trail.slug}`));
  const start = primaryTrailhead(detail)?.location;
  return {
    "@context": "https://schema.org",
    "@graph": [
      // dateModified belongs to the page (a Place has none): the day the trip data was built, never the day of the request.
      ...(updated
        ? [{ "@type": "WebPage", "@id": `${url}#page`, url, name: trail.name, inLanguage: lang, dateModified: updated, mainEntity: { "@id": `${url}#trail` } }]
        : []),
      {
        "@type": "TouristAttraction",
        "@id": `${url}#trail`,
        name: trail.name,
        url,
        // The page's own "O výlete" text when there is one (Slovak pages); English pages get an English line from the trip data (F18), else the short line.
        ...(about.length ? { description: about.join(" ") } : enDescription ? { description: enDescription } : trail.description ? { description: trail.description } : {}),
        image: photo ? photoImage(photo) : absoluteUrl("/og-image.png"),
        // Only when an entry fee is known; no known fee doesn't mean free.
        ...(detail.fees.some((f) => f.kind === "vstupne") ? { isAccessibleForFree: false } : {}),
        publicAccess: true,
        touristType: trail.family_friendly ? [tr(lang, "Rodiny s deťmi"), tr(lang, "Turisti")] : [tr(lang, "Turisti")],
        ...(start ? { geo: { "@type": "GeoCoordinates", latitude: start.lat, longitude: start.lon } } : {}),
        containedInPlace: { "@type": "Country", name: tr(lang, "Slovensko") },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: tr(lang, "Výlety"), item: absoluteUrl(langPath(lang, "/")) },
          ...(town
            ? [{ "@type": "ListItem", position: 2, name: tr(lang, "Okolo {town}", { town: townOf(lang, town.id, town.name) }), item: absoluteUrl(langPath(lang, `/vylety-z/${town.id}`)) }]
            : []),
          { "@type": "ListItem", position: town ? 3 : 2, name: trail.name, item: url },
        ],
      },
    ],
  };
}

/** A route as the route list names it, quoted inside a sentence: „Iným chodníkom“. */
function routeName(r: RouteBrief | undefined, lang: Lang): string {
  return lang === "en" ? `“${r?.route_label ?? tr(lang, "Hlavná cesta")}”` : `„${r?.route_label ?? "Hlavná cesta"}“`;
}

/** A second reason to go, from what the walk passes: a hut, a castle or a viewpoint. */
function secondGoal(detail: TrailDetail): "chata" | "hrad" | "vyhliadka" | null {
  const goal = detail.trail.goal;
  const kinds = new Set(detail.pois.filter((p) => p.detour_min === null).map((p) => p.kind));
  for (const k of ["chata", "hrad", "vyhliadka"] as const) if (k !== goal && kinds.has(k)) return k;
  return null;
}

function Badge({ colour, icon, children }: { colour: string; icon: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full py-1 pr-2.5 pl-1.5 text-[12.5px] font-bold text-white" style={{ background: `color-mix(in oklab, ${colour} 88%, #000)` }}>
      {/* Slightly deeper than the pin colour: white small text on it stays above 4.5:1. */}
      <span
        aria-hidden
        className="inline-flex"
        // Constant markup from lib/kindIcons.ts, no user data.
        dangerouslySetInnerHTML={{ __html: icon }}
      />
      {children}
    </span>
  );
}

/**
 * The trip page itself, for a route as it is (/trasa/<slug>) or walked as a loop, back down another
 * route from the same start (/trasa/<slug>/okruh, lib/loopRoute.ts).
 */
export async function TripSheet({ trip, detail, loopBack, lang = "sk" }: { trip: TripDetail; detail: TrailDetail; loopBack?: RouteBrief; lang?: Lang }) {

  const { trail, parkingLots, transitStops, closures, fees } = detail;
  const trailStart = primaryTrailhead(detail)?.location ?? null;
  const profile = buildProfile(trip);
  const gpxUrl = gpxUrlFor(trail.gpx_path);
  const sun = sunLocation(detail);
  const goal = trail.goal ?? "ine";
  const also = secondGoal(detail);
  const goalEle = trip?.destination.ele_m;
  const trailNumbers = { distance_m: trail.distance_m, ascent_m: trail.ascent_m, duration_min: trail.duration_min };
  // Other routes to the same place: listed under the facts, drawn faint on the map. They come
  // with the trip's own file (the database row doesn't carry them), never from the whole index.
  const baseRoutes =
    trip.routes ?? (trip.variant_of || trip.route_count ? ((await getTrip(trail.slug))?.routes ?? []) : []);
  // Loops (up one route, down another from the same start) are routes of their own in the list
  // and on the comparison map (lib/loopRoute.ts, Peter 2026-10-24).
  const routes = baseRoutes.length > 1 ? await withLoopRoutes(baseRoutes) : baseRoutes;
  const current = loopBack ? `${trail.slug}${LOOP_SUFFIX}` : trail.slug;
  const walks = routes.length > 1 ? await getRouteWalks(routes.map((r) => r.slug)) : {};
  // The place's photo from Wikimedia Commons, when there is one (Peter, 2026-10-22: photos on the planner).
  const photo = await getTripPhoto(trail.slug, trip.destination.osm);
  // The town page this trip belongs to: a link for people and search engines to more trips nearby.
  const town = nearestTown(trip.start.location);
  // "O výlete": a few sentences from this trip's own facts, Slovak pages only (lib/describeSk.ts).
  const about =
    lang === "sk" && !loopBack
      ? aboutTrip({ trip, detail, town, driveMin: town ? ((await getTownDrives(town.id))[trail.slug] ?? null) : null, walk: pickWalk(routeWalk(detail), false, parkingLots.length > 0) })
      : [];
  const description = loopBack
    ? tr(lang, "Okruh zo štartu {start}: hore po trase {up}, dole po trase {down}.", { start: trip.start.name, up: routeName(routes.find((r) => r.slug === trail.slug), lang), down: routeName(loopBack, lang) })
    : lang === "en"
      ? describeEn(trail.description) // Generated from the map data; a hand-written one stays out.
      : trail.description;
  // A loop has no GPX file: its maps draw the line from the trip itself.
  // The points where the walk changes trail marking: a KST sign on the map at each.
  const marks = markSigns(trip);
  const loopLine = loopBack ? trip.path.map(([lon, lat]) => [lat, lon] as [number, number]) : undefined;
  // The picked route keeps its colour from the route list and the comparison map (Peter, 2026-10-29);
  // the marking colours are on the signs. A place with one route keeps its marking colour.
  const ownIndex = routes.findIndex((r) => r.slug === current);
  const ownColour = routes.length > 1 && ownIndex >= 0 ? ROUTE_COLOURS[ownIndex % ROUTE_COLOURS.length] : undefined;
  const others: OtherRoute[] = routes
    .map((r, i) => ({
      slug: r.slug,
      label: r.route_label ?? r.start_name,
      points: r.up.map(([lon, lat]) => [lat, lon] as [number, number]),
      colour: ROUTE_COLOURS[i % ROUTE_COLOURS.length],
      // Loops, and the routes this loop is made of, would draw their lines twice: only on hover.
      hoverOnly: r.slug.endsWith(LOOP_SUFFIX) || r.slug === trail.slug || r.slug === loopBack?.slug,
    }))
    .filter((r) => r.slug !== current);

  // Each plan step that is about a place has its own map on phones, framed on that choice (components/PlanStep.tsx).
  const mapProps = { detail, gpxUrl, path: loopLine, others, loop: trip.route === "okruh", marks, colour: ownColour };
  const routeAt = Math.max(0, routes.findIndex((r) => r.slug === current));

  // Named for the route, as the route list calls it, when the place has several.
  const ownLabel = routes.length > 1 ? routes.find((r) => r.slug === trail.slug)?.route_label : null;
  const gpxName = ownLabel ? `${trail.name} (${ownLabel})` : trail.name;

  // The question sections (lib/tripAnswers.ts): the main page of a place and its start pages, not the loop.
  const ownWalk = pickWalk(routeWalk(detail), false, parkingLots.length > 0);
  const lines = startLines(lang, routes, walks, {
    slug: trail.slug,
    startName: trip.start.name,
    walk: ownWalk,
    fallback: { min: trail.duration_min, m: trail.distance_m, ascentM: trail.ascent_m },
  });
  // C53: the nearest other places as plain links (lib/nearbyTrips.ts). The index holds main routes only.
  const mains = await getAllTrips();
  const exclude = trip.variant_of ?? trail.slug;
  const nearest = nearestMainTrips(mains, trip.destination.location, exclude, NEARBY_COUNT);
  // C70: in a closed area (Kriváň in winter) most neighbours carry a yearly closure. Add the nearest trips that have
  // none, so the list can always show NEARBY_OPEN alternatives. Date-independent: the client splits by today.
  const nearby =
    nearest.filter((n) => noYearlyClosure(n.trip)).length >= NEARBY_OPEN
      ? nearest
      : [...new Map([...nearest, ...nearestMainTrips(withoutYearlyClosure(mains), trip.destination.location, exclude, NEARBY_OPEN)].map((n) => [n.trip.slug, n])).values()].sort((a, b) => a.m - b.m);
  // C39: an indexed variant gets its own H1, "Kriváň z Troch Studničiek" (lib/variantTitles.ts).
  const h1 = !loopBack && lang === "sk" && isIndexedVariant(trip, mains) ? variantHeading(trail.name, trip.start.name, "").h1 : trail.name;
  const nearbyWalks = await getCarWalks();
  const updated = (await getTripIndex()).generated_at.slice(0, 10) || null;

  return (
    <TripAccessProvider slug={trail.slug} parkingLots={parkingLots} transitStops={transitStops} trailStart={trailStart} trail={trailNumbers}>
      <main className="flex flex-1 flex-col bg-[var(--page-sunk)] lg:h-dvh lg:flex-none lg:flex-row lg:overflow-hidden">
        <JsonLd data={trailJsonLd(detail, photo, town, lang, about, lang === "en" ? describeTripEn(trip, detail) : null, loopBack ? null : updated)} />
        <TrackEvent name="trip_open" data={{ trail: trail.slug }} />
        <TripSeenFlag />
        <div className="mx-auto flex w-full max-w-[640px] flex-col gap-5 px-4 pt-4 pb-6 md:max-w-[760px] lg:mx-0 lg:w-[460px] lg:max-w-none lg:shrink-0 relative lg:overflow-y-auto lg:overscroll-contain">
          <header className="relative -mx-4 -mt-4 flex min-h-[220px] shrink-0 flex-col justify-between sm:overflow-hidden sm:rounded-b-[24px] lg:overflow-visible lg:rounded-none">
            {photo ? (
              <>
                {/* Plain img, no cookies or referrer to Wikimedia (as on town tiles). */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt={trail.name}
                  decoding="async"
                  fetchPriority="high"
                  crossOrigin="anonymous"
                  referrerPolicy="no-referrer"
                  width={photo.w}
                  height={photo.h}
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <span aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.25)_0%,rgba(0,0,0,0)_35%,rgba(0,0,0,.55)_100%)]" />
                <a
                  href={photo.page}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute right-2 bottom-1 z-10 max-w-[60%] truncate text-[10px] text-white/80 no-underline [text-shadow:0_1px_2px_rgba(0,0,0,.7)]"
                >
                  {tr(lang, "Foto")}: {photo.author}, {photo.license}, {photoSource(photo)}
                </a>
              </>
            ) : (
              <SeasonScene season={seasonOf(new Date())} width={460} height={220} seed={3} sunX={0.34} sunY={0.32} shade className="absolute inset-0 h-full w-full" />
            )}
            <nav aria-label={tr(lang, "Navigácia")} className="relative flex items-center justify-between gap-2 px-4 pt-4">
              <Link
                href={langPath(lang, "/")}
                className="inline-flex items-center gap-0.5 rounded-full border border-[var(--border)] bg-[var(--card-bg)]/90 px-3 py-1.5 text-sm font-semibold"
              >
                <UiIcon name="back" size={15} />
                {tr(lang, "Všetky výlety")}
              </Link>
            </nav>
            <div className="relative flex flex-col gap-1.5 px-4 pb-3.5 text-white">
              <div className="flex flex-wrap gap-1.5">
                <Badge colour={GOAL_COLOUR[goal]} icon={kindSvg(goal, 16)}>
                  {tr(lang, GOAL_LABEL[goal])}
                  {/* Peter: always the height, said as height ("277 m" alone read like a distance). */}
                  {goalEle ? ` · ${tr(lang, "{m} m n. m.", { m: goalEle })}` : ""}
                </Badge>
                {also && (
                  <Badge colour={POI_COLOUR[also]} icon={kindSvg(also, 16)}>
                    {tr(lang, "{kind} na trase", { kind: tr(lang, POI_LABEL[also]) })}
                  </Badge>
                )}
              </div>
              <h1 className={`${h1.length > 30 ? "text-[1.85rem]" : "text-[2.4rem]"} break-words leading-none font-extrabold tracking-tight [text-shadow:0_1px_3px_rgba(0,0,0,.45),0_1px_14px_rgba(0,0,0,.3)]`}>{h1}</h1>
              {!loopBack && <p className="text-[15px] leading-tight font-bold [text-shadow:0_1px_2px_rgba(0,0,0,.6),0_0_10px_rgba(0,0,0,.45)]">{subtitle(lang, trail.name, trip.destination.kind)}</p>}
              <p className="text-[13.5px] font-semibold [text-shadow:0_1px_2px_rgba(0,0,0,.6),0_0_10px_rgba(0,0,0,.45)]">
                {[trail.region_name, trip ? tr(lang, "štart {name}", { name: trip.start.name }) : null].filter(Boolean).join(" · ")}
              </p>
            </div>
          </header>

          <TripPlanner
            tanap={trail.region_name === "Tatry"}
            slug={trail.slug}
            name={trail.name}
            difficulty={trail.difficulty}
            familyFriendly={trail.family_friendly}
            sun={sun}
            goal={{
              lat: trip.destination.location.lat,
              lon: trip.destination.location.lon,
              ele: trip.destination.ele_m,
              name: trip.destination.name,
            }}
            profile={profile}
            gpxUrl={gpxUrl}
            bbox={trail.bbox}
            closures={closures}
            hasPlaces={detail.pois.length > 0}
            routeCount={routes.length}
            routesStep={routes.length > 1 ? <RoutesStep key="routes-step" n={2} slug={current} routes={routes} walks={walks} map={<StepMap key="routes" {...mapProps} focus="routes" />} /> : null}
            accessMap={<StepMap key="access" {...mapProps} focus="access" />}
            placesMap={detail.pois.length > 0 ? <StepMap key="places" {...mapProps} focus="places" /> : null}
            places={<PoiList key="places-list" pois={detail.pois} slug={trail.slug} loop={trip.route === "okruh"} />}
            intro={
              <>
                <div className="flex flex-col gap-2">
                  <TripFacts
                    loop={trip.route === "okruh"}
                    difficulty={trail.difficulty}
                    familyFriendly={trail.family_friendly}
                  />
                  {description && <p className="text-sm text-[var(--muted)]">{description}</p>}
                  <TripReviews slug={trail.slug} name={trail.name} />
                </div>
                {routes.length > 1 && <ShorterRouteHint routes={routes} at={routeAt} walks={walks} />}
                {!loopBack && (
                  <TripHeaderFacts
                    lang={lang}
                    walk={ownWalk}
                    starts={[...new Set(lines.map((l) => l.label))]}
                    parking={parkingLots[0] ?? null}
                    stops={stopsByWalk(transitStops)}
                    closures={closures}
                    updated={updated}
                    only="closure"
                  />
                )}
                {/* A real closure stays up top; "no data" is a quiet note under the map. The closure rule itself is in the "Uzávery a poplatky" section below. */}
                {closures.length > 0 && <ClosureBanner closures={closures} region={trail.region_name} />}
              </>
            }
            outro={
              <TripAnswers
                lang={lang}
                name={trail.name}
                kind={trip.destination.kind}
                startName={trip.start.name}
                lines={lines}
                loop={trip.route === "okruh"}
                parking={parkingLots[0] ?? null}
                stops={stopsByWalk(transitStops)}
                closures={closures}
                fees={fees}
                sunAt={sun}
                walkMin={ownWalk?.min ?? trail.duration_min}
                closuresOnly={!!loopBack}
                about={about}
                region={trail.region_name}
                gpx={gpxUrl ? <GpxDownload gpxUrl={gpxUrl} slug={trail.slug} name={gpxName} row /> : null}
              />
            }
            trail={{
              path: trip.path.map(([lon, lat, ele]) => [+lon.toFixed(5), +lat.toFixed(5), ele === null ? null : Math.round(ele)]),
              marking_runs: trip.marking_runs,
              turnaround_index: trip.turnaround_index,
              route: trip.route,
              duration_min: trip.duration_min,
              goal: trip.destination.name,
              bbox: trail.bbox,
            }}
            walk={{ points: trip.path.map(([lon, lat]) => [+lat.toFixed(5), +lon.toFixed(5)]), loop: trip.route === "okruh" }}
          >
            {closures.length === 0 && <ClosureBanner closures={closures} region={trail.region_name} />}
          </TripPlanner>

          {town && (
            <Link href={langPath(lang, `/vylety-z/${town.id}`)} className="accent-on-sunk w-fit text-sm font-semibold">
              {tr(lang, "Ďalšie výlety okolo {town}", { town: townOf(lang, town.id, town.name) })} →
            </Link>
          )}

          <NearbyTrips lang={lang} items={nearby} walks={nearbyWalks} />

          {/* C2: something wrong on this trip (closed trail, car park, photo) goes straight to us. */}
          <Link
            href={langPath(lang, `/nahlasit-chybu?vylet=${trail.slug}&nazov=${encodeURIComponent(trail.name)}`)}
            className="w-fit text-sm text-[var(--muted)] underline"
          >
            {tr(lang, "Nesedí tu niečo? Nahlásiť chybu")}
          </Link>

          <SiteFooter />
        </div>

        <div className="hidden lg:sticky lg:top-0 lg:block lg:h-dvh lg:flex-1 lg:border-l lg:border-[var(--border)]">
          <TripMap detail={detail} gpxUrl={gpxUrl} path={loopLine} others={others} loop={trip.route === "okruh"} marks={marks} colour={ownColour} />
        </div>
      </main>
    </TripAccessProvider>
  );
}
