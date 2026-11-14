/**
 * "Čo si zbaliť": a short rule-based pack list for one trip. Advice, not a safety guarantee, and it never says the
 * trail is icy or in any state: the rules look only at the walk, the top height, the food/water places on it and the
 * calendar month. The month (not the day) keeps it the same for a whole cached month.
 */
import { tr } from "@/lib/lang";
import type { Lang } from "@/lib/lang";

export interface PackInput {
  /** 1-12, Slovak calendar month of the render. */
  month: number;
  /** Walk, minutes. */
  walkMin: number;
  topM: number | null;
  /** A spring, a hut or a food place on the walk itself. */
  waterOnWalk: boolean;
  /** A food place or hut on the walk itself. */
  foodOnWalk: boolean;
  familyFriendly: boolean;
  /** Latest start of this month in minutes after midnight (Slovak clock), from the month table; null = cannot finish by daylight. Undefined = table unknown. */
  latestStartMin?: number | null;
}

export interface PackItem {
  /** Short name for the folded teaser: "čelovka"; empty = not in the teaser. */
  short: string;
  /** The sentence in the open row. */
  text: string;
}

const HIGH_M = 1500;
const LONG_MIN = 240;
/** From this latest start (before 9:00) the walk fills most of the day's light. */
const EARLY_START_MIN = 9 * 60;

const winter = (m: number) => m === 11 || m === 12 || m <= 2;

/** The list: water and layers always, the rest by rule. */
export function packList(lang: Lang, i: PackInput): PackItem[] {
  const items: PackItem[] = [];
  const litres = Math.max(1, Math.round((i.walkMin / 60) * 0.5 * 2) / 2);
  const l = lang === "en" ? String(litres) : String(litres).replace(".", ",");
  items.push({ short: tr(lang, "voda"), text: tr(lang, "Vodu: rátajte asi {l} l na osobu a vrstvu oblečenia navyše, aj keď je dole teplo.", { l }) });

  const dark = winter(i.month) || i.latestStartMin === null || (i.latestStartMin !== undefined && i.latestStartMin < EARLY_START_MIN);
  if (dark) items.push({ short: tr(lang, "čelovka"), text: tr(lang, "Čelovku: dni sú krátke a pri dlhšom výlete sa vám môže zotmieť skôr, než čakáte.") });

  if (!i.waterOnWalk) items.push({ short: "", text: tr(lang, "V našich dátach nie je na trase prameň, chata ani bufet, vodu si preto vezmite celú z domu.") });

  if ((i.topM !== null && i.topM >= HIGH_M) || winter(i.month) || i.month === 3) {
    items.push({ short: tr(lang, "čiapka a rukavice"), text: tr(lang, "Teplé veci: čiapku, rukavice a pevnejšiu vrstvu. Hore býva chladnejšie a veternejšie, než je dole.") });
  }

  if (i.topM !== null && i.topM >= HIGH_M && (i.month >= 11 || i.month <= 4)) {
    items.push({ short: tr(lang, "nesmeky"), text: tr(lang, "Nesmeky alebo mačky podľa podmienok: pred výletom si overte aktuálny stav a počasie v oblasti.") });
  }

  if (i.walkMin >= LONG_MIN && !i.foodOnWalk) {
    items.push({ short: tr(lang, "jedlo"), text: tr(lang, "Jedlo na celý deň: výlet je dlhý a na trase sme nenašli občerstvenie.") });
  }

  if (i.familyFriendly) {
    items.push({ short: tr(lang, "desiata pre deti"), text: tr(lang, "S deťmi: desiatu a drobnosti na cestu, na dlhšie úseky sa hodí nosič.") });
  }
  return items;
}

/** "Voda, čelovka, čiapka a rukavice, nesmeky". */
export function packTeaser(items: PackItem[]): string {
  const s = items.map((x) => x.short).filter(Boolean).join(", ");
  return s.charAt(0).toLocaleUpperCase("sk") + s.slice(1);
}
