import { formatDistance, formatDuration, formatWalk, POI_LABEL } from "@/lib/format";
import type { Town, TripDetail } from "@/lib/tripSchema";
import type { TrailDetail } from "@/lib/types";
import { townGenitive } from "@/lib/townNames";
import type { WalkFacts } from "@/lib/walkFacts";

// "O výlete": a few Slovak sentences about one trip, written from its own facts (length, climb,
// heights, what the walk passes, parking, bus or train, the drive from the nearest town). Every
// trip gets its own text this way, for people and for search engines, without copying anyone's
// (Peter 2026-10-30: more descriptions for SEO; other sites' texts are theirs).

const DIFFICULTY: Record<TripDetail["difficulty"], string> = {
  lahka: "ľahká",
  stredna: "stredne náročná",
  tazka: "náročná",
};

const BY: Record<NonNullable<TripDetail["transit"]>["mode"], [string, string]> = {
  autobus: ["Autobusom", "zastávka"],
  elektricka: ["Električkou", "zastávka"],
  vlak: ["Vlakom", "stanica"],
};

/** "a, b a c" */
function list(items: string[]): string {
  return items.length > 1 ? `${items.slice(0, -1).join(", ")} a ${items[items.length - 1]}` : (items[0] ?? "");
}

export interface AboutInput {
  trip: TripDetail;
  detail: TrailDetail;
  /** The trip's nearest town page, and the car minutes from it (null = not known). */
  town: Town | null;
  driveMin: number | null;
  /** The walk as the page's facts and the meta description give it (from the default parking); null = the bare trail's numbers. */
  walk: WalkFacts | null;
}

/** The "O výlete" paragraphs, each a few sentences; empty facts are left out. */
export function aboutTrip({ trip, detail, town, driveMin, walk: facts }: AboutInput): string[] {
  const out: string[] = [];
  const loop = trip.route === "okruh";

  // The walk itself.
  const walk = [
    `Je to ${DIFFICULTY[trip.difficulty]} túra${loop ? " (okruh)" : " tam a späť"}: ${formatDistance(facts?.m ?? trip.distance_m)} a ${facts?.ascentM ?? trip.ascent_m} m stúpania, chôdza bez prestávok trvá asi ${formatDuration(facts?.min ?? trip.duration_min)}.`,
  ];
  const startEle = trip.start.ele_m;
  // The goal's own height wins over the terrain model's top, which can miss a sharp summit.
  const top = Math.max(trip.max_ele_m ?? 0, trip.destination.ele_m ?? 0) || null;
  if (startEle !== null && top !== null && top > startEle) {
    walk.push(`Štart je vo výške ${Math.round(startEle)} m n. m., najvyšší bod trasy ${Math.round(top)} m n. m.`);
  }
  if (trip.marked_share >= 0.9) walk.push("Takmer celá trasa vedie po značených turistických chodníkoch.");
  else if (trip.marked_share < 0.5) walk.push("Časť trasy vedie mimo značených chodníkov, mapa v mobile sa zíde.");
  if (trip.family_friendly) walk.push("Hodí sa aj pre rodiny s deťmi.");
  out.push(walk.join(" "));

  // Where it is and what the walk passes.
  const place: string[] = [];
  if (trip.region_name) {
    place.push(
      `Výlet je v oblasti ${trip.region_name}${trip.protected_area ? `, cieľ leží v chránenom území ${trip.protected_area}` : ""}.`
    );
  }
  const seen = new Set([trip.destination.name.toLowerCase()]);
  const passes: string[] = [];
  for (const p of detail.pois) {
    if (p.detour_min !== null || !p.name || p.kind === "obcerstvenie" || p.kind === "ihrisko") continue;
    const key = p.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    passes.push(`${POI_LABEL[p.kind].toLowerCase()} ${p.name}`);
    if (passes.length === 4) break;
  }
  if (passes.length) place.push(`Po ceste: ${list(passes)}.`);
  const food = detail.pois.some((p) => p.detour_min === null && (p.kind === "obcerstvenie" || p.kind === "chata"));
  if (food) place.push("Na trase sa dá aj občerstviť.");
  if (place.length) out.push(place.join(" "));

  // Getting there.
  const there: string[] = [];
  if (town && driveMin !== null && driveMin > 0) {
    there.push(`Z ${townGenitive(town.id, town.name)} je to autom asi ${formatDuration(driveMin)}.`);
  }
  const p = trip.parking;
  if (p) {
    const fee = p.fee === true ? " (platené)" : p.fee === false ? " (zadarmo)" : "";
    there.push(
      p.walk_m < 100
        ? `Parkovať sa dá priamo pri štarte${p.name ? `, na parkovisku ${p.name}` : ""}${fee}.`
        : `Najbližšie parkovisko${p.name ? ` (${p.name})` : ""} je ${formatWalk(p.walk_m)} od štartu${fee}.`
    );
  }
  const t = trip.transit;
  if (t) {
    const [by, stop] = BY[t.mode];
    there.push(`${by}: ${stop} ${t.name} je ${formatWalk(t.walk_m)} od štartu.`);
  }
  if (detail.fees.some((f) => f.kind === "vstupne")) there.push("Na trase sa platí vstupné.");
  if (detail.closures.length) there.push("Časť chodníkov je sezónne uzavretá, podrobnosti sú vyššie.");
  if (there.length) out.push(there.join(" "));

  return out;
}

const MAX_DESCRIPTION = 155;

/** The search-result text: the trip's facts in one line, under about 160 characters where it can. */
export function metaDescription(trip: TripDetail, facts: string): string {
  const how = [trip.parking ? "parkovanie" : null, trip.transit ? (trip.transit.mode === "vlak" ? "vlak" : "autobus") : null]
    .filter(Boolean)
    .join(", ");
  const start = trip.variant_of ? ` zo štartu ${trip.start.name}` : "";
  const where = trip.region_name ? ` (${trip.region_name})` : "";
  const head = `${trip.name}${start}${where}: ${facts}.`;
  // Search results cut at about 155 characters: the tail goes shorter, then away, on long names.
  for (const tail of [
    ` ${how ? `${how[0].toUpperCase()}${how.slice(1)}, ` : ""}kedy najneskôr vyraziť a stihnúť návrat za svetla.`,
    ` ${how ? `${how[0].toUpperCase()}${how.slice(1)} a ` : ""}čas návratu za svetla.`,
  ]) {
    if (head.length + tail.length <= MAX_DESCRIPTION) return head + tail;
  }
  return head;
}
