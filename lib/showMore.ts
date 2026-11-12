/** What a folded list holds, for the "Zobraziť ďalšie …" button's Slovak plural. */
export type MoreKind = "places" | "routes" | "parking" | "stops";

/**
 * The button's text key for `n` hidden rows of `kind`: one, 2 to 4, or 5 and more
 * ("ďalšie miesto" / "ďalšie 3 miesta" / "ďalšie 5 miest"). Keys live in lib/en.ts; `{n}` is the count.
 */
export function moreKey(kind: MoreKind, n: number): string {
  const form = n === 1 ? 0 : n >= 2 && n <= 4 ? 1 : 2;
  return MORE[kind][form];
}

const MORE: Record<MoreKind, [string, string, string]> = {
  places: ["Zobraziť ďalšie miesto", "Zobraziť ďalšie {n} miesta", "Zobraziť ďalšie {n} miest"],
  routes: ["Zobraziť ďalšiu cestu", "Zobraziť ďalšie {n} cesty", "Zobraziť ďalšie {n} ciest"],
  parking: ["Zobraziť ďalšie parkovisko", "Zobraziť ďalšie {n} parkoviská", "Zobraziť ďalšie {n} parkovísk"],
  stops: ["Zobraziť ďalšiu zastávku", "Zobraziť ďalšie {n} zastávky", "Zobraziť ďalšie {n} zastávok"],
};
