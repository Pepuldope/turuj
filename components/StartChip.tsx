"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { searchPlaces } from "@/lib/geocode";
import { getTowns } from "@/lib/trips";
import { suggestTowns } from "@/lib/townSuggest";
import type { StartHow } from "@/lib/analytics";
import type { Place } from "@/lib/geocode";
import { TOWNS } from "@/lib/towns";
import { useUserLocation } from "@/lib/userLocation";
import { UiIcon } from "@/components/UiIcon";
import { PickStartMap } from "@/components/PickStartMap";
import { useT } from "@/lib/i18n";

type SearchState = "idle" | "searching" | "results" | "empty" | "error";

// The "Vyrážate z … · Zmeniť" banner has been shown in this browser session.
const BANNER_KEY = "turuj-auto-start-banner";
/** How long the banner stays when nobody scrolls or taps. */
const BANNER_MS = 6000;
// Once per page load, whichever StartChip asks first (home, then a trip page without a reload).
let bannerShown = false;

// Notes sit on a card.
const note = "w-fit rounded-lg bg-[var(--card-bg)] px-2.5 py-1.5 text-xs font-medium";

/**
 * "Odkiaľ vyrážate?" as the page's first question: a card open until a start is
 * picked (my location, one of six cities, or any place by search), then one
 * line "Vyrážate z … Zmeniť". The list works without a start; a start adds
 * travel times and sorts by them.
 */
export function StartChip({ onDone }: { /** Shown in a panel (the trip page's "Zmeniť štart"): always open, closed by this. */ onDone?: () => void } = {}) {
  const { status, message, locate, start, setManualStart, setPicking, picking, auto } = useUserLocation();
  const t = useT();
  const [openState, setOpenState] = useState(false);
  const open = onDone ? true : openState;
  const setOpen = (v: boolean) => (onDone ? !v && onDone() : setOpenState(v));
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<SearchState>("idle");
  const [results, setResults] = useState<Place[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  // Instant suggestions from the towns the site ships; Nominatim waits for Enter.
  const listId = useId();
  const allTowns = useMemo(() => getTowns(), []);
  const suggestions = useMemo(() => suggestTowns(query, allTowns, 6), [query, allTowns]);
  const [active, setActive] = useState(-1);
  const [listShut, setListShut] = useState(false);
  const listOpen = suggestions.length > 0 && !listShut && search !== "results";
  const activeId = listOpen && active >= 0 && active < suggestions.length ? `${listId}-${active}` : undefined;
  const n = suggestions.length;
  // Errors ("nothing found", "didn't load", location problems) are role="alert" lines below, so they are not repeated here.
  const liveText = !listOpen && search !== "searching"
    ? ""
    : search === "searching"
      ? t("Hľadáme miesto…")
      : n === 1
          ? t("{n} návrh", { n })
          : n < 5
            ? t("{n} návrhy", { n })
            : t("{n} návrhov", { n });
  // Finding the location on its own (allowed before): the short line waits instead of the open card.
  const autoLoading = auto && status === "locating" && !start;
  const expanded = open || (!start && !autoLoading);
  const autoGps = auto && start?.source === "gps";
  // An automatic start (the browser already lets us find the location) says on each visit, once, that it
  // can be changed: people planning from elsewhere might not notice it is their location (Peter, 2026-11-05,
  // reminder on every visit 2026-11-07). Never for a typed or picked start, never in a panel.
  const [bannerOn, setBannerOn] = useState(false);
  // Pages without the browse map (the trip page) pick the point on a full-screen map instead.
  const [pickOwn, setPickOwn] = useState(false);
  useEffect(() => {
    if (!autoGps || onDone || bannerShown) return;
    try {
      if (sessionStorage.getItem(BANNER_KEY)) return;
      sessionStorage.setItem(BANNER_KEY, "1");
    } catch {
      // Storage blocked: the page-load flag still keeps it to once.
    }
    bannerShown = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBannerOn(true);
    const hide = () => setBannerOn(false);
    const timer = setTimeout(hide, BANNER_MS);
    const onDown = (e: PointerEvent) => !(e.target as Element | null)?.closest?.("[data-start-banner]") && hide();
    window.addEventListener("scroll", hide, { passive: true, once: true });
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", hide);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [autoGps, onDone]);
  const banner = bannerOn && autoGps && !onDone && !expanded && !pickOwn && !picking && start;

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

  function choose(place: Place, how: StartHow) {
    setManualStart(place, how);
    setResults([]);
    setSearch("idle");
    setQuery("");
    setActive(-1);
    setListShut(false);
    setOpen(false);
  }

  function chooseTown(i: number) {
    const town = suggestions[i];
    if (town) choose({ lat: town.location.lat, lon: town.location.lon, label: town.name }, "suggestion");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!suggestions.length) return;
      e.preventDefault();
      setListShut(false);
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((a) => (a < 0 ? (step > 0 ? 0 : n - 1) : (a + step + n) % n));
    } else if (e.key === "Enter" && listOpen && active >= 0) {
      // A picked suggestion; with none picked, Enter still runs the Nominatim search.
      e.preventDefault();
      chooseTown(active);
    } else if (e.key === "Escape" && listOpen) {
      // Closes the list only, not the panel around it.
      e.stopPropagation();
      setListShut(true);
      setActive(-1);
    }
  }

  return (
    <>
    {banner && (
      <div className="pointer-events-none fixed inset-x-0 top-[calc(var(--topbar,0px)+0.5rem)] z-30 flex justify-center px-3">
        <div
          role="status"
          data-start-banner=""
          className="pointer-events-auto flex max-w-full items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--card-bg)] py-0.5 pr-1 pl-4 text-sm shadow-[var(--shadow-float)]"
        >
          <span className="min-w-0 truncate">{t("Štart: {town} (vaša poloha)", { town: t(banner.label.split(",")[0]) })}</span>
          <span aria-hidden className="text-[var(--muted)]">·</span>
          <button type="button" onClick={() => setOpen(true)} className="min-h-10 shrink-0 rounded-full px-3 font-bold text-[var(--accent)]">
            {t("Zmeniť")}
          </button>
        </div>
      </div>
    )}
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

      {expanded && (
        <div className="flex flex-col gap-2 pt-1">
          <form
            className="flex h-12 items-center gap-2 rounded-xl border-2 border-[var(--accent)] bg-[var(--card-bg)] px-3 shadow-[0_2px_8px_rgba(23,105,209,0.12)] has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-[var(--accent)]"
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
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(-1);
                setListShut(false);
                // Results of an earlier search no longer fit the text.
                if (search !== "idle") {
                  abortRef.current?.abort();
                  setSearch("idle");
                  setResults([]);
                }
              }}
              onKeyDown={onKeyDown}
              role="combobox"
              aria-expanded={listOpen}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={activeId}
              autoComplete="off"
              className="min-w-0 flex-1 rounded bg-transparent text-base outline-none"
            />
            {query.trim().length >= 2 && (
              <button type="submit" className="min-h-10 px-1 text-sm font-bold text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
                {t("Hľadať")}
              </button>
            )}
          </form>
          <p role="status" className="sr-only">
            {liveText}
          </p>
          {listOpen && (
            <ul id={listId} role="listbox" aria-label={t("Návrhy miest")} className="flex flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card-bg)]">
              {suggestions.map((town, i) => (
                <li
                  key={town.id}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  // Keep the input focused while tapping.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => chooseTown(i)}
                  className={`flex min-h-11 cursor-pointer items-center gap-2 border-b border-[var(--border)] px-3 text-sm font-semibold last:border-b-0 ${
                    i === active ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "hover:bg-[var(--background)]"
                  }`}
                >
                  <UiIcon name="pin" size={14} />
                  {town.name}
                </li>
              ))}
            </ul>
          )}
          {search === "searching" && <p className={`${note} text-[var(--muted)]`}>{t("Hľadáme miesto…")}</p>}
          {search === "empty" && <p role="alert" className={`${note} text-[var(--warn)]`}>{t("Také miesto sme nenašli.")}</p>}
          {search === "error" && <p role="alert" className={`${note} text-[var(--warn)]`}>{t("Toto sa nenačítalo. Skúste to znova.")}</p>}
          {search === "results" && (
            <ul className="flex flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card-bg)]">
              {results.map((p) => (
                <li key={`${p.lat},${p.lon}`} className="border-b border-[var(--border)] last:border-b-0">
                  <button
                    type="button"
                    onClick={() => choose(p, "typed")}
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
                onClick={() => choose(town, "town_button")}
                className={`h-11 truncate rounded-[10px] border bg-[var(--segment-bg)] px-3 text-left font-semibold hover:border-[var(--accent)] ${
                  start?.label === town.label ? "border-[var(--accent)]" : "border-[var(--border)]"
                }`}
              >
                {town.label}
              </button>
            ))}
          </div>
          {
            // Anywhere, not only places with an address: a cottage, a crossroads, a car park.
            <button
              type="button"
              onClick={() => {
                const browse = document.querySelector("[data-browse-map]");
                if (!browse || onDone) return setPickOwn(true);
                setPicking(true);
                setOpen(false);
                browse.scrollIntoView({ block: "center", behavior: "smooth" });
              }}
              className="flex h-10 items-center justify-center gap-2 rounded-[10px] border border-dashed border-[var(--border)] text-sm font-semibold text-[var(--accent)] hover:border-[var(--accent)]"
            >
              <UiIcon name="pin" size={16} />
              {t("Vybrať bod na mape")}
            </button>
          }
        </div>
      )}

      {pickOwn && (
        <PickStartMap
          onClose={(picked) => {
            setPickOwn(false);
            if (picked) setOpen(false);
          }}
        />
      )}

      {message && status !== "locating" && (
        <p role="alert" className={`${note} text-[var(--warn)]`}>
          {t(message)}
        </p>
      )}
    </section>
    </>
  );
}
