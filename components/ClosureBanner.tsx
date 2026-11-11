"use client";

import type { Closure } from "@/lib/types";
import { activeClosures } from "@/lib/closures";
import { formatDateSk } from "@/lib/format";
import { useTripDay } from "@/lib/tripSettings";
import { LangLink, useLang, useT } from "@/lib/i18n";

interface Props {
  closures: Closure[];
  /** The trip's region: where we know the park administration's closure page, the "no data" box links to it. */
  region?: string | null;
}

/** Who publishes trail closures for the region (the park administration's own page). Regions not listed get no link. */
const PARK_CLOSURES: Record<string, { name: string; url: string }> = {
  Tatry: { name: "Správa TANAP", url: "https://www.tanap.sk" },
  "Nízke Tatry": { name: "Správa NAPANT", url: "https://www.napant.sk" },
  "Malá Fatra": { name: "Správa NP Malá Fatra", url: "https://www.npmalafatra.sk/navstevnici/uzavery-turistickych-chodnikov/" },
  Pieniny: { name: "Správa PIENAP", url: "https://pienap.sk" },
};

export function ClosureBanner({ closures, region = null }: Props) {
  // The day the trip page plans for (picked day, else today or tomorrow).
  const { date } = useTripDay();
  const t = useT();
  const lang = useLang();

  // CRITICAL: missing data must never read as good news. If we have no
  // closure rows at all for this trail, say so plainly instead of implying
  // "otvorené".
  if (closures.length === 0) {
    const park = region ? PARK_CLOSURES[region] : undefined;
    return (
      // Neutral grey box of its own (design brief: "unknown", not a warning and not good news), set apart from the trip's facts.
      <div className="flex flex-col gap-1.5 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--neutral-bg)] p-4">
        <p className="text-base font-bold">{t("Stav chodníka neoverený")}</p>
        <p className="text-sm text-[var(--muted)]">
          {t("Pre túto trasu nemáme žiadne údaje o uzáverách. Pred výletom si stav overte na inom zdroji.")}
        </p>
        {park && (
          <p className="text-sm">
            {t("Uzávery v tejto oblasti zverejňuje")}{" "}
            <a href={park.url} target="_blank" rel="noopener noreferrer" className="underline">
              {t(park.name)}
            </a>
            .
          </p>
        )}
      </div>
    );
  }

  // The trip date only exists in the browser (it is filled in after hydration,
  // in local time). Don't guess from the server's clock: wait for it.
  if (!date) {
    return (
      <div data-nosnippet className="rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-4">
        <p className="font-semibold">{t("Overujeme uzávery…")}</p>
      </div>
    );
  }

  // Check the day the user plans to go, not today: a closure starting next
  // week matters for a trip planned next week.
  const checkDate = date;
  const active = activeClosures(closures, checkDate);

  if (active.length > 0) {
    return (
      // Red with the warning sign, like a storm: a closure by law outranks the weather (the --danger token is "closures").
      <div role="alert" className="flex flex-col gap-2 rounded-xl border-2 border-[var(--danger)] bg-[var(--danger-bg)] p-4">
        <p className="flex items-start gap-2 font-bold text-[var(--danger)]">
          <svg viewBox="0 0 24 24" className="mt-px h-6 w-6 shrink-0" aria-hidden="true">
            <path d="M12 3 22 20H2z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
            <path d="M12 9.5v4.5M12 16.8v.4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          <span>{t("Chodník je v deň výletu ({date}) uzavretý", { date: formatDateSk(checkDate, lang) })}</span>
        </p>
        {active.map((c) => (
          <div key={c.id} className="flex flex-col gap-1 text-sm">
            <p>{t(c.reason)}</p>
            {c.note && <p className="font-semibold">{t(c.note)}</p>}
            {c.id.startsWith("tanap-") && (
              <p>
                <LangLink href={c.note ? "/uzavery/tanap#vynimky" : "/uzavery/tanap"} className="font-semibold underline">
                  {t("Sezónna uzávera v TANAP-e: čo je zatvorené a kam sa dá ísť")}
                </LangLink>
              </p>
            )}
            <p>
              <a href={c.source_url} target="_blank" rel="noopener noreferrer" className="underline">
                {t("Zdroj informácie")}
              </a>
            </p>
            <p className="opacity-70">{t("Overené: {date}", { date: formatDateSk(c.verified_on, lang) })}</p>
          </div>
        ))}
      </div>
    );
  }

  const mostRecentlyVerified = closures.reduce((latest, c) =>
    c.verified_on > latest.verified_on ? c : latest
  );

  return (
    // Neutral, not green: the date is when the rules were checked, and only seasonal
    // park closures are tracked, so this is not "verified open".
    <div className="rounded-xl border border-[var(--border)] bg-[var(--neutral-bg)] p-4">
      <p className="font-semibold">{t("V deň výletu ({date}) nepoznáme uzáveru tohto chodníka", { date: formatDateSk(checkDate, lang) })}</p>
      <p className="text-sm opacity-70">
        {t("Sledujeme sezónne uzávery národných parkov, iné (ťažba, opravy) nie. Pravidlá overené {date}.", { date: formatDateSk(mostRecentlyVerified.verified_on, lang) })}
      </p>
    </div>
  );
}
