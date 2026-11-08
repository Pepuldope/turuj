import Link from "next/link";
import type { ReactNode } from "react";
import { ClosureRules } from "@/components/ClosureRules";
import { SAFE_MARGIN_MIN } from "@/lib/dayPlan";
import { feeText } from "@/lib/feeText";
import { formatDateSk, formatDuration } from "@/lib/format";
import { CurrentMonth } from "@/components/CurrentMonth";
import { Nums } from "@/components/Nums";
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
  monthGroups,
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

/** The stack the question cards live in: each one its own card, a small gap between (no shadow: that is for the big trip-page cards). */
function Card({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-2.5">{children}</div>;
}

/** The card look of one expandable row (same as ParkingBlock and TransitBlock). */
const CARD = "rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card-bg)]";

/** One question: the H2 and a one-line teaser answer in the summary, the full answer inside. */
function Row({ title, teaser, children }: { title: string; teaser: string | null; children: ReactNode }) {
  return (
    <details className={`group ${CARD}`}>
      <summary className="flex min-h-14 cursor-pointer rounded-[var(--radius-card)] list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="text-base font-semibold leading-snug text-[var(--foreground)]">{title}</h2>
          {teaser && (
            <span className="line-clamp-2 text-sm leading-snug text-[var(--muted)]">
              <Nums text={teaser} />
            </span>
          )}
        </span>
        <span className="text-[var(--muted)] motion-safe:transition-transform group-open:rotate-90">
          <UiIcon name="chev" size={16} />
        </span>
      </summary>
      <div className={BODY}>{children}</div>
    </details>
  );
}

/** When the TANAP daylight rule below was last read in the decree. */
const TANAP_DAYLIGHT_CHECKED = "2026-10-31";

/** TANAP: outside villages, walking only from sunrise to sunset (a yellow advice line; the closure rule itself stays red above). */
function TanapDaylight({ lang }: { lang: Lang }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="flex items-start gap-1.5 rounded-xl bg-[var(--warn-bg)] p-3 font-semibold text-[var(--warn)]">
        <UiIcon name="warn" size={16} className="mt-0.5 shrink-0" />
        <span>{tr(lang, "Len cez deň: mimo obcí sa v TANAP-e smie chodiť od východu do západu slnka. Výnimkou je cesta na chatu alebo hotel, kde prespíte.")}</span>
      </p>
      <p className="text-xs">
        <a
          href="https://www.minv.sk/swift_data/source/verejna_sprava/vestnik_vlady_sr_rok_2022-2023/2023/vyhlaska_26.pdf"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          {tr(lang, "vyhláška č. 26/2023, § 4")}
        </a>{" "}
        · {tr(lang, "Overené: {date}", { date: formatDateSk(TANAP_DAYLIGHT_CHECKED, lang) })}
      </p>
    </div>
  );
}

/** "Uzávery a poplatky" body: the closure rule with its source and date, and the fees. No rule is "Stav chodníka neoverený". */
function ClosuresBody({ lang, closures, fees, region }: { lang: Lang; closures: Closure[]; fees: Fee[]; region: string | null }) {
  return (
    <>
      {region === "Tatry" && <TanapDaylight lang={lang} />}
      {closures.length === 0 ? <p>{closureSentence(lang, closures)}</p> : <ClosureRules closures={closures} lang={lang} />}
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

/** Regions whose trip pages get the mountain-rescue row (research report 05 #6). */
const HZS_REGIONS = new Set(["Tatry", "Nízke Tatry"]);
/** Regions with the short row: the rescue number, the trip log and the source (no insurance or avalanche lines). */
const HZS_SHORT_REGIONS = new Set(["Malá Fatra", "Veľká Fatra", "Slovenský raj", "Pieniny"]);
/** When the HZS facts below were last read on hzs.sk and app.hzs.sk. */
const HZS_CHECKED = "2026-11-07";

/** "Pred túrou: horská služba" body: the rescue number, the HZS app's trip log, insurance, the avalanche forecast. `short`: only the number, the trip log and the source. */
function HzsBody({ lang, short = false }: { lang: Lang; short?: boolean }) {
  return (
    <>
      <p>
        {tr(lang, "V núdzi volajte Horskú záchrannú službu na")}{" "}
        <a href="tel:18300" className="whitespace-nowrap font-semibold text-[var(--foreground)] underline">
          18&nbsp;300
        </a>{" "}
        {tr(lang, "alebo tiesňovú linku")}{" "}
        <a href="tel:112" className="font-semibold text-[var(--foreground)] underline">
          112
        </a>
        .
      </p>
      <p>
        {tr(lang, "Trasu si pred túrou zapíšte do Knihy vychádzok a túr v")}{" "}
        <a href="https://app.hzs.sk" target="_blank" rel="noopener noreferrer" className="underline">
          {tr(lang, "aplikácii HZS")}
        </a>
        .{!short && <> {tr(lang, "Večer pred túrou vám pošle výstrahy pre oblasť, a keď sa po návrate neozvete, záchranári vám prídu na pomoc.")}</>}
      </p>
      {!short && (
        <>
          <p>{tr(lang, "Poistenie do hôr preplatí zásah horskej služby, uzavriete ho aj v aplikácii.")}</p>
          <p>
            {tr(lang, "Ak idete v zime nad hranicu lesa, pozrite si lavínovú predpoveď na")}{" "}
            <a href="https://laviny.sk" target="_blank" rel="noopener noreferrer" className="underline">
              laviny.sk
            </a>
            .
          </p>
        </>
      )}
      <p className="text-xs">
        {tr(lang, "Zdroj")}:{" "}
        <a href="https://www.hzs.sk" target="_blank" rel="noopener noreferrer" className="underline">
          hzs.sk
        </a>{" "}
        · {tr(lang, "Overené: {date}", { date: formatDateSk(HZS_CHECKED, lang) })}
      </p>
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
  const items: { label: string; value: string; icon: "car" | "train" | "bus" | "lock" | "warn" }[] = [
    { label: tr(lang, "Parkovanie"), value: parkingTeaser(lang, parking), icon: "car" },
    { label: tr(lang, "Vlak/autobus"), value: transitTeaser(lang, stops), icon: stops[0]?.mode === "vlak" ? "train" : "bus" },
    { label: tr(lang, "Sezónna uzávera"), value: closureTeaser(lang, closures), icon: closures.length > 0 ? "lock" : "warn" },
  ];
  return (
    <div className="flex flex-col gap-1.5">
      <dl className="flex flex-col gap-1 text-sm text-[var(--muted)]">
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
        {/* The hero and the route chooser show the start; crawlers still get it as a labelled fact. */}
        <div className="sr-only">
          <dt>{tr(lang, starts.length > 1 ? "Štarty" : "Štart")}</dt>
          <dd>{starts.join("; ")}</dd>
        </div>
        {items.map((it) => (
          <div key={it.label} className="flex items-start gap-2">
            <UiIcon name={it.icon} size={16} className="mt-px" />
            <dt className="sr-only">{it.label}</dt>
            <dd className="min-w-0">
              <Nums text={it.value} />
            </dd>
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
  /** The trip's region ("Tatry"); Tatra regions get the mountain-rescue row. */
  region?: string | null;
}

/** The question rows of the trip page in ONE card: how long, parking, bus and train, closures and fees, when to leave, mountain rescue (Tatras), about. */
export function TripAnswers({ lang, name, kind, startName, lines, loop, parking, stops, closures, fees, sunAt, walkMin, closuresOnly = false, about, gpx, region }: AnswersProps) {
  const asOf = new Date().toISOString().slice(0, 10);
  const months = !closuresOnly && sunAt ? monthTable(sunAt, walkMin, closures, asOf) : [];
  const winter = winterTimedMonths(months);
  const groups = monthGroups(lang, months);
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
        <ClosuresBody lang={lang} closures={closures} fees={fees} region={region ?? null} />
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
                <th scope="col" className="whitespace-nowrap py-1 text-right font-medium">
                  {tr(lang, "Západ slnka")}
                </th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                if (g.kind === "closed") {
                  return (
                    <tr key={g.months[0]} data-months={g.months.join(" ")} className="border-t border-[var(--border)] text-sm data-[now=true]:bg-[var(--accent-soft)] data-[now=true]:text-[var(--foreground)]">
                      <th scope="row" className="whitespace-nowrap rounded-l-lg px-1 py-2.5 font-medium">
                        {g.label}
                      </th>
                      <td colSpan={2} className="rounded-r-lg py-2.5 pr-1">
                        <UiIcon name="lock" size={13} className="mr-1 -mt-0.5 align-middle" />
                        {tr(lang, "uzavreté ({who})", { who: g.by })}
                      </td>
                    </tr>
                  );
                }
                const r = g.row;
                return (
                  <tr key={r.month} data-months={r.month} className="border-t border-[var(--border)] data-[now=true]:bg-[var(--accent-soft)] data-[now=true]:text-[var(--foreground)]">
                    <th scope="row" className="whitespace-nowrap rounded-l-lg px-1 py-2 font-medium text-[var(--foreground)]">
                      {monthName(lang, r.month)}
                      {winter.has(r.month) ? "*" : ""}
                    </th>
                    {r.partial ? (
                      <td className="py-2 pr-2 text-sm">
                        <UiIcon name="lock" size={13} className="mr-1 -mt-0.5 align-middle" />
                        {tr(lang, "čiastočne uzavreté ({who}): {span}", { who: r.partial.by, span: r.partial.span })}
                      </td>
                    ) : (
                      <td className="font-data py-2 pr-2 text-[17px] text-[var(--time)]">{r.latest ? clock(r.latest) : <span className="font-sans text-sm font-normal text-[var(--muted)]">{tr(lang, "nestihnete za svetla")}</span>}</td>
                    )}
                    <td className="font-data rounded-r-lg py-2 pr-1 text-right text-[17px]">{clock(r.sunset)}</td>
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

      {region && (HZS_REGIONS.has(region) || HZS_SHORT_REGIONS.has(region)) && (
        <Row title={tr(lang, "Pred túrou: horská služba")} teaser={tr(lang, "Záchranári 18 300 · aplikácia HZS a kniha túr")}>
          <HzsBody lang={lang} short={HZS_SHORT_REGIONS.has(region)} />
        </Row>
      )}

      {about.length > 0 && (
        <Row title={tr(lang, "O výlete")} teaser={aboutTeaser(about[0])}>
          {about.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </Row>
      )}

      {gpx && <div className={`${CARD} text-sm hover:border-[var(--accent)]`}>{gpx}</div>}
    </Card>
  );
}
