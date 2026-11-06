import { tr } from "@/lib/lang";
import type { Lang } from "@/lib/lang";
import type { Fee } from "@/lib/tripSchema";

/** OSM gives raw tags ("Vstupné: 12 EUR/person"); fee rules carry their own Slovak text. */
export function feeText(fee: Fee, lang: Lang): string {
  if (fee.source === "rule") return tr(lang, fee.text);
  const label = tr(lang, fee.kind === "parkovne" ? "Parkovné" : "Vstupné");
  return fee.amount_eur !== null
    ? `${label} ${fee.amount_eur.toLocaleString(lang === "en" ? "en-GB" : "sk-SK")} €.`
    : tr(lang, "{what} sa platí, výšku nepoznáme.", { what: label });
}
