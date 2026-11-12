"use client";

import { useState } from "react";
import { KindIcon } from "@/components/KindIcon";
import { poiIcon, poiLabel } from "@/lib/food";
import { focusOnMap } from "@/lib/mapFocus";
import { POI_COLOUR } from "@/lib/palette";
import type { LatLng, Poi } from "@/lib/types";
import { UiIcon } from "@/components/UiIcon";
import { LUNCH, stopFor, useTripStops, visits } from "@/lib/tripStops";
import type { TripStop } from "@/lib/tripStops";
import { ShowMore, shownRows } from "@/components/ShowMore";
import { LunchTime, WaySwitch, useLunchPick } from "@/components/StopsRow";
import { formatDurationShort, formatTime as clock } from "@/lib/format";
import { useLang, useT } from "@/lib/i18n";
import { tr } from "@/lib/lang";
import type { Lang } from "@/lib/lang";
import { usePlanDay } from "@/lib/planDay";
import { stopsAdvice } from "@/lib/stopsAdvice";

/** "pri štarte" / "pri 1,5 km" for a place on the walk, "odbočka 2 min" for a side trip. */
function whereText(p: Poi, lang: Lang): string {
  if (p.detour_min !== null) return tr(lang, "odbočka {t}", { t: formatDurationShort(p.detour_min) });
  if (p.along_m === null) return "";
  if (p.along_m < 150) return tr(lang, "pri štarte");
  const km = (p.along_m / 1000).toLocaleString(lang === "en" ? "en-GB" : "sk-SK", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  return tr(lang, "pri {km}", { km: `${km} km` });
}

/** "7:45", not "07:45" (Peter, 12 Nov 2026), for every time shown in the box. */
const formatTime = (d: Date) => clock(d).replace(/^0/, "");

const hold = (colour: string) => ({ "--kind": colour }) as React.CSSProperties;

/**
 * "Zastávky po ceste" below the map (Peter, 12 Nov 2026: keep the map and structure, add the rest): the
 * chosen stops in a "Vybrané" box with their total, then "Na trase" (huts, springs, viewpoints... in the
 * order the walk reaches them) and "Kúsok bokom" (side trips up to ~30 min there and back), and a warning
 * when the stops are what brings the group back after dark. A tap on a place shows it on the map.
 */
export function PoiList({
  pois,
  slug,
  loop,
  near = {},
}: {
  pois: Poi[];
  slug: string;
  loop: boolean;
  /** Each place's nearest point on the walk (by id): the map shows it with the place. */
  near?: Record<string, LatLng>;
}) {
  const stops = useTripStops(slug);
  const t = useT();
  const lang = useLang();
  const day = usePlanDay();
  const lunch = useLunchPick(slug);
  const [all, setAll] = useState(false);
  if (pois.length === 0 && stops.stops.length === 0) return null;

  const poiOf = (id: string) => pois.find((p) => p.id === id);
  const choose = (p: Poi) => {
    if (!stops.has(p.id)) focusOnMap({ location: p.location, scope: "places", context: near[p.id] });
    stops.toggle(stopFor(p));
  };

  // Unchosen places: "Na trase" first, then "Kúsok bokom". Folded: the first few.
  const free = pois.filter((p) => !stops.has(p.id));
  const ordered = [...free.filter((p) => p.detour_min === null), ...free.filter((p) => p.detour_min !== null)];
  const rows = shownRows(ordered.length, all);
  const seen = ordered.filter((_, i) => rows.includes(i));
  const onTotal = free.filter((p) => p.detour_min === null).length;
  const on = seen.filter((p) => p.detour_min === null);
  const off = seen.filter((p) => p.detour_min !== null);
  const word =
    lang === "en" ? (onTotal === 1 ? "place" : "places") : onTotal === 1 ? "miesto" : onTotal < 5 ? "miesta" : "miest";

  const plan = day && !day.loading ? day.plan : null;
  const advice = plan
    ? stopsAdvice(plan, stops.stops.map((s) => ({ id: s.id, name: t(s.name), minutes: s.min * visits(s) })))
    : null;
  const removal = advice?.removal ? stops.stops.filter((s) => advice.removal!.ids.includes(s.id)) : [];

  return (
    <div className="flex flex-col gap-4">
      {stops.stops.length > 0 && (
        <section aria-label={t("Vybrané zastávky")} className="rounded-xl bg-[var(--accent-soft)] px-3 py-2">
          <p className="flex flex-wrap items-baseline justify-between gap-x-3 pb-1 text-sm">
            <span className="font-bold">{t("Vybrané · {n}", { n: stops.stops.length })}</span>
            <span className="text-[var(--muted)]">
              {t("spolu")} <b className="font-data text-base text-[var(--foreground)]">+{formatDurationShort(stops.minutes)}</b>
              {plan && (
                <>
                  {" · "}
                  {t("späť")} <b className="font-data text-base text-[var(--foreground)]">{formatTime(plan.hikeEnd)}</b>
                </>
              )}
            </span>
          </p>
          <ul className="divide-y divide-[var(--border)]">
            {stops.stops.map((s) => {
              const p = poiOf(s.id);
              return (
                <li key={s.id}>
                  <PickedRow
                    stop={s}
                    p={p}
                    loop={loop}
                    near={p ? near[p.id] : undefined}
                    lunchTime={
                      s.id === LUNCH.id && lunch ? (
                        <LunchTime lunch={lunch} at={s.at} onPick={(at) => stops.patch(LUNCH.id, { at })} />
                      ) : null
                    }
                    onWay={(way) => stops.setWay(s.id, way)}
                    onRemove={() => stops.toggle(s)}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {on.length > 0 && (
        <Group title={t("Na trase")} side={`${onTotal} ${word}`}>
          {on.map((p) => (
            <FreeRow key={p.id} p={p} near={near[p.id]} onAdd={() => choose(p)} />
          ))}
        </Group>
      )}
      {off.length > 0 && (
        <Group title={t("Kúsok bokom")} side={t("odbočka z trasy")}>
          {off.map((p) => (
            <FreeRow key={p.id} p={p} near={near[p.id]} onAdd={() => choose(p)} />
          ))}
        </Group>
      )}
      <ShowMore kind="places" hidden={ordered.length - seen.length} open={all} onToggle={() => setAll((v) => !v)} />

      {advice && plan && (
        <div className="flex flex-col gap-1.5 rounded-xl bg-[var(--warn-bg)] p-4 text-[var(--warn)]">
          <div className="flex items-start gap-2.5">
            <UiIcon name="warn" size={20} className="mt-0.5" />
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="font-bold">{t("Späť by ste boli po tme")}</p>
              <p className="text-sm leading-relaxed">
                {t("Návrat")} <b className="font-data text-base">{formatTime(plan.hikeEnd)}</b> · {t("západ slnka")}{" "}
                <b className="font-data text-base">{formatTime(plan.sunset)}</b>. {t("Zastávky pridali")}{" "}
                <b className="font-data text-base">+{formatDurationShort(advice.stopMin)}</b>.
              </p>
            </div>
          </div>
          <div className="mt-1.5 flex flex-col gap-2">
            {removal.length > 0 && advice.removal && (
              <button
                type="button"
                onClick={() => removal.forEach((s) => stops.toggle(s))}
                className="flex min-h-11 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card-bg)] px-4 py-2.5 text-left text-sm font-semibold text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                <UiIcon name="close" size={16} />
                <span>
                  {removal.length === 1
                    ? t("Odstrániť {name}", { name: t(removal[0].name) })
                    : t(removal.length < 5 ? "Odstrániť {n} zastávky" : "Odstrániť {n} zastávok", { n: removal.length })}{" "}
                  <span className="text-[var(--foreground)]">
                    ({t("späť")} <span className="font-data">{formatTime(advice.removal.backAt)}</span>)
                  </span>
                </span>
              </button>
            )}
            {advice.earlier && day && (
              <button
                type="button"
                onClick={() => day.setWalkStart(clock(advice.earlier!.start))}
                className="flex min-h-11 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card-bg)] px-4 py-2.5 text-left text-sm font-semibold text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                <UiIcon name="clock" size={16} />
                <span>
                  {t("Začať túru o {time}", { time: formatTime(advice.earlier.start) })}{" "}
                  <span className="text-[var(--foreground)]">
                    ({t("späť")} <span className="font-data">{formatTime(advice.earlier.backAt)}</span>)
                  </span>
                </span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Group({ title, side, children }: { title: string; side: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <p className="flex items-baseline justify-between gap-2 pb-1.5">
        <span className="text-[15px] font-bold">{title}</span>
        <span className="text-sm text-[var(--muted)]">{side}</span>
      </p>
      <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)]">{children}</ul>
    </div>
  );
}

/** Kind word in its own colour (the kind-ink mechanism keeps it at 4.5:1 in both modes) and where it is. */
function Meta({ p }: { p: Poi }) {
  const t = useT();
  const lang = useLang();
  const where = whereText(p, lang);
  return (
    <span className="text-[13px] text-[var(--muted)]">
      <span className="kind-ink font-bold" style={hold(POI_COLOUR[p.kind])}>
        {t(poiLabel(p))}
      </span>
      {/* Wraps only between the kind word and this part, never inside "pri 0,4 km" (360 px, 12 Nov 2026). */}
      {where && (
        <>
          {" "}
          <span className="inline-block whitespace-nowrap">· {where}</span>
        </>
      )}
    </span>
  );
}

const showOnMap = (p: Poi, near?: LatLng) => focusOnMap({ id: `poi-${p.id}`, location: p.location, scope: "places", context: near });

const nameBtn =
  "-ml-1 flex min-w-0 flex-1 items-center gap-2.5 rounded-lg py-1 pl-1 text-left focus-visible:outline-2 focus-visible:outline-[var(--accent)]";

/** A place not chosen yet: tile, name, kind and where, its minutes, a round "+". */
function FreeRow({ p, near, onAdd }: { p: Poi; near?: LatLng; onAdd: () => void }) {
  const t = useT();
  return (
    <li className="flex items-center gap-2 py-2">
      <button type="button" onClick={() => showOnMap(p, near)} className={nameBtn}>
        <KindIcon kind={poiIcon(p)} colour={POI_COLOUR[p.kind]} size={44} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[15px] leading-tight font-bold">{t(p.name)}</span>
          <Meta p={p} />
        </span>
        <Minutes min={stopFor(p).min} />
      </button>
      <button
        type="button"
        onClick={onAdd}
        aria-label={t("Pridať {name}", { name: t(p.name) })}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] text-xl leading-none font-extrabold text-[var(--accent)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--accent-contrast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] motion-reduce:transition-none"
      >
        +
      </button>
    </li>
  );
}

/** "+35 min", never split across lines. */
function Minutes({ min }: { min: number }) {
  return <span className="font-data shrink-0 text-lg font-semibold whitespace-nowrap text-[var(--time)]">+{formatDurationShort(min)}</span>;
}

/** A chosen stop (a place, or the lunch break): the way picker or lunch time under it, a filled round check that removes it. */
function PickedRow({
  stop,
  p,
  loop,
  near,
  lunchTime,
  onWay,
  onRemove,
}: {
  stop: TripStop;
  p: Poi | undefined;
  loop: boolean;
  near?: LatLng;
  lunchTime: React.ReactNode;
  onWay: (way: NonNullable<TripStop["way"]>) => void;
  onRemove: () => void;
}) {
  const t = useT();
  const isLunch = stop.id === LUNCH.id;
  const colour = p ? POI_COLOUR[p.kind] : POI_COLOUR.obcerstvenie;
  const body = (
    <>
      <KindIcon kind={p ? poiIcon(p) : isLunch ? "restauracia" : "ine"} colour={colour} size={44} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] leading-tight font-bold">{t(stop.name)}</span>
        {p ? (
          <Meta p={p} />
        ) : isLunch ? (
          <span className="kind-ink text-[13px] font-bold" style={hold(colour)}>
            {t("Prestávka")}
          </span>
        ) : null}
      </span>
      <Minutes min={stop.min * visits(stop)} />
    </>
  );
  return (
    <div className="flex flex-col py-1.5">
      <div className="flex items-center gap-2">
        {p ? (
          <button type="button" onClick={() => showOnMap(p, near)} className={nameBtn}>
            {body}
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2.5 py-1">{body}</div>
        )}
        <button
          type="button"
          onClick={onRemove}
          aria-label={t("Odobrať {name}", { name: t(stop.name) })}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] motion-reduce:transition-none"
        >
          <UiIcon name="check" size={20} />
        </button>
      </div>
      {((!loop && !isLunch) || lunchTime) && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pb-1 pl-[54px]">
          {!loop && !isLunch && <WaySwitch name={stop.name} way={stop.way} onPick={onWay} />}
          {lunchTime}
        </div>
      )}
    </div>
  );
}
