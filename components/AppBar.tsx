"use client";

import { useEffect, useState } from "react";
import { track } from "@/lib/analytics";
import { useInstalled } from "@/lib/installApp";
import { useSavedTrips } from "@/lib/savedTrips";
import { LangLink, useT } from "@/lib/i18n";
import { UiIcon } from "@/components/UiIcon";

const KEY = "turuj-app-bar";
/** The day of the first visit (YYYY-MM-DD), so the bar can wait for a second one. */
const FIRST = "turuj-first-visit";

/** Phone home page: a bar at the bottom pointing to /aplikacia, until closed once (Peter, 2026-10-28).
 *  Only once the visitor has saved a trip or comes back on another day: a first visit stays clean (research 2026-10-31). */
export function AppBar({ hidden }: { hidden?: boolean }) {
  const t = useT();
  const installed = useInstalled();
  const { trips } = useSavedTrips();
  const [show, setShow] = useState(false);
  const saved = trips.length > 0;

  useEffect(() => {
    let closed = false;
    let returning = false;
    try {
      closed = localStorage.getItem(KEY) === "closed";
      const today = new Date().toISOString().slice(0, 10);
      const first = localStorage.getItem(FIRST);
      if (!first) localStorage.setItem(FIRST, today);
      returning = !!first && first !== today;
    } catch {}
    if (closed || !(saved || returning)) return;
    // A few seconds in, so the first look at the page stays clean.
    const id = setTimeout(() => setShow(true), 3000);
    return () => clearTimeout(id);
  }, [saved]);

  function close() {
    setShow(false);
    try {
      localStorage.setItem(KEY, "closed");
    } catch {}
  }

  if (!show || installed || hidden) return null;
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
