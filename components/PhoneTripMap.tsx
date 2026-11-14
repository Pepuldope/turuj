"use client";

import { useEffect, useState } from "react";
import { KindIcon } from "@/components/KindIcon";
import { MapExpandButton } from "@/components/MapExpandButton";
import { TripMap } from "@/components/TripMap";
import type { OtherRoute } from "@/components/TripMap";
import { UiIcon } from "@/components/UiIcon";
import { poiIcon, poiLabel } from "@/lib/food";
import { focusOnMap } from "@/lib/mapFocus";
import type { MapFit } from "@/lib/mapFocus";
import { POI_COLOUR } from "@/lib/palette";
import type { TrailDetail } from "@/lib/types";
import { useT } from "@/lib/i18n";
import type { MarkSigns } from "@/lib/markSigns";

/**
 * The trip map on phones: "Celá mapa" opens it full screen, with a small "Na trase" tab
 * listing the places on the way (a tap glides the map there).
 */
export function PhoneTripMap({
  detail,
  gpxUrl,
  path,
  others,
  loop = false,
  marks,
  colour,
  focus,
  placeKey,
  compact = false,
  joined = false,
}: {
  detail: TrailDetail;
  gpxUrl: string | null;
  path?: [number, number][];
  others: OtherRoute[];
  loop?: boolean;
  marks?: MarkSigns;
  colour?: string;
  /** What the map first frames (inside a plan step). */
  focus?: MapFit;
  /** The place the routes belong to: its map is kept across the route pages (lib/keptMap.ts). */
  placeKey?: string;
  /** A short map filling its parent (a plan step's), instead of the tall stand-alone one. */
  compact?: boolean;
  /** The map is the top of a joined block (the day map over the sun dial): no border or rounding of its own. */
  joined?: boolean;
}) {
  const [full, setFull] = useState(false);
  const t = useT();
  const [tab, setTab] = useState(false);
  const pois = detail.pois;

  useEffect(() => {
    if (!full) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [full]);

  return (
    <div
      // Small maps hide MapLibre's +/- (pinch and scroll still zoom); full screen shows them (globals.css).
      data-small-map={full ? undefined : ""}
      className={
        full
          ? "fixed inset-0 z-50 bg-[var(--background)] pt-[env(safe-area-inset-top)]"
          : `relative ${compact ? "h-full" : "h-[45vh]"} overflow-hidden ${joined ? "" : "rounded-xl border border-[var(--border)]"}`
      }
    >
      <TripMap detail={detail} gpxUrl={gpxUrl} path={path} others={others} loop={loop} marks={marks} colour={colour} focus={focus} placeKey={placeKey} />
      {/* Top left: the map's zoom buttons sit top right. */}
      <MapExpandButton
        side="left"
        small
        full={full}
        onClick={() => {
          setFull((f) => !f);
          setTab(false);
        }}
      />
      {full && pois.length > 0 && (
        <div className="absolute inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-[6] flex flex-col items-start gap-2">
          {tab && (
            <ul className="flex max-h-[38dvh] w-full flex-col gap-0.5 overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-2 shadow-[var(--shadow-float)]">
              {pois.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => focusOnMap({ id: `poi-${p.id}`, location: p.location, scope: focus })}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-[var(--segment-bg)]"
                  >
                    <KindIcon kind={poiIcon(p)} colour={POI_COLOUR[p.kind]} />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-semibold">{t(p.name)}</span>
                      <span className="text-xs text-[var(--muted)]">
                        {t(poiLabel(p))}
                        {p.detour_min !== null ? ` · ${t("odbočka +{n} min", { n: p.detour_min })}` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => setTab((t) => !t)}
            aria-expanded={tab}
            className="inline-flex h-10 items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card-bg)] px-3.5 text-sm font-bold shadow-[var(--shadow-float)]"
          >
            Na trase
            <span className="font-medium text-[var(--muted)]">{pois.length}</span>
            <span className={`text-[var(--muted)] transition-transform ${tab ? "rotate-90" : "-rotate-90"}`}>
              <UiIcon name="chev" size={14} />
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
