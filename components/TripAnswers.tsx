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
import { clock, wallClock } from "@/lib/zoned";
import { foodOnWalk, onRouteTeaser, pickRoutePlaces, placeText, waterOnWalk } from "@/lib/tripOnRoute";
import { answerRows } from "@/lib/tripRows";
import { packList, packTeaser } from "@/lib/tripPacking";
import { difficultyText, heightsText, markedShareText, markingText, steepestText, terrainOf, terrainTeaser } from "@/lib/tripTerrain";
import type { TerrainInput } from "@/lib/tripTerrain";
import type { Closure, LatLng, ParkingLot, Poi, TransitStop } from "@/lib/types";
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
  /** Show only the closure line: car park and stop are the "Ako sa tam dostanete" step of the plan now (TripAnswers still has both). */
  only?: "closure";
}

/**
 * The facts the header numbers do not show (start, car park, nearest stop, the yearly closure rule), in the
 * header's own style, as a definition list. The labels are read by crawlers and screen readers: visually hidden.
 * Length, climb and time are already in the header above; they are repeated here hidden, as plain text.
 */
export function TripHeaderFacts({ lang, walk, starts, parking, stops, closures, updated, only }: HeaderProps) {
  const items: { label: string; value: string; icon: "car" | "train" | "bus" | "lock" | "warn"; closure?: true }[] = [
    { label: tr(lang, "Parkovanie"), value: parkingTeaser(lang, parking), icon: "car" },
    { label: tr(lang, "Vlak/autobus"), value: transitTeaser(lang, stops), icon: stops[0]?.mode === "vlak" ? "train" : "bus" },
    { label: tr(lang, "Sezónna uzávera"), value: closureTeaser(lang, closures), icon: closures.length > 0 ? "lock" : "warn", closure: true },
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
        {items.filter((it) => !only || (it.closure && closures.length > 0)).map((it) => (
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
  /** The walk's places (huts, food, viewpoints, springs...), with their km along the walk. */
  pois: Poi[];
  /** Path, marking and numbers of the walk, for the terrain row; null = no row. */
  terrain: TerrainInput | null;
  familyFriendly: boolean;
  /** Paragraphs of "O výlete". */
  about: string[];
  /** The trip's region ("Tatry"); Tatra regions get the mountain-rescue row. */
  region?: string | null;
}

/** The question rows of the trip page in ONE card: how long, terrain and signs, places on the way, how to get there, closures and fees, when to leave, before you go (pack list, mountain rescue), about (lib/tripRows.ts: five to eight). */
export function TripAnswers({ lang, name, kind, startName, lines, loop, parking, stops, closures, fees, sunAt, walkMin, pois, terrain, familyFriendly, about, region }: AnswersProps) {
  const asOf = new Date().toISOString().slice(0, 10);
  const months = sunAt ? monthTable(sunAt, walkMin, closures, asOf) : [];
  const winter = winterTimedMonths(months);
  const groups = monthGroups(lang, months);
  const feeOf = parking ? parkingFeeNote(lang, parking) : null;
  const more = otherStops(lang, stops);
  const hzs = !!region && (HZS_REGIONS.has(region) || HZS_SHORT_REGIONS.has(region));
  const t = terrain ? terrainOf(terrain) : null;
  const places = pickRoutePlaces(pois);
  const placesTeaser = onRouteTeaser(lang, places);
  const rows = answerRows({ hasPlaces: !!placesTeaser, hasParking: !!parking, hasStops: stops.length > 0, hasMonths: months.length > 0, hasAbout: about.length > 0 });
  const share = terrain ? markedShareText(lang, terrain.marked_share) : null;
  // The month decides the pack list (pages are cached): the latest start of this month says how much of the daylight the walk fills.
  const month = wallClock(new Date()).mo;
  const nowRow = months.find((r) => r.month === month);
  const latest = nowRow && !nowRow.closedBy && !nowRow.partial ? (nowRow.latest ? wallClock(nowRow.latest).h * 60 + wallClock(nowRow.latest).mi : null) : undefined;
  const pack = packList(lang, { month, walkMin, topM: t?.topM ?? null, waterOnWalk: waterOnWalk(pois), foodOnWalk: foodOnWalk(pois), familyFriendly, latestStartMin: latest });
  return (
    <Card>
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

          {rows.includes("teren") && terrain && t && (
            <Row title={tr(lang, "Terén a značky")} teaser={terrainTeaser(lang, terrain, t)}>
              <p>{heightsText(lang, t)}.</p>
              {share && (
                <p>
                  {share.charAt(0).toLocaleUpperCase(lang === "en" ? "en" : "sk") + share.slice(1)}
                  {t.marking.length > 0 && <>: {markingText(lang, t.marking)}</>}.
                </p>
              )}
              {!share && t.marking.length > 0 && <p>{markingText(lang, t.marking)}.</p>}
              <p>{difficultyText(lang, terrain.difficulty)}</p>
              {t.steepest && <p>{steepestText(lang, t.steepest)}</p>}
              <p className="text-xs">{tr(lang, "Výšky sú z mapových dát a stúpanie môže vychádzať o niečo vyššie, než je naozaj. Čísla sú zaokrúhlené.")}</p>
            </Row>
          )}

          {rows.includes("trasa") && placesTeaser && (
            <Row title={tr(lang, "Na trase")} teaser={placesTeaser}>
              {places.on.length > 0 && (
                <>
                  <p>{tr(lang, "Pri ceste, v poradí, ako ich prejdete (km od štartu):")}</p>
                  <ul className="flex flex-col gap-1">
                    {places.on.map((p) => (
                      <li key={`${p.kind}-${p.location.lat}-${p.location.lon}`}>{placeText(lang, p)}</li>
                    ))}
                  </ul>
                </>
              )}
              {places.off.length > 0 && (
                <>
                  <p>{tr(lang, "Kúsok bokom od trasy (čas tam a späť):")}</p>
                  <ul className="flex flex-col gap-1">
                    {places.off.map((p) => (
                      <li key={`${p.kind}-${p.location.lat}-${p.location.lon}`}>{placeText(lang, p)}</li>
                    ))}
                  </ul>
                </>
              )}
              {places.hidden > 0 && <p>{tr(lang, "a ďalšie {n}", { n: places.hidden })}</p>}
              <p className="text-xs">{tr(lang, "Miesta sú z mapy OpenStreetMap, ich prevádzku neoverujeme.")}</p>
            </Row>
          )}

          {rows.includes("tam") && (
            <Row title={tr(lang, "Ako sa tam dostať")} teaser={[parking ? parkingTeaser(lang, parking) : null, stops.length > 0 ? transitTeaser(lang, stops) : null].filter(Boolean).join(" · ")}>
              <p className="font-semibold text-[var(--foreground)]">{tr(lang, "Parkovanie")}</p>
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
              <p className="mt-1 font-semibold text-[var(--foreground)]">{tr(lang, "Autobusom a vlakom")}</p>
              <p>{transitSentence(lang, stops)}</p>
              {more && <p>{more}</p>}
            </Row>
          )}
      </>

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

      <Row title={tr(lang, "Pred odchodom")} teaser={hzs ? `${packTeaser(pack)} · ${tr(lang, "HZS 18 300")}` : packTeaser(pack)}>
        <p className="font-semibold text-[var(--foreground)]">{tr(lang, "Čo si zbaliť")}</p>
        <p>{tr(lang, "Na túto túru sa hodí:")}</p>
        <ul className="flex flex-col gap-1">
          {pack.map((x) => (
            <li key={x.short}>{x.text}</li>
          ))}
        </ul>
        <p className="text-xs">{tr(lang, "Je to rada podľa dĺžky a výšky trasy a mesiaca, nie záruka. Počasie a stav trasy si overte pred odchodom.")}</p>
        {hzs && (
          <>
            <p className="mt-1 font-semibold text-[var(--foreground)]">{tr(lang, "Horská služba")}</p>
            <HzsBody lang={lang} short={HZS_SHORT_REGIONS.has(region!)} />
          </>
        )}
      </Row>

      {about.length > 0 && (
        <Row title={tr(lang, "O výlete")} teaser={aboutTeaser(about[0])}>
          {about.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </Row>
      )}

    </Card>
  );
}
