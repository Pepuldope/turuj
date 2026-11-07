"use client";

import { useEffect, useState } from "react";
import { track } from "@/lib/analytics";
import { useInstalled } from "@/lib/installApp";
import { useSavedTrips } from "@/lib/savedTrips";
import { LangLink, useT } from "@/lib/i18n";
import { UiIcon } from "@/components/UiIcon";

const KEY = "turuj-app-bar";
const NUDGE_AFTER_SAVES = 2;
/** Scrolled this far, the trip search has left the bottom of a phone's first screen. */
const SCROLL_PX = 160;

/** Phone home page: a bar at the bottom pointing to /aplikacia, until closed once (Peter, 2026-10-28).
 *  Only at the right moment (C92, 2026-11-07): after the 2nd saved trip or a "Bol som tu", never on a
 *  first look at the site (research 2026-10-31). Revert C92 to show it after the first opened trip (C86). */
export function AppBar({ hidden }: { hidden?: boolean }) {
  const t = useT();
  const installed = useInstalled();
  const { trips } = useSavedTrips();
  const [show, setShow] = useState(false);
  // C92: the nudge comes when the app has proved useful: a second saved trip, or "Bol som tu" on one.
  const proven = trips.length >= NUDGE_AFTER_SAVES || trips.some((trip) => trip.doneAt);

  useEffect(() => {
    let closed = false;
    try {
      closed = localStorage.getItem(KEY) === "closed";
    } catch {}
    if (closed || !proven) return;
    // A few seconds in, so the first look at the page stays clean.
    const id = setTimeout(() => setShow(true), 3000);
    return () => clearTimeout(id);
  }, [proven]);

  // The bar sits at the bottom of the screen, where the trip search is on a phone's first screen, and
  // the search results ran under it while typing. So it waits until the page is scrolled (the search
  // has stuck to the top by then) and steps aside while a text field has focus.
  const [scrolled, setScrolled] = useState(false);
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const isField = (el: Element | null) =>
      el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && !["button", "checkbox", "radio", "range", "submit"].includes(el.type));
    const onScroll = () => setScrolled(window.scrollY > SCROLL_PX);
    const onFocus = () => setTyping(isField(document.activeElement));
    const onBlur = () => requestAnimationFrame(onFocus);
    const id = requestAnimationFrame(onScroll);
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onBlur);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onBlur);
    };
  }, []);

  function close() {
    setShow(false);
    try {
      localStorage.setItem(KEY, "closed");
    } catch {}
  }

  if (!show || installed || hidden || !scrolled || typing) return null;
  return (
    <div className="fixed inset-x-3 bottom-[calc(12px+env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-[#14233b] p-3 pl-4 text-white shadow-[var(--shadow-float)]">
      <span className="max-[359px]:hidden"><UiIcon name="phone" size={22} /></span>
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <b className="text-[15px]">{t("Túruj ako appka")}</b>
        <span className="text-[13px] opacity-80">{t("Zadarmo, na ploche telefónu")}</span>
      </span>
      <LangLink
        href="/aplikacia"
        onClick={() => {
          track("app_link", { from: "bar" });
          close();
        }}
        className="shrink-0 rounded-[var(--radius-chip)] bg-white px-3 py-2 text-sm font-bold whitespace-nowrap text-[#14233b]"
      >
        {t("Získať appku")}
      </LangLink>
      <button type="button" onClick={close} aria-label={t("Zavrieť")} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xl leading-none opacity-80">
        ×
      </button>
    </div>
  );
}
