"use client";

import { useEffect, useId, useRef, useState } from "react";
import { searchPlaces } from "@/lib/geocode";
import type { Place } from "@/lib/geocode";
import { TOWNS } from "@/lib/towns";
import { useUserLocation } from "@/lib/userLocation";
import { UiIcon } from "@/components/UiIcon";
import { useT } from "@/lib/i18n";

type SearchState = "idle" | "searching" | "results" | "empty" | "error";

// The one-time "planning from somewhere else?" line under an automatic start has been shown.
const HINT_KEY = "turuj-auto-start-hint";

// Notes sit on a card.
const note = "w-fit rounded-lg bg-[var(--card-bg)] px-2.5 py-1.5 text-xs font-medium";

/**
 * "Odkiaľ vyrážate?" as the page's first question: a card open until a start is
 * picked (my location, one of six cities, or any place by search), then one
 * line "Vyrážate z … Zmeniť". The list works without a start; a start adds
 * travel times and sorts by them.
 */
export function StartChip({ onDone }: { /** Shown in a panel (the trip page's "Zmeniť štart"): always open, closed by this. */ onDone?: () => void } = {}) {
  const { status, message, locate, start, setManualStart, setPicking, auto } = useUserLocation();
  const t = useT();
  const [openState, setOpenState] = useState(false);
  const open = onDone ? true : openState;
  const setOpen = (v: boolean) => (onDone ? !v && onDone() : setOpenState(v));
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<SearchState>("idle");
  const [results, setResults] = useState<Place[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  // Finding the location on its own (allowed before): the short line waits instead of the open card.
  const autoLoading = auto && status === "locating" && !start;
  const expanded = open || (!start && !autoLoading);
  const autoGps = auto && start?.source === "gps";
  // The first automatic start says once that it can be changed (Peter, 2026-11-05: people
  // planning from elsewhere might not notice it is their location).
  const [hint, setHint] = useState(false);
  useEffect(() => {
    if (!autoGps || onDone) return;
    try {
      if (localStorage.getItem(HINT_KEY)) return;
      localStorage.setItem(HINT_KEY, "1");
    } catch {
      // Storage blocked: show it anyway, harmless.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHint(true);
  }, [autoGps, onDone]);

  async function runSearch() {
    if (query.trim().length < 2) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setSearch("searching");
    try {
      const found = await searchPlaces(query, ctrl.signal);
      setResults(found);
      setSearch(found.length ? "results" : "empty");
    } catch (err) {
      if ((err as Error).name !== "AbortError") setSearch("error");
    }
  }

  function choose(place: Place) {
    setManualStart(place);
    setResults([]);
    setSearch("idle");
    setQuery("");
    setOpen(false);
  }

  return (
    <section
      aria-label={t("Odkiaľ vyrážate")}
      data-start-chip={onDone ? undefined : ""}
      className={onDone ? "flex flex-col gap-2" : "flex flex-col gap-2 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card-bg)] p-3.5 shadow-[var(--shadow-float)]"}
    >
      {(start || autoLoading) && !open ? (
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[var(--accent-soft)] text-[var(--accent)]">
            <UiIcon name="pin" size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <span className="block text-[12.5px] text-[var(--muted)]">
              {t("Vyrážate z")}
              {start?.source === "gps" && ` · ${t("vaša poloha")}`}
            </span>
            <strong className="block truncate text-lg leading-tight">{start ? t(start.label.split(",")[0]) : t("Hľadáme vašu polohu…")}</strong>
          </div>
          <button type="button" onClick={() => setOpen(true)} aria-expanded={false} className="p-2 font-bold text-[var(--accent)]">
            {t("Zmeniť")}
          </button>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[19px] leading-tight font-bold">{t("Odkiaľ vyrážate?")}</h2>
            <p className="mt-0.5 text-[13.5px] text-[var(--muted)]">{t("Zoradíme výlety podľa cesty a ukážeme, kedy vyraziť.")}</p>
          </div>
          {(start || onDone) && (
            <button type="button" onClick={() => setOpen(false)} aria-label={t("Zavrieť")} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--segment-bg)] text-[var(--muted)]">
              <UiIcon name="close" size={12} />
            </button>
          )}
        </div>
      )}

      {hint && autoGps && !open && (
        <p className="text-[13px] text-[var(--muted)]">
          {t("Vyrážate z iného miesta?")}{" "}
          <button type="button" onClick={() => setOpen(true)} className="font-semibold text-[var(--accent)] underline underline-offset-2">
            {t("Vybrať iné miesto")}
          </button>
        </p>
      )}

      {expanded && (
        <div className="flex flex-col gap-2 pt-1">
          <form
            className="flex h-12 items-center gap-2 rounded-xl border-2 border-[var(--accent)] bg-[var(--card-bg)] px-3 shadow-[0_2px_8px_rgba(23,105,209,0.12)]"
            onSubmit={(e) => {
              e.preventDefault();
              runSearch();
            }}
          >
            <span className="text-[var(--accent)]">
              <UiIcon name="search" size={18} />
            </span>
            <label htmlFor={inputId} className="sr-only">
              {t("Mesto alebo obec")}
            </label>
            <input
              id={inputId}
              data-start-search=""
              type="search"
              enterKeyHint="search"
              placeholder={t("Napíšte mesto alebo obec")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="min-w-0 flex-1 bg-transparent text-base outline-none"
            />
            {query.trim().length >= 2 && (
              <button type="submit" className="text-sm font-bold text-[var(--accent)]">
                {t("Hľadať")}
              </button>
            )}
          </form>
          {search === "searching" && <p className={`${note} text-[var(--muted)]`}>{t("Hľadáme miesto…")}</p>}
          {search === "empty" && <p className={`${note} text-[var(--warn)]`}>{t("Také miesto sme nenašli.")}</p>}
          {search === "error" && <p className={`${note} text-[var(--warn)]`}>{t("Toto sa nenačítalo. Skúste to znova.")}</p>}
          {search === "results" && (
            <ul className="flex flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card-bg)]">
              {results.map((p) => (
                <li key={`${p.lat},${p.lon}`} className="border-b border-[var(--border)] last:border-b-0">
                  <button
                    type="button"
                    onClick={() => choose(p)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--background)]"
                  >
                    {p.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => {
              locate();
              setOpen(false);
            }}
            disabled={status === "locating"}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] text-base font-bold text-[var(--accent-contrast)] disabled:opacity-70"
          >
            <UiIcon name="pin" size={18} />
            {status === "locating" ? t("Hľadáme vašu polohu…") : t("Použiť moju polohu")}
          </button>
          <p className="-mt-1 text-center text-xs text-[var(--muted)]">{t("Polohu si neukladáme, použijeme ju len na výpočet cesty.")}</p>
          <div className="grid grid-cols-2 gap-2">
            {TOWNS.slice(0, 6).map((town) => (
              <button
                key={town.label}
                type="button"
                onClick={() => choose(town)}
                className={`h-11 truncate rounded-[10px] border bg-[var(--segment-bg)] px-3 text-left font-semibold hover:border-[var(--accent)] ${
                  start?.label === town.label ? "border-[var(--accent)]" : "border-[var(--border)]"
                }`}
              >
                {town.label}
              </button>
            ))}
          </div>
          {!onDone && (
            // Anywhere, not only places with an address: a cottage, a crossroads, a car park.
            <button
              type="button"
              onClick={() => {
                setPicking(true);
                setOpen(false);
                document.querySelector("[data-browse-map]")?.scrollIntoView({ block: "center", behavior: "smooth" });
              }}
              className="flex h-10 items-center justify-center gap-2 rounded-[10px] border border-dashed border-[var(--border)] text-sm font-semibold text-[var(--accent)] hover:border-[var(--accent)]"
            >
              <UiIcon name="pin" size={16} />
              {t("Vybrať bod na mape")}
            </button>
          )}
        </div>
      )}

      {message && status !== "locating" && (
        <p role="status" className={`${note} text-[var(--warn)]`}>
          {t(message)}
        </p>
      )}
    </section>
  );
}
