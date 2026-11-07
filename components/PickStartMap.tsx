"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MlMap } from "maplibre-gl";
import { pageLang } from "@/lib/lang";
import { mapLocale } from "@/lib/mapLocale";
import { MAP_STYLE_URL, mapPixelRatio } from "@/lib/mapLayers";
import { keepInSlovakia } from "@/lib/slovakia";
import { useUserLocation } from "@/lib/userLocation";
import { useT } from "@/lib/i18n";

const SLOVAKIA: [[number, number], [number, number]] = [
  [16.8, 47.7],
  [22.6, 49.65],
];

/** The start pin: its tip is the point. */
export function PickPin() {
  return (
    <svg viewBox="0 0 32 44" width="32" height="44" className="drop-shadow-[0_2px_3px_rgba(0,0,0,0.35)]">
      <path d="M16 43C16 43 2 26.5 2 16a14 14 0 0 1 28 0c0 10.5-14 27-14 27z" fill="var(--accent)" stroke="#fff" strokeWidth="2" />
      <circle cx="16" cy="16" r="5" fill="#fff" />
    </svg>
  );
}

/**
 * "Vybrať bod na mape" where the page has no browse map (the trip page): a full-screen map
 * with the pin in the middle; move the map under it and confirm (Peter, 2026-11-05).
 */
export function PickStartMap({ onClose }: { onClose: (picked: boolean) => void }) {
  const { start, pickPoint } = useUserLocation();
  const t = useT();
  const boxRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MlMap | null>(null);
  const startRef = useRef(start);

  useEffect(() => {
    let live = true;
    let m: MlMap | null = null;
    let detach: (() => void) | null = null;
    (async () => {
      const ml = await import("maplibre-gl");
      if (!live || !boxRef.current) return;
      const s = startRef.current;
      m = new ml.Map({
        container: boxRef.current,
        style: MAP_STYLE_URL,
        pixelRatio: mapPixelRatio(),
        attributionControl: { compact: true },
        locale: mapLocale(pageLang()),
        ...(s ? { center: [s.lon, s.lat] as [number, number], zoom: 11 } : { bounds: SLOVAKIA }),
      });
      detach = keepInSlovakia(m);
      setMap(m);
    })();
    return () => {
      live = false;
      detach?.();
      m?.remove();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] bg-[var(--background)]" role="dialog" aria-modal="true" aria-label={t("Vybrať bod na mape")}>
      <div ref={boxRef} className="h-full w-full" />
      <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 z-[2] -translate-x-1/2 -translate-y-full">
        <PickPin />
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 z-[1] h-1.5 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/30" />
      <div
        role="status"
        className="absolute inset-x-3 bottom-[calc(12px+env(safe-area-inset-bottom))] z-[3] mx-auto flex max-w-md flex-col gap-2.5 rounded-xl bg-[var(--card-bg)] p-3 text-sm shadow-[var(--shadow-float)]"
      >
        <span className="font-semibold">{t("Posuňte mapu tak, aby špendlík ukazoval, kde začínate.")}</span>
        <div className="flex gap-2">
          <button type="button" onClick={() => onClose(false)} className="h-10 rounded-[10px] border border-[var(--border)] px-4 font-bold">
            {t("Zrušiť")}
          </button>
          <button
            type="button"
            disabled={!map}
            onClick={() => {
              const c = map?.getCenter();
              if (!c) return;
              pickPoint(c.lat, c.lng);
              onClose(true);
            }}
            className="h-10 flex-1 rounded-[10px] bg-[var(--accent)] px-4 font-bold text-[var(--accent-contrast)] disabled:opacity-60"
          >
            {t("Tu začínam")}
          </button>
        </div>
      </div>
    </div>
  );
}
