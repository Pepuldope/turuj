import Link from "next/link";
import { ClosureRules } from "@/components/ClosureRules";
import { SAFE_MARGIN_MIN } from "@/lib/dayPlan";
import { feeText } from "@/lib/feeText";
import { formatDateSk, formatDuration } from "@/lib/format";
import { decimal, langPath, tr } from "@/lib/lang";
import type { Lang } from "@/lib/lang";
import {
  closureSentence,
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
} from "@/lib/tripAnswers";
import type { StartLine } from "@/lib/tripAnswers";
import { clock } from "@/lib/zoned";
import type { Closure, LatLng, ParkingLot, TransitStop } from "@/lib/types";
import type { DestinationKind, Fee } from "@/lib/tripSchema";

// The sections below are plain server HTML on purpose: search engines and AI crawlers that do not run
// JavaScript read them, and each opens with one sentence that answers its heading (lib/tripAnswers.ts).
// They are not in data-nosnippet: this is the text meant to be quoted.

const SECTION = "flex flex-col gap-1.5 text-sm text-[var(--muted)]";
const H2 = "text-base font-bold text-[var(--foreground)]";

interface FaktyProps {
  lang: Lang;
  /** Walking time, length and climb of the walk from the default parking (or stop). */
  walk: { min: number; m: number; ascentM: number } | null;
  starts: string[];
  loop: boolean;
  familyFriendly: boolean;
  region: string | null;
  /** When the trip data was built: "2026-11-02". */
  updated: string | null;
}

/** "Fakty": the same few facts in the same words on every trip page, as a definition list. */
export function TripFakty({ lang, walk, starts, loop, familyFriendly, region, updated }: FaktyProps) {
  const rows: [string, string][] = [
    ...(walk
      ? ([
          [tr(lang, "Čas chôdze"), formatDuration(walk.min)],
          [tr(lang, "Dĺžka"), `${decimal(lang, walk.m / 1000)} km`],
          [tr(lang, "Prevýšenie"), `+${walk.ascentM} m`],
        ] as [string, string][])
      : []),
    [tr(lang, starts.length > 1 ? "Štarty" : "Štart"), starts.join("; ")],
    [tr(lang, "Okruh"), tr(lang, loop ? "áno" : "nie")],
    ...(familyFriendly ? ([[tr(lang, "Vhodné pre deti"), tr(lang, "áno")]] as [string, string][]) : []),
    ...(region ? ([[tr(lang, "Región"), region]] as [string, string][]) : []),
  ];
  return (
    <section className={SECTION}>
      <h2 className={H2}>{tr(lang, "Fakty")}</h2>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-0.5">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="font-semibold text-[var(--foreground)]">{k}</dt>
            <dd className="min-w-0 break-words">{v}</dd>
          </div>
        ))}
      </dl>
      {updated && <p className="text-xs">{tr(lang, "Údaje aktualizované {date}", { date: formatDateSk(updated, lang) })}</p>}
    </section>
  );
}

/** "Uzávery a poplatky": the closure rule with its source and date, and the fees. No rule is "Stav chodníka neoverený". Loop pages show this one too. */
export function ClosuresAndFees({ lang, closures, fees }: { lang: Lang; closures: Closure[]; fees: Fee[] }) {
  return (
    <section className={SECTION}>
      <h2 className={H2}>{tr(lang, "Uzávery a poplatky")}</h2>
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
    </section>
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
}

/** The five question sections: how long, parking, bus and train, closures and fees, when to leave. */
export function TripAnswers({ lang, name, kind, startName, lines, loop, parking, stops, closures, fees, sunAt, walkMin }: AnswersProps) {
  const asOf = new Date().toISOString().slice(0, 10);
  const months = sunAt ? monthTable(sunAt, walkMin, closures, asOf) : [];
  const feeOf = parking ? parkingFeeNote(lang, parking) : null;
  const more = otherStops(lang, stops);
  return (
    <>
      <section className={SECTION}>
        <h2 className={H2}>{howLongHeading(lang, name, kind)}</h2>
        <p>{durationSentence(lang, lines, loop)}</p>
        <ul className="flex flex-col gap-0.5">
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
      </section>

      <section className={SECTION}>
        <h2 className={H2}>{tr(lang, "Parkovanie")}</h2>
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
      </section>

      <section className={SECTION}>
        <h2 className={H2}>{tr(lang, "Autobusom a vlakom")}</h2>
        <p>{transitSentence(lang, stops)}</p>
        {more && <p>{more}</p>}
      </section>

      <ClosuresAndFees lang={lang} closures={closures} fees={fees} />

      {months.length > 0 && (
        <section className={SECTION}>
          <h2 className={H2}>{tr(lang, "Kedy najneskôr vyraziť")}</h2>
          <p>{departureSentence(lang, months, closures, asOf)}</p>
          <table className="w-full max-w-[420px] border-collapse text-left">
            <thead>
              <tr className="text-[var(--foreground)]">
                <th scope="col" className="py-0.5 pr-2 font-semibold">
                  {tr(lang, "Mesiac")}
                </th>
                <th scope="col" className="py-0.5 pr-2 font-semibold">
                  {tr(lang, "Najneskôr vyraziť")}
                </th>
                <th scope="col" className="py-0.5 font-semibold">
                  {tr(lang, "Západ slnka")}
                </th>
              </tr>
            </thead>
            <tbody>
              {months.map((r) => (
                <tr key={r.month} className="border-t border-[var(--border)]">
                  <th scope="row" className="py-0.5 pr-2 font-normal">
                    {monthName(lang, r.month)}
                  </th>
                  <td className="font-data py-0.5 pr-2">{r.closedBy ? tr(lang, "uzavreté ({who})", { who: r.closedBy }) : r.partial ? tr(lang, "čiastočne uzavreté ({who}): {span}", { who: r.partial.by, span: r.partial.span }) : r.latest ? clock(r.latest) : tr(lang, "nestihnete za svetla")}</td>
                  <td className="font-data py-0.5">{clock(r.sunset)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {hasDatedClosure(closures) && <p className="text-xs">{tr(lang, "Niektoré uzávery platia len v určitých dňoch; tabuľka ich pripisuje mesiacom len podľa dňa v roku, presné dátumy sú v časti Uzávery a poplatky.")}</p>}
          <p className="text-xs">{departureNote(lang, walkMin, SAFE_MARGIN_MIN)}</p>
        </section>
      )}
    </>
  );
}
