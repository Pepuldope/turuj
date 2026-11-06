import type { Closure } from "@/lib/types";
import type { Lang } from "@/lib/lang";
import { tr } from "@/lib/lang";
import { closureManager, closurePeriod } from "@/lib/closures";
import { formatDateSk } from "@/lib/format";

// G4/F19: the yearly closure rule as plain server HTML, so crawlers that don't run JavaScript read
// it too. It states the rule only, never today's status: "is it closed on my day" is the client-side
// ClosureBanner above. Not in data-nosnippet: this is the text meant to be quoted.
export function ClosureRules({ closures, lang }: { closures: Closure[]; lang: Lang }) {
  if (closures.length === 0) return null;
  return (
    <section className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
      <h2 className="text-base font-bold text-[var(--foreground)]">{tr(lang, "Sezónne uzávery")}</h2>
      {closures.map((c) => (
        <p key={c.id}>
          {tr(lang, c.reason)}{" "}
          {tr(lang, c.kind === "jednorazova" ? "Platí od {period}" : "Platí každý rok od {period}", { period: closurePeriod(c) }).replace(/\.?$/, ".")}{" "}
          {tr(lang, "Správca: {who}.", { who: closureManager(c) })}{" "}
          <a href={c.source_url} target="_blank" rel="noopener noreferrer" className="underline">
            {tr(lang, "Zdroj informácie")}
          </a>
          {" · "}
          {tr(lang, "Overené: {date}", { date: formatDateSk(c.verified_on, lang) })}
        </p>
      ))}
    </section>
  );
}
