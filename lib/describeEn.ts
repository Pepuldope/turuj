// English for a trip's generated description (pipeline/trips.py _describe), e.g.
// "Výstup na vrchol Baba (536 m). Štart: Podbabská dolina, späť rovnakou cestou. Po modrej a červenej značke."
// (a loop since 2026-11-07: "Štart: Podlesok (okruh)."; the older "Štart: Podlesok, okruh." still reads.)
// Names stay Slovak. A description written by hand doesn't match and gets null.

const FIRST: [RegExp, string][] = [
  [/^Výstup na vrchol (.+?)(?: \((\d+) m\))?\.$/, "A hike up {1}{2}."],
  [/^Výlet k vyhliadke (.+)\.$/, "A walk to {1}, a viewpoint."],
  [/^Výlet k hradu: (.+)\.$/, "A walk to {1}, a castle."],
  [/^Výlet k horskej chate: (.+)\.$/, "A walk to {1}, a mountain hut."],
  [/^Výlet k plesu: (.+)\.$/, "A walk to {1}, a mountain lake."],
  [/^Výlet k vode: (.+)\.$/, "A walk to the water at {1}."],
  [/^Výlet k vodopádu: (.+)\.$/, "A walk to {1}, a waterfall."],
  [/^Výlet k jaskyni: (.+)\.$/, "A walk to {1}, a cave."],
  [/^Výlet do doliny: (.+)\.$/, "A walk into {1}, a valley."],
  [/^Výlet do rokliny: (.+)\.$/, "A walk into {1}, a gorge."],
  [/^Výlet: (.+)\.$/, "A walk to {1}."],
];

const COLOUR: Record<string, string> = { červenej: "red", modrej: "blue", zelenej: "green", žltej: "yellow" };

export function describeEn(sk: string | null | undefined): string | null {
  const m = sk ? /^(.+?\.) Štart: (?:(.+), (okruh|späť rovnakou cestou)|(.+) \((okruh)\))\.(?: Po (.+) značke\.)?$/.exec(sk) : null;
  if (!m) return null;
  let first: string | null = null;
  for (const [re, en] of FIRST) {
    const f = re.exec(m[1]);
    if (f) {
      first = en.replace("{1}", f[1]).replace("{2}", f[2] ? ` (${f[2]} m)` : "");
      break;
    }
  }
  if (!first) return null;
  const start = m[2] ?? m[4];
  const back = (m[3] ?? m[5]) === "okruh" ? "as a loop" : "out and back the same way";
  let marks = "";
  if (m[6]) {
    const cols = m[6].split(/, | a /).map((c) => COLOUR[c]);
    if (cols.some((c) => !c)) return null;
    marks = ` Follows the ${cols.length > 1 ? `${cols.slice(0, -1).join(", ")} and ${cols[cols.length - 1]}` : cols[0]} trail marking${cols.length > 1 ? "s" : ""}.`;
  }
  return `${first} Starts at ${start}, ${back}.${marks}`;
}
