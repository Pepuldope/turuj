"use client";

import { useState } from "react";
import type { DayPlan } from "@/lib/dayPlan";
import { approachMin } from "@/lib/dayPlan";
import { formatDuration, formatFromUser, formatTime, stopLabel, TRANSIT_LABEL } from "@/lib/format";
import { appleTransitUrl, cpSkBackUrl, cpSkUrl, googleTransitUrl, startTown } from "@/lib/links";
import type { RailJourney } from "@/lib/rail";
import type { RailTrip } from "@/lib/useRailTrip";
import { useTripDay } from "@/lib/tripSettings";
import { useHomeStop } from "@/lib/useHomeStop";
import { useUserLocation } from "@/lib/userLocation";
import type { TransitStop } from "@/lib/types";
import { clock } from "@/lib/zoned";
import { focusOnMap } from "@/lib/mapFocus";
import { useTripAccess } from "@/components/TripAccess";
import { ShowMore, shownRows } from "@/components/ShowMore";
import { UiIcon } from "@/components/UiIcon";
import { useLang, useT } from "@/lib/i18n";
import { decimal, tr } from "@/lib/lang";
import type { Lang } from "@/lib/lang";

const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = clock;
const link = "w-fit text-sm font-semibold text-[var(--accent)] underline";

/** How many stops to offer; the rest are far or duplicates. */
export const MAX_OPTIONS = 4;

function walkLabel(s: TransitStop, lang: Lang): string {
  const m = s.join?.walk_m ?? s.distance_m;
  const min = approachMin(m);
  const walk =
    min > 0
      ? tr(lang, s.join ? "{m} pešo k trase (~{t})" : "{m} pešo k začiatku (~{t})", { m: formatFromUser(m, lang), t: formatDuration(min) })
      : tr(lang, s.join ? "priamo pri trase" : "pri začiatku trasy");
  return s.join && s.join.skip_m > 0 ? tr(lang, "{walk}, túra kratšia o {km} km", { walk, km: decimal(lang, s.join.skip_m / 1000) }) : walk;
}

export function StopIcon({ mode, size = 16 }: { mode: TransitStop["mode"]; size?: number }) {
  return <UiIcon name={mode === "vlak" ? "train" : "bus"} size={size} />;
}

/**
 * By train or bus: which stop near the trail to get off at, as the options of the "Ako pôjdete" step.
 * The walk to the trail, the plan and the cp.sk searches follow the pick.
 */
export function StopOptions() {
  const { stops, stopChoice, chooseStop, transit, trailStart } = useTripAccess();
  const t = useT();
  const lang = useLang();
  const [all, setAll] = useState(false);
  if (!transit) return null;
  const options = stops.slice(0, MAX_OPTIONS);
  const rows = shownRows(options.length, all, [stopChoice]);

  return (
    <div className="flex flex-col gap-2">
      {options.length === 0 && <p className="text-sm">{t("Pri trase sme nenašli zastávku vlaku ani autobusu.")}</p>}
      {options.length > 0 && (
        <ul className="flex flex-col gap-1.5" role="radiogroup" aria-label={t("Zastávka")}>
          {options.map((s, i) => {
            if (!rows.includes(i)) return null;
            const selected = i === stopChoice;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    chooseStop(i);
                    focusOnMap({ location: s.location, scope: "access", context: s.join?.location ?? trailStart ?? undefined });
                  }}
                  disabled={options.length === 1}
                  className={`flex min-h-11 w-full items-start gap-2.5 rounded-xl border px-2.5 py-1.5 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-default ${
                    selected ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)] hover:border-[var(--accent)]"
                  }`}
                >
                  <span className="mt-pin mt-pin-transit shrink-0" aria-hidden>
                    <StopIcon mode={s.mode} />
                  </span>
                  <span className="flex flex-col leading-snug">
                    <span className="font-semibold">{stopLabel(s.name)}</span>
                    <span className="text-[13px] text-[var(--muted)]">
                      {t(TRANSIT_LABEL[s.mode])}, {walkLabel(s, lang)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <ShowMore kind="stops" hidden={options.length - rows.length} open={all} onToggle={() => setAll((v) => !v)} />
    </div>
  );
}

const pill = (on: boolean) =>
  `flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm ${
    on ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)] hover:border-[var(--accent)]"
  }`;
const fromMidnight = (m: number) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;

/** A list of connections to pick from: departure, the trains, arrival. */
function Connections({ list, choice, choose, label }: { list: RailJourney[]; choice: number; choose: (i: number) => void; label: string }) {
  const t = useT();
  return (
    <ul className="flex flex-col gap-1.5" role="radiogroup" aria-label={label}>
      {list.map((j, i) => {
        const changes = j.legs.length - 1;
        return (
          <li key={`${j.dep}-${j.legs[0].train}`}>
            <button type="button" role="radio" aria-checked={i === choice} onClick={() => choose(i)} className={pill(i === choice)}>
              <span className="font-data text-xl leading-none font-semibold">{fromMidnight(j.dep)}</span>
              <span className="min-w-0 flex-1 truncate text-[var(--muted)]">
                {j.legs[0].train.split(" ").slice(0, 2).join(" ")}, {changes === 0 ? t("priamy") : changes === 1 ? t("1 prestup") : t("{n} prestupy", { n: changes })}
              </span>
              <span className="font-data text-base leading-none font-semibold">→ {fromMidnight(j.arr)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** The chosen connection, train by train, with the changes in between. */
function Legs({ journey, before, after }: { journey: RailJourney; before?: string; after?: string }) {
  const t = useT();
  return (
    <ol className="flex flex-col gap-1.5 border-l-2 border-dashed border-[var(--border)] pl-3 text-sm">
      {before && <li className="text-[var(--muted)]">{before}</li>}
      {journey.legs.map((l, i) => (
        <li key={i} className="flex flex-col">
          {i > 0 && (
            <span className="font-semibold text-[var(--warn)]">
              {t("Prestup")}: {l.from}, {l.dep - journey.legs[i - 1].arr} min
            </span>
          )}
          <span>
            <span className="font-data text-base leading-none font-semibold text-[var(--time)]">{fromMidnight(l.dep)}</span> {l.train} · {l.from}
          </span>
          <span>
            <span className="font-data text-base leading-none font-semibold text-[var(--time)]">{fromMidnight(l.arr)}</span> {l.to}
          </span>
        </li>
      ))}
      {after && <li className="text-[var(--muted)]">{after}</li>}
    </ol>
  );
}

/**
 * Right under the travel switch when going by bus or train: one big button that opens Google Maps
 * with the start and the stop filled in and set to public transport (Mapy.com's links can't do
 * public transport). cp.sk stays in the bus section below, once.
 */
export function TransitHandoff() {
  const { stop } = useTripAccess();
  const { start } = useUserLocation();
  const t = useT();
  if (!stop) return null;
  const to = stop.join?.location ?? stop.location;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <a
        href={googleTransitUrl(to, start)}
        data-umami-event="transit_open"
        data-umami-event-leg="google-top"
        target="_blank"
        rel="noopener noreferrer"
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-3 text-[15px] font-bold whitespace-nowrap text-[var(--accent-contrast)] no-underline"
      >
        <StopIcon mode={stop.mode} /> {t("Nájsť spoj v Google Mapách")} ↗
      </a>
    </div>
  );
}

/**
 * The trip by train or bus. By train (the stop is a station and trains make
 * the trip that day): real connections there and back from the national
 * timetable. By bus: there is no free bus timetable, so the plan uses an
 * estimate from the road time, the stop's lines (from OSM) say which buses
 * go there, and cp.sk / Google Maps / Apple Maps show the exact connection.
 */
export function TransitLegs({ plan, rail }: { plan: DayPlan; rail: RailTrip }) {
  const { stop } = useTripAccess();
  const { start, fix } = useUserLocation();
  const { date } = useTripDay();
  const homeStop = useHomeStop(start);
  const t = useT();
  const lang = useLang();
  const town = startTown(start, fix?.town);
  // cp.sk finds connections between stops; the start's own stop beats the town name, unless it is a
  // city-bus stop named without its town ("Hodžovo nám."), which cp.sk can't place: then the town.
  const home = homeStop && (homeStop.mode === "vlak" || homeStop.name.includes(",") || !town) ? homeStop.name : (town ?? homeStop?.name ?? null);

  if (!stop) {
    return (
      // A warning item of its own, with its sign (Peter, 2026-11-12); it says the way out: go by car.
      <p className="flex items-start gap-1.5 rounded-xl bg-[var(--warn-bg)] px-3 py-2.5 text-sm font-semibold text-[var(--warn)]">
        <UiIcon name="warn" size={16} className="mt-0.5" />
        <span>{t("Pri začiatku trasy sme nenašli zastávku vlaku ani autobusu. Táto túra je lepšia autom.")}</span>
      </p>
    );
  }

  const there = hhmm(plan.hikeStart);
  const back = hhmm(plan.hikeEnd);
  const walkM = stop.join?.walk_m ?? stop.distance_m;
  const walk = t(stop.join ? "{m} pešo k trase" : "{m} pešo k začiatku trasy", { m: formatFromUser(walkM, lang) });
  const train = rail.status === "ok" ? rail.there[rail.thereChoice] : null;
  const trainBack = rail.status === "ok" ? (rail.back[rail.backChoice] ?? null) : null;
  const rideMin = plan.segments[0].kind === "drive-there" ? Math.round((plan.hikeStart.getTime() - plan.segments[0].start.getTime()) / 60000) : null;
  const to = stop.join?.location ?? stop.location;

  return (
    <section aria-label={t("Cesta vlakom a autobusom")} className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--card-bg)] px-3 py-3 text-sm">
      {train ? (
        <>
          <div className="flex flex-col gap-2">
            <p className="flex items-center gap-2 text-base font-bold">
              <StopIcon mode="vlak" /> {t("Tam vlakom")}
            </p>
            <Connections list={rail.there} choice={rail.thereChoice} choose={rail.chooseThere} label={t("Vlak tam")} />
            <Legs
              journey={train}
              before={rail.homeStation ? t("Zo štartu na stanicu {name} (~{t})", { name: rail.homeStation.name, t: formatDuration(rail.accessMin) }) : undefined}
              after={walk}
            />
          </div>
          <div className="flex flex-col gap-2">
            <p className="flex items-center gap-2 text-base font-bold">
              <StopIcon mode="vlak" /> {t("Späť vlakom")}
            </p>
            {trainBack ? (
              <>
                <p className="text-[var(--muted)]">
                  {t("Na stanici budete okolo")} <span className="font-data text-base leading-none">{formatTime(plan.hikeEnd)}</span>. {t("Vybrali sme prvý vlak, ktorý stihnete.")}
                </p>
                <Connections list={rail.back} choice={rail.backChoice} choose={rail.chooseBack} label={t("Vlak späť")} />
                <Legs journey={trainBack} />
              </>
            ) : (
              <p className="flex items-start gap-1.5 rounded-xl bg-[var(--warn-bg)] px-3 py-2 text-sm font-semibold text-[var(--warn)]">
                <UiIcon name="warn" size={16} className="mt-0.5" />
                <span>{t("Po túre už v tento deň nejde vlak späť. Skúste skorší odchod alebo autobus.")}</span>
              </p>
            )}
          </div>
          <p className="text-xs text-[var(--muted)]">{t("Časy vlakov podľa cestovného poriadku ŽSR. Výluky a meškania overte na cp.sk.")}</p>
        </>
      ) : (
        <div className="flex flex-col gap-1.5">
          <p className="flex items-center gap-2 text-base font-bold">
            <StopIcon mode={stop.mode} /> {t(stop.mode === "vlak" ? "Vlakom" : "Autobusom")}
            {rideMin !== null && rail.status !== "loading" && <span className="font-data text-lg leading-none">~{formatDuration(rideMin)}</span>}
          </p>
          <p>
            {homeStop ? (
              <>
                {t("Zo zastávky")} <strong>{stopLabel(homeStop.name)}</strong> ({t(TRANSIT_LABEL[homeStop.mode]).toLowerCase()},{" "}
                <span className="font-data leading-none">{formatFromUser(homeStop.distance_m, lang)}</span> {t("od štartu")})
              </>
            ) : home ? (
              <>
                {t("Z")} <strong>{stopLabel(home)}</strong>
              </>
            ) : (
              t("Zo štartu")
            )}{" "}
            {t("na zastávku")} <strong>{stopLabel(stop.name)}</strong>, {t("buďte tam okolo")} <span className="font-data text-base leading-none">{formatTime(plan.hikeStart)}</span>.{" "}
            {t("Odtiaľ {walk}.", { walk })}
          </p>
          {rail.status === "no-day" && rail.changeDay ? (
            // A yellow warning with its sign: the day's trains may change (Peter, 8 Nov).
            <p className="flex items-start gap-1.5 rounded-xl bg-[var(--warn-bg)] px-3 py-2 text-xs font-semibold text-[var(--warn)]">
              <UiIcon name="warn" size={14} className="mt-px" />
              <span>{t("Cestovný poriadok sa mení {day} Spoj si overte na cp.sk.", { day: rail.changeDay })}</span>
            </p>
          ) : (
            <p className="text-xs text-[var(--muted)]">
              {rail.status === "loading"
                ? t("Hľadáme vlaky…")
                : rail.status === "no-day"
                  ? t("Cestovný poriadok vlakov na tento deň ešte nemáme. Čas je odhad podľa cesty autom.")
                  : t("Čas je odhad podľa cesty autom s rezervou na zastávky a čakanie. Presný spoj nájdete v Google Mapách vyššie.")}
            </p>
          )}
          <p className="pt-1">
            <span className="font-semibold">{t("Späť:")}</span> {t("na zastávke budete okolo")} <span className="font-data text-base leading-none">{formatTime(plan.hikeEnd)}</span>
            {rideMin !== null && (
              <>
                {t(", doma približne o")} <span className="font-data text-base leading-none">{formatTime(plan.segments[plan.segments.length - 1].end)}</span>
              </>
            )}
            .
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-3">
        <p className="font-semibold">{t("Presné spoje a prestupy")}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <a href={cpSkUrl(stop.name, home, date, train ? fromMidnight(train.dep) : there, !train)} data-umami-event="transit_open" data-umami-event-leg="there" target="_blank" rel="noopener noreferrer" className={link}>
            {t("Spoje tam na cp.sk")} ↗
          </a>
          <a href={cpSkBackUrl(stop.name, home, date, back)} data-umami-event="transit_open" data-umami-event-leg="back" target="_blank" rel="noopener noreferrer" className={link}>
            {t("Spoje späť na cp.sk")} ↗
          </a>
          <a href={appleTransitUrl(to, start)} data-umami-event="transit_open" data-umami-event-leg="apple" target="_blank" rel="noopener noreferrer" className={link}>
            {t("Apple Mapy")} ↗
          </a>
        </div>
      </div>
      {!start && <p className="text-xs text-[var(--muted)]">{t("Vyberte, odkiaľ cestujete, a nájdeme vám najbližšiu zastávku aj vlaky.")}</p>}
    </section>
  );
}
