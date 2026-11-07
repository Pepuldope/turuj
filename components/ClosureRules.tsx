import { Fragment } from "react";
import type { Closure } from "@/lib/types";
import type { Lang } from "@/lib/lang";
import { tr } from "@/lib/lang";
import { closureManager } from "@/lib/closures";
import { formatDateSk } from "@/lib/format";

// G4/F19: the yearly closure rule as plain server HTML, so crawlers that don't run JavaScript read
// it too. It states the rule only, never today's status: "is it closed on my day" is the client-side
// ClosureBanner above. Not in data-nosnippet: this is the text meant to be quoted. The lines go inside the
// "Uzávery a poplatky" section (components/TripAnswers.tsx), which owns the heading.
export function ClosureRules({ closures, lang }: { closures: Closure[]; lang: Lang }) {
  return (
    <>
      {closures.map((c) => (
        <Fragment key={c.id}>
          {/* The reason already carries the dates: say the rule once, the rest is one small line. */}
          <p>{tr(lang, c.reason)}</p>
          <p className="text-xs">
            {tr(lang, "Správca: {who}", { who: closureManager(c) })}
            {" · "}
            <a href={c.source_url} target="_blank" rel="noopener noreferrer" className="underline">
              {tr(lang, "Zdroj informácie")}
            </a>
            {" · "}
            {tr(lang, "Overené: {date}", { date: formatDateSk(c.verified_on, lang) })}
          </p>
          {c.note && <p>{tr(lang, c.note)}</p>}
        </Fragment>
      ))}
    </>
  );
}
