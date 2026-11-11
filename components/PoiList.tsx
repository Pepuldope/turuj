"use client";

import { KindIcon } from "@/components/KindIcon";
import { poiIcon, poiLabel } from "@/lib/food";
import { focusOnMap } from "@/lib/mapFocus";
import { POI_COLOUR } from "@/lib/palette";
import type { LatLng, Poi } from "@/lib/types";
import { UiIcon } from "@/components/UiIcon";
import { stopFor, useTripStops, visits } from "@/lib/tripStops";
import type { TripStop } from "@/lib/tripStops";
import { WaySwitch } from "@/components/StopsRow";
import { formatDurationShort } from "@/lib/format";
import { useLang, useT } from "@/lib/i18n";
import { tr } from "@/lib/lang";
import type { Lang } from "@/lib/lang";

function km(m: number, lang: Lang): string {
  return m < 150
    ? tr(lang, "pri štarte")
    : `${(m / 1000).toLocaleString(lang === "en" ? "en-GB" : "sk-SK", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} km`;
}

/** "Na trase": huts, springs, viewpoints... in the order the walk reaches them, then "Kúsok bokom":
 *  side trips up to ~30 min there and back. A tap shows the place on the map. */
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
  if (pois.length === 0) return null;
  const on = pois.filter((p) => p.detour_min === null);
  const off = pois.filter((p) => p.detour_min !== null);
  const word =
    lang === "en" ? (pois.length === 1 ? "place" : "places") : pois.length === 1 ? "miesto" : pois.length < 5 ? "miesta" : "miest";
  return (
    <div className="flex flex-col gap-1">
      <p className="flex items-baseline justify-between gap-2 text-sm font-bold">
        {t(on.length === 0
          ? "Kúsok bokom"
          : off.length > 0
            ? "Na trase a okolo"
            : "Na trase")}
        <span className="ml-auto text-sm font-medium text-[var(--muted)]">
          {pois.length} {word}
        </span>
      </p>
      <ul className="flex flex-col gap-0.5">
        {on.map((p) => (
          <PoiRow
            key={p.id}
            p={p}
            stop={stops.stops.find((s) => s.id === p.id) ?? null}
            loop={loop}
            near={near[p.id]}
            onToggle={() => {
              if (!stops.has(p.id)) focusOnMap({ location: p.location, scope: "places", context: near[p.id] });
              stops.toggle(stopFor(p));
            }}
            onWay={(way) => stops.setWay(p.id, way)}
          />
        ))}
        {on.length > 0 && off.length > 0 && (
          <li className="pt-2 pb-0.5 text-xs font-bold tracking-wide text-[var(--muted)] uppercase">
            {t("Kúsok bokom")}
          </li>
        )}
        {off.map((p) => (
          <PoiRow
            key={p.id}
            p={p}
            stop={stops.stops.find((s) => s.id === p.id) ?? null}
            loop={loop}
            near={near[p.id]}
            onToggle={() => {
              if (!stops.has(p.id)) focusOnMap({ location: p.location, scope: "places", context: near[p.id] });
              stops.toggle(stopFor(p));
            }}
            onWay={(way) => stops.setWay(p.id, way)}
          />
        ))}
      </ul>
    </div>
  );
}

function PoiRow({
  p,
  stop,
  loop,
  near,
  onToggle,
  onWay,
}: {
  p: Poi;
  near?: LatLng;
  stop: TripStop | null;
  loop: boolean;
  onToggle: () => void;
  onWay: (way: NonNullable<TripStop["way"]>) => void;
}) {
  const added = stop !== null;
  const t = useT();
  const lang = useLang();
  return (
    <li className="flex flex-col">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() =>
            focusOnMap({ id: `poi-${p.id}`, location: p.location, scope: "places", context: near })
          }
          className="-ml-2 flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1 text-left hover:bg-[var(--segment-bg)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        >
          <KindIcon kind={poiIcon(p)} colour={POI_COLOUR[p.kind]} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-semibold">{t(p.name)}</span>
            <span className="text-xs text-[var(--muted)]">
              <span
                className="kind-ink font-bold"
                style={{ "--kind": POI_COLOUR[p.kind] } as React.CSSProperties}
              >
                {t(poiLabel(p))}
              </span>
              {p.detour_min !== null
                ? ` · ${t("odbočka +{n} min tam aj späť", { n: p.detour_min })}`
                : p.along_m !== null
                  ? ` · ${km(p.along_m, lang)}`
                  : ""}
            </span>
          </span>
          <span className="shrink-0 text-[var(--muted)]" aria-hidden="true">
            <UiIcon name="pin" size={16} />
          </span>
        </button>
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={added}
          aria-label={
            added ? t("Odobrať zastávku {name}", { name: t(p.name) }) : t("Pridať zastávku {name}", { name: t(p.name) })
          }
          title={added ? t("Odobrať zo zastávok") : t("Pridať ako zastávku")}
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-lg leading-none font-extrabold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
            added
              ? "bg-[var(--accent)] text-[var(--accent-contrast)] hover:opacity-85"
              : "bg-[var(--accent-soft)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--accent-contrast)]"
          }`}
        >
          {added ? "✓" : "+"}
        </button>
      </div>
      {/* Right where it was added: when to stop, and that the plan's times above now count it. */}
      {stop && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pb-1.5 pl-9 text-xs text-[var(--muted)]">
          {!loop && <WaySwitch name={p.name} way={stop.way} onPick={onWay} />}
          <span>
            {t("Zastávka")} +{formatDurationShort(stop.min * visits(stop))} ·{" "}
            <button
              type="button"
              onClick={() =>
                document
                  .getElementById("zastavky")
                  ?.scrollIntoView({ behavior: "smooth", block: "center" })
              }
              className="font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
            >
              {t("v pláne dňa")}
            </button>
          </span>
        </div>
      )}
    </li>
  );
}
