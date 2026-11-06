/**
 * Slovak case endings for place names, hand-rolled and CONSERVATIVE: a wrong ending ("na Babia horu")
 * reads worse than a plain label, so every function says how sure it is and the caller falls back
 * ("Túra: {name}") whenever it is not. Names of places are not run through a general declension:
 * only the shapes below are handled, everything else is `confident: false`.
 *
 * Accusative after "na" (to a peak, castle, tarn…) and genitive after "do" (into a cave, a valley)
 * are here. A later change adds the genitive "z {štartu}" to this same module: `adjGen` and the
 * head-noun lookup already do the adjective + feminine-noun part it needs.
 *
 * The one fact the accusative rests on: only a FEMININE SINGULAR noun in -a and the adjectives
 * agreeing with it change (Babia hora -> Babiu horu). Masculine inanimate nouns (Kriváň, Inovec,
 * "Trenčiansky hrad"), neuter nouns (pleso, jazero) and plurals (Skalice, Kamenné vráta) keep their
 * nominative form, which is why a place name is an accusative of itself in most cases.
 */
import type { DestinationKind } from "@/lib/tripSchema";

export interface Phrase {
  /** The preposition that goes with the name ("na", "do"); null when not confident. */
  prep: "na" | "do" | null;
  /** The name in the case that preposition takes; the name as given when not confident. */
  text: string;
  confident: boolean;
}

type Gender = "f" | "m" | "n";

/** Common place nouns with their gender (lowercase), the head of a name like "Hrad Vršatec" or "Biela skala". */
const HEADS: Record<string, Gender> = {
  chata: "f",
  vyhliadka: "f",
  rozhľadňa: "f",
  hora: "f",
  hoľa: "f",
  skala: "f",
  búda: "f",
  hrad: "m",
  vrch: "m",
  vrchol: "m",
  štít: "m",
  tajch: "m",
  vodopád: "m",
  ľadopád: "m",
  chrbát: "m",
  kopec: "m",
  hrb: "m",
  kameň: "m",
  stolec: "m",
  pleso: "n",
  jazero: "n",
  hradisko: "n",
  sedlo: "n",
  bralo: "n",
  // Neuter plurals that end in -a and must not be taken for a feminine singular.
  vráta: "n",
  mestá: "n",
  bradlá: "n",
  brehá: "n",
};

/** Nouns for which "na" is the wrong preposition (a cave, a valley, a gorge): such a name under an "na" kind is not confident. */
const NOT_FOR_NA = new Set(["jaskyňa", "dolina", "roklina", "tiesňava", "prielom", "diera", "diery", "jaskyne", "úval"]);

/** Genitive of the feminine nouns after "do" (into a cave, a valley), by kind. */
const GENITIVE_HEADS: Partial<Record<DestinationKind, Record<string, string>>> = {
  jaskyna: { jaskyňa: "jaskyne" },
  roklina: { dolina: "doliny", roklina: "rokliny", tiesňava: "tiesňavy" },
};

const PREPOSITIONS = new Set([
  "na", "nad", "pod", "pri", "v", "vo", "za", "zo", "z", "od", "do", "medzi", "po", "u", "k", "ku", "okolo", "cez", "pred", "bez", "o", "s", "so", "pre", "popri",
]);

const lower = (w: string) => w.toLocaleLowerCase("sk");
const isPrep = (w: string) => PREPOSITIONS.has(lower(w));
/** An adjective (or noun) in the feminine singular nominative: Veľká, Biela, Babia, Kráľova. */
const FEM = /[aá]$/;
/** A feminine adjective used as a modifier: Veľká, Babia, Biela, Kráľova. A feminine noun (Chata) is not one. */
const ADJ_FEM = /(?:á|ia|ela|ova)$/;
/** Looks like one word of letters (a hyphen inside is fine): no digits, no punctuation. */
const PLAIN_WORD = /^\p{L}[\p{L}-]*$/u;
/** Neuter plurals in -iská (Loviská, Uhliská): they end like a feminine adjective but do not change. */
const NEUTER_PLURAL = /isk[áa]$/i;
/** Endings of a case other than the nominative: such a word is not confident as a bare nominative. */
const OTHER_CASE = /(?:ou|om|ej|ých|ích|ého|ému|ami|ách|iach|ím|ým|mi)$/;
/** A nominative that stays as it is in the accusative: masculine inanimate (a consonant), neuter, plural. */
const SAME_FORM = /(?:[bcčdfghjklľĺmnňpqrŕsštvwxzž]|[oeiyýíéó])$/i;

const capitalise = (w: string) => w.charAt(0).toLocaleUpperCase("sk") + w.slice(1);

/** Splits "Name (Town)" into the name and its parenthesis, which stays as written. */
function splitParen(name: string): { base: string; tail: string } | null {
  const trimmed = name.trim();
  const m = /^(.*?)(\s*\([^()]*\))?$/.exec(trimmed);
  const base = (m?.[1] ?? "").trim();
  const tail = m?.[2] ?? "";
  if (!base || /[(),/&"„“–—:;]|\s-\s/.test(base)) return null;
  return { base, tail };
}

/** Feminine singular nominative to accusative: Veľká -> Veľkú, Javorina -> Javorinu, Babia -> Babiu. */
function femAcc(w: string): string {
  return w.endsWith("á") ? `${w.slice(0, -1)}ú` : `${w.slice(0, -1)}u`;
}

/** Feminine adjective to genitive: Hradná -> Hradnej, Biela -> Bielej, Babia -> Babej. */
function adjGen(w: string): string {
  return w.endsWith("ia") ? `${w.slice(0, -2)}ej` : `${w.slice(0, -1)}ej`;
}

/** "na ..." phrase words, or null when not sure. */
function accusativeNa(words: string[]): string[] | null {
  if (isPrep(words[0])) return null;
  if (words.some((w) => NOT_FOR_NA.has(lower(w)) || NEUTER_PLURAL.test(w))) return null;
  const h = words.findIndex((w) => lower(w) in HEADS);
  if (h >= 0) {
    const gender = HEADS[lower(words[h])];
    const before = words.slice(0, h);
    if (before.some(isPrep)) return null;
    if (gender === "f") {
      if (!before.every((w) => FEM.test(w))) return null;
      const out = [...before.map(femAcc), femAcc(words[h]), ...words.slice(h + 1)];
      // "Hoľa" alone is the mountain's name; "Chata Magura" is a noun and a name.
      if (h === 0 && words.length > 1) out[0] = lower(out[0]);
      return out;
    }
    // Masculine inanimate and neuter: the nominative is the accusative.
    const out = [...words];
    if (h === 0 && words.length > 1) out[0] = lower(out[0]);
    return out;
  }
  // No known noun: the last word decides, the others must be words of a plain name.
  if (!words.every((w) => PLAIN_WORD.test(w)) || words.some(isPrep)) return null;
  const last = words[words.length - 1];
  if (FEM.test(last)) {
    if (!words.slice(0, -1).every((w) => ADJ_FEM.test(w))) return null;
    return words.map(femAcc);
  }
  if (OTHER_CASE.test(last) || !SAME_FORM.test(last)) return null;
  return words;
}

/** "do ..." (genitive) phrase words, or null when not sure. */
function genitiveDo(words: string[], heads: Record<string, string>): string[] | null {
  if (isPrep(words[0])) return null;
  const h = words.findIndex((w) => lower(w) in heads);
  if (h < 0) return null;
  const before = words.slice(0, h);
  // A known noun follows, so a modifier in -a agrees with it (Vrátna dolina).
  if (!before.every((w) => FEM.test(w) && PLAIN_WORD.test(w))) return null;
  const head = heads[lower(words[h])];
  // The noun keeps a capital only inside a proper name ("Hradnej jaskyne"), not at the start ("do jaskyne Driny").
  const capital = h > 0 && words[h] === capitalise(words[h]);
  return [...before.map(adjGen), capital ? capitalise(head) : head, ...words.slice(h + 1)];
}

/**
 * The place as it follows its preposition: "Kriváň" -> na Kriváň, "Babia hora" -> na Babiu horu,
 * "Jánošíkova jaskyňa" -> do Jánošíkovej jaskyne. `kind` is what the place is (the trip's destination
 * kind): it picks the preposition. Not sure of the ending -> `{ confident: false, text: name }`.
 */
export function accusative(name: string, kind?: DestinationKind): Phrase {
  const unsure: Phrase = { prep: null, text: name, confident: false };
  if (kind === "ine") return unsure;
  const parts = splitParen(name);
  if (!parts) return unsure;
  const words = parts.base.split(/\s+/);
  const heads = kind ? GENITIVE_HEADS[kind] : undefined;
  if (heads) {
    const out = genitiveDo(words, heads);
    return out ? { prep: "do", text: out.join(" ") + parts.tail, confident: true } : unsure;
  }
  const out = accusativeNa(words);
  return out ? { prep: "na", text: out.join(" ") + parts.tail, confident: true } : unsure;
}

/** "na Babiu horu", "do Jánošíkovej jaskyne"; null when the case is not confident (callers write "Túra: {name}"). */
export function directionTo(name: string, kind?: DestinationKind): string | null {
  const p = accusative(name, kind);
  return p.confident && p.prep ? `${p.prep} ${p.text}` : null;
}

/** "z" before most words, "zo" before s, z, š, ž ("zo Štrby", "z Popradu"); also used for towns (lib/townNames.ts). */
export function zOrZo(genitive: string): "z" | "zo" {
  return /^[szšž]/i.test(genitive) ? "zo" : "z";
}

export interface Origin {
  prep: "z" | "zo" | null;
  /** The name in the genitive; the name as given when not confident. */
  text: string;
  confident: boolean;
}

/** Whole start names checked by hand, where the genitive plural or an alternation cannot be worked out. */
const GENITIVE_OVERRIDES: Record<string, string> = {
  "Tri Studničky": "Troch Studničiek",
};

/** Bare generic nouns a start is called ("Parkovisko"): lowercase after "z". */
const GENERIC_STARTS = new Set(["Parkovisko", "Námestie", "Stanica", "Zastávka", "Rázcestie", "Kolónia"]);

/** Consonants after which a feminine -a takes -e, not -y (ulica -> ulice, ruža -> ruže, jaskyňa -> jaskyne). */
const SOFT_BEFORE_A = /(?:[cčšžňľťďj]|dz|dž)a$/i;

/** Feminine singular noun in -a to genitive; null for shapes that are not safely feminine singular. */
function femNounGenitive(w: string): string | null {
  if (!w.endsWith("a") || NEUTER_PLURAL.test(w)) return null;
  if (w.endsWith("ia")) return `${w.slice(0, -1)}e`;
  if (!SOFT_BEFORE_A.test(w)) return `${w.slice(0, -1)}y`;
  // ď, ť, ň, ľ lose their caron before e: jaskyňa -> jaskyne, hoľa -> hole.
  const plain: Record<string, string> = { ď: "d", ť: "t", ň: "n", ľ: "l" };
  const stem = w.slice(0, -1);
  return `${stem.slice(0, -1)}${plain[stem.slice(-1)] ?? stem.slice(-1)}e`;
}

/** Genitive of a place name's words ("Suchá Hora" -> "Suchej Hory"), or null when not sure. */
function genitiveWords(words: string[]): string[] | null {
  if (isPrep(words[0]) || words.some(isPrep)) return null;
  if (!words.every((w) => /^\p{L}+$/u.test(w))) return null;
  const last = words[words.length - 1];
  const before = words.slice(0, -1);
  if (last.endsWith("á")) {
    // An adjective used as a noun (Buková, Zázrivá): -á -> -ej; the words before agree with it.
    if (!before.every((w) => ADJ_FEM.test(w))) return null;
    return [...before.map(adjGen), `${last.slice(0, -1)}ej`];
  }
  const fem = femNounGenitive(last);
  if (fem) {
    if (!before.every((w) => ADJ_FEM.test(w))) return null;
    return [...before.map(adjGen), fem];
  }
  // Neuter: -o -> -a, -nie -> -nia (Brezno, Hamovanie; other -ie names are often plurals: Narcie), the adjectives before it -é -> -ého; a lone -é is a neuter adjective-noun.
  const neuter = /o$/.test(last) ? `${last.slice(0, -1)}a` : /(?:nie|radie|horie)$/.test(last) ? `${last.slice(0, -1)}a` : /é$/.test(last) && before.length === 0 ? `${last.slice(0, -1)}ého` : null;
  if (neuter && !NEUTER_PLURAL.test(last)) {
    if (!before.every((w) => /é$/.test(w))) return null;
    return [...before.map((w) => `${w.slice(0, -1)}ého`), neuter];
  }
  // Masculine villages in -ov take -a (Prešov -> Prešova); other masculine endings vary (Poprad -> Popradu, Zvolen -> Zvolena).
  if (before.length === 0 && /ov$/.test(last)) return [`${last}a`];
  return null;
}

/**
 * Where a route starts, as "z {start}" needs it: "Brezina" -> z Breziny, "Horná Dolina" -> z Hornej
 * Doliny, "Tri Studničky (Stará horáreň)" -> zo Troch Studničiek (Stará horáreň). A ", tail" or a
 * "(parenthesis)" after the name stays as written. Not sure -> `confident: false`, the name unchanged.
 */
export function genitiveFrom(name: string): Origin {
  const unsure: Origin = { prep: null, text: name, confident: false };
  const trimmed = name.trim();
  const paren = /\s*\([^()]*\)\s*$/.exec(trimmed);
  const noParen = paren ? trimmed.slice(0, paren.index) : trimmed;
  const tailParen = paren ? ` ${paren[0].trim()}` : "";
  const parts = noParen.split(/\s*,+\s*/);
  const base = parts[0].trim();
  const comma = parts.length > 1 ? `, ${parts.slice(1).join(", ")}` : "";
  if (!base || /[()/&"„“–—:;]|\s-\s|\d/.test(base) || (comma && /[()]/.test(comma))) return unsure;
  const known = GENITIVE_OVERRIDES[base];
  const words = known ? known.split(/\s+/) : genitiveWords(base.split(/\s+/));
  if (!words) return unsure;
  let text = words.join(" ");
  if (GENERIC_STARTS.has(base)) text = text.toLocaleLowerCase("sk");
  return { prep: zOrZo(text), text: text + comma + tailParen, confident: true };
}

/** "z Breziny", "zo Štrby"; null when the genitive is not confident. */
export function fromStart(name: string): string | null {
  const o = genitiveFrom(name);
  return o.confident && o.prep ? `${o.prep} ${o.text}` : null;
}
