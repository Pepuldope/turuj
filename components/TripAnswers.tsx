import Link from "next/link";
import type { ReactNode } from "react";
import { ClosureRules } from "@/components/ClosureRules";
import { SAFE_MARGIN_MIN } from "@/lib/dayPlan";
import { feeText } from "@/lib/feeText";
import { formatDateSk, formatDuration } from "@/lib/format";
import { CurrentMonth } from "@/components/CurrentMonth";
import { UiIcon } from "@/components/UiIcon";
import { decimal, langPath, tr } from "@/lib/lang";
import type { Lang } from "@/lib/lang";
import {
  aboutTeaser,
  closureSentence,
  closureTeaser,
  departureTeaser,
  durationTeaser,
  parkingTeaser,
  transitTeaser,
  departureNote,
  departureSentence,
  hasDatedClosure,
  durationSentence,
  howLongHeading,
  monthName,
  monthTable,
  otherStops,
  parkingFeeNote,
  parkingSentence,
  pinText,
  pinUrl,
  startLineText,
  transitSentence,
  winterNote,
  winterTimedMonths,
} from "@/lib/tripAnswers";
import type { StartLine } from "@/lib/tripAnswers";
import { clock } from "@/lib/zoned";
import type { Closure, LatLng, ParkingLot, TransitStop } from "@/lib/types";
import type { DestinationKind, Fee } from "@/lib/tripSchema";

// The sections below are plain server HTML on purpose: search engines and AI crawlers that do not run
// JavaScript read them, and each opens with one sentence that answers its heading (lib/tripAnswers.ts).
// They are not in data-nosnippet: this is the text meant to be quoted. Each one is a collapsed native <details> row
// in one soft card: the question stays an <h2> inside <summary> and the whole answer is in the HTML, not loaded on click.

const BODY = "flex flex-col gap-2 px-4 pb-4 text-sm leading-relaxed text-[var(--muted)]";

/** The soft card all the rows live in. */
function Card({ children }: { children: ReactNode }) {
  return <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card-bg)]">{children}</div>;
}

/** One question: the H2 and a one-line teaser answer in the summary, the full answer inside. */
function Row({ title, teaser, children }: { title: string; teaser: string | null; children: ReactNode }) {
  return (
    <details className="group border-t border-[var(--border)] first:border-t-0">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="text-[15px] font-semibold leading-snug text-[var(--foreground)]">{title}</h2>
          {teaser && <span className="line-clamp-2 text-[13px] leading-snug text-[var(--muted)]">{teaser}</span>}
        </span>
        <span className="text-[var(--muted)] motion-safe:transition-transform group-open:rotate-90">
          <UiIcon name="chev" size={16} />
        </span>
      </summary>
      <div className={BODY}>{children}</div>
    </details>
  );
}

/** "Uzávery a poplatky" body: the closure rule with its source and date, and the fees. No rule is "Stav chodníka neoverený". */
function ClosuresBody({ lang, closures, fees }: { lang: Lang; closures: Closure[]; fees: Fee[] }) {
  return (
    <>
      <p>{closureSentence(lang, closures)}</p>
      <ClosureRules closures={closures} lang={lang} />
      {closures.length > 0 && <p>{tr(lang, "Mimo týchto dátumov stav chodníka neručíme, pred výletom ho overte u správcu územia.")}</p>}
      {fees.length > 0 ? (
        <>
          {fees.map((fee, i) => (
            <p key={`${fee.rule_id ?? fee.source_url ?? i}`}>
              {feeText(fee, lang)}{" "}
              {fee.source_url && (
                <a href={fee.source_url} target="_blank" rel="noopener noreferrer" className="underline">
                  {tr(lang, "Zdroj")}
                </a>
              )}
            </p>
          ))}
          <p className="text-xs">{tr(lang, "Ceny sa menia, pred výletom si ich overte.")}</p>
        </>
      ) : (
        <p>{tr(lang, "Vstupné ani parkovné pre túto trasu nemáme overené.")}</p>
      )}
    </>
  );
}

interface HeaderProps {
  lang: Lang;
  /** Walking time, length and climb of the walk from the default parking (or stop). */
  walk: { min: number; m: number; ascentM: number } | null;
  starts: string[];
  parking: ParkingLot | null;
  stops: TransitStop[];
  closures: Closure[];
  /** When the trip data was built: "2026-11-02". */
  updated: string | null;
}

/**
 * The facts the header numbers do not show (start, car park, nearest stop, the yearly closure rule), in the
 * header's own style, as a definition list. The labels are read by crawlers and screen readers: visually hidden.
 * Length, climb and time are already in the header above; they are repeated here hidden, as plain text.
 */
export function TripHeaderFacts({ lang, walk, starts, parking, stops, closures, updated }: HeaderProps) {
  const items: { label: string; value: string; icon: "pin" | "car" | "train" | "bus" | "lock" | "warn" }[] = [
    { label: tr(lang, starts.length > 1 ? "Štarty" : "Štart"), value: starts.join("; "), icon: "pin" },
    { label: tr(lang, "Parkovanie"), value: parkingTeaser(lang, parking), icon: "car" },
    { label: tr(lang, "Vlak/autobus"), value: transitTeaser(lang, stops), icon: stops[0]?.mode === "vlak" ? "train" : "bus" },
    { label: tr(lang, "Sezónna uzávera"), value: closureTeaser(lang, closures), icon: closures.length > 0 ? "lock" : "warn" },
  ];
  return (
    <div className="flex flex-col gap-1.5">
      <dl className="flex flex-col gap-1 text-[13px] text-[var(--muted)]">
        {walk && (
          <div className="sr-only">
            <dt>{tr(lang, "Dĺžka")}</dt>
            <dd>{`${decimal(lang, walk.m / 1000)} km`}</dd>
            <dt>{tr(lang, "Stúpanie")}</dt>
            <dd>{`+${walk.ascentM} m`}</dd>
            <dt>{tr(lang, "Čas chôdze")}</dt>
            <dd>{formatDuration(walk.min)}</dd>
          </div>
        )}
        {items.map((it) => (
          <div key={it.label} className="flex items-start gap-2">
            <UiIcon name={it.icon} size={16} className="mt-px" />
            <dt className="sr-only">{it.label}</dt>
            <dd className="min-w-0">{it.value}</dd>
          </div>
        ))}
      </dl>
      {updated && <p className="text-xs text-[var(--muted)] opacity-80">{tr(lang, "Údaje aktualizované {date}", { date: formatDateSk(updated, lang) })}</p>}
    </div>
  );
}

interface AnswersProps {
  lang: Lang;
  name: string;
  kind: DestinationKind;
  startName: string;
  lines: StartLine[];
  loop: boolean;
  parking: ParkingLot | null;
  /** Nearest walk to the trail first. */
  stops: TransitStop[];
  closures: Closure[];
  fees: Fee[];
  /** Where the sun is computed; null when the trip has no place. */
  sunAt: LatLng | null;
  /** Walking time of the main start, minutes. */
  walkMin: number;
  /** Loop-back pages: only the closures row, the rest is not computed there. */
  closuresOnly?: boolean;
  /** Paragraphs of "O výlete". */
  about: string[];
  /** The GPX download, shown as the last row of the card. */
  gpx?: ReactNode;
}

/** The question rows of the trip page in ONE card: how long, parking, bus and train, closures and fees, when to leave, about. */
export function TripAnswers({ lang, name, kind, startName, lines, loop, parking, stops, closures, fees, sunAt, walkMin, closuresOnly = false, about, gpx }: AnswersProps) {
  const asOf = new Date().toISOString().slice(0, 10);
  const months = !closuresOnly && sunAt ? monthTable(sunAt, walkMin, closures, asOf) : [];
  const winter = winterTimedMonths(months);
  const feeOf = parking ? parkingFeeNote(lang, parking) : null;
  const more = otherStops(lang, stops);
  return (
    <Card>
      {!closuresOnly && (
        <>
          <Row title={howLongHeading(lang, name, kind)} teaser={durationTeaser(lang, lines)}>
            <p>{durationSentence(lang, lines, loop)}</p>
            <ul className="flex flex-col gap-1">
              {lines.map((l) => (
                <li key={l.slug}>
                  {l.current ? (
                    <span aria-current="page" className="font-semibold text-[var(--foreground)]">
                      {startLineText(lang, l)}
                    </span>
                  ) : (
                    <Link href={langPath(lang, `/trasa/${l.slug}`)} className="underline">
                      {startLineText(lang, l)}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </Row>

          <Row title={tr(lang, "Parkovanie")} teaser={parkingTeaser(lang, parking)}>
            <p>{parkingSentence(lang, startName, parking, stops.length > 0)}</p>
            {parking && (
              <>
                {feeOf && <p>{feeOf}</p>}
                <p>
                  {tr(lang, "Pin parkoviska")}:{" "}
                  <a href={pinUrl(parking.location)} target="_blank" rel="noopener noreferrer" className="underline">
                    {pinText(parking.location)}
                  </a>
                  . {tr(lang, "Ceny ani kapacitu parkoviska neuvádzame.")}
                </p>
              </>
            )}
          </Row>

          <Row title={tr(lang, "Autobusom a vlakom")} teaser={transitTeaser(lang, stops)}>
            <p>{transitSentence(lang, stops)}</p>
            {more && <p>{more}</p>}
          </Row>
        </>
      )}

      <Row title={tr(lang, "Uzávery a poplatky")} teaser={closureTeaser(lang, closures)}>
        <ClosuresBody lang={lang} closures={closures} fees={fees} />
      </Row>

      {months.length > 0 && (
        <Row title={tr(lang, "Kedy najneskôr vyraziť")} teaser={departureTeaser(lang, months)}>
          <p>{departureSentence(lang, months, closures, asOf)}</p>
          <table className="w-full border-collapse text-left">
            <thead className="text-xs">
              <tr>
                <th scope="col" className="py-1 pr-2 font-medium">
                  {tr(lang, "Mesiac")}
                </th>
                <th scope="col" className="py-1 pr-2 font-medium">
                  {tr(lang, "Najneskôr vyraziť")}
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  {tr(lang, "Západ slnka")}
                </th>
              </tr>
            </thead>
            <tbody>
              {months.map((r) => {
                const shut = r.closedBy || r.partial;
                return (
                  <tr
                    key={r.month}
                    data-month={r.month}
                    className={`border-t border-[var(--border)] data-[now=true]:bg-[var(--accent-soft)] data-[now=true]:text-[var(--foreground)] ${shut ? "opacity-80" : ""}`}
                  >
                    <th scope="row" className="rounded-l-lg px-1 py-2 font-medium text-[var(--foreground)]">
                      {monthName(lang, r.month)}
                      {winter.has(r.month) ? "*" : ""}
                    </th>
                    <td className={`font-data py-2 pr-2 ${shut ? "text-[13px] font-medium" : "text-[15px]"}`}>
                      {shut && <UiIcon name="lock" size={13} className="mr-1 -mt-0.5 align-middle" />}
                      {r.closedBy ? tr(lang, "uzavreté ({who})", { who: r.closedBy }) : r.partial ? tr(lang, "čiastočne uzavreté ({who}): {span}", { who: r.partial.by, span: r.partial.span }) : r.latest ? clock(r.latest) : tr(lang, "nestihnete za svetla")}
                    </td>
                    <td className="font-data rounded-r-lg py-2 pr-1 text-right text-[15px]">{clock(r.sunset)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <CurrentMonth />
          {winter.size > 0 && <p className="text-xs">* {winterNote(lang)}</p>}
          {hasDatedClosure(closures) && <p className="text-xs">{tr(lang, "Niektoré uzávery platia len v určitých dňoch; tabuľka ich pripisuje mesiacom len podľa dňa v roku, presné dátumy sú v časti Uzávery a poplatky.")}</p>}
          <p className="text-xs">{departureNote(lang, walkMin, SAFE_MARGIN_MIN)}</p>
        </Row>
      )}

      {about.length > 0 && (
        <Row title={tr(lang, "O výlete")} teaser={aboutTeaser(about[0])}>
          {about.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </Row>
      )}

      {gpx && <div className="flex min-h-14 items-center border-t border-[var(--border)] px-4 py-3 text-sm">{gpx}</div>}
    </Card>
  );
}
