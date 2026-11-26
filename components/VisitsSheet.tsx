"use client";

import { useEffect, useState } from "react";
import { track } from "@/lib/analytics";
import { LangLink, useLang, useT } from "@/lib/i18n";
import { usePlanAgain } from "@/lib/openPlan";
import { useReviewed } from "@/lib/reviewed";
import { useSavedTrips } from "@/lib/savedTrips";
import { lastWalk } from "@/lib/visitedList";
import { addVisitByHand, dropVisit, editVisit, planVisitId } from "@/lib/visits";
import type { Visit } from "@/lib/visits";
import { parseWhen, whenLabel } from "@/lib/visitWhen";
import { MyStars } from "@/components/MyStars";
import { ReviewSheet } from "@/components/ReviewSheet";
import { routeNameOf, UNKNOWN_ROUTE } from "@/components/RoutePick";
import type { RoutePickData } from "@/components/RoutePick";
import { UiIcon } from "@/components/UiIcon";
import { VisitMark } from "@/components/VisitMark";
import { REMOVE_NOW, VisitSheet } from "@/components/VisitSheet";
import { useLeave } from "@/lib/usePresence";
import { useScrollLock } from "@/lib/useScrollLock";

const focus = "focus-visible:outline-2 focus-visible:outline-[var(--accent)]";
const outline = `flex min-h-10 w-full items-center justify-center rounded-full border border-[var(--border)] px-4 py-2.5 text-sm font-semibold ${focus}`;

type Inner = { kind: "edit"; visit: Visit } | { kind: "add" } | { kind: "review" } | null;

/**
 * "Vaše návštevy" (Peter, 25 Nov 2026): the visits of one place, latest first. A row opens the window of that
 * visit (change the day, the route at a place with several, or remove it); only one window is on screen at a time.
 * Under them (Peter, 26 Nov 2026): the visitor's own stars, changeable, and "Naplánovať znova", which opens the
 * route walked last time with that day's plan put back (lib/openPlan.ts usePlanAgain).
 */
export function VisitsSheet({
  visits,
  name,
  slug,
  place,
  route,
  pick,
  reviewSlug,
  reviewed,
  canAdd = true,
  gone = false,
  openHref,
  onClose,
}: {
  visits: Visit[];
  name: string;
  slug: string;
  place: string;
  /** The page's own route: what a visit added at a place with one route gets. */
  route: string;
  /** Given for a place with several routes: each visit names its route and the window asks for it. */
  pick?: RoutePickData;
  /** The trip "Ohodnotiť výlet" is about: the route of the latest visit, when it is known. */
  reviewSlug: string;
  reviewed: boolean;
  /** Off in Moje výlety while the place's routes are not known (no signal): a new visit could not say its route. */
  canAdd?: boolean;
  /** The trip is no longer offered: its visits can be fixed or removed, nothing else. */
  gone?: boolean;
  /** Given in Moje výlety: the trip's page, as a link. */
  openHref?: string;
  onClose: () => void;
}) {
  const tx = useT();
  const lang = useLang();
  const { trips, patch } = useSavedTrips();
  const { state: motion, leave } = useLeave();
  const [inner, setInner] = useState<Inner>(null);
  /** The visit whose row asks "really remove?" (its id). */
  const [asking, setAsking] = useState<string | null>(null);
  const remove = (v: Visit) => {
    dropVisit(v.id);
    // A visit that came from a saved plan: the plan is not done any more and is not asked about again.
    const s = trips.find((x) => planVisitId(x.route ?? x.slug, x.date) === v.id);
    if (s) patch(s.slug, { doneAt: undefined, skipAsk: true });
  };
  const stars = useReviewed()[reviewSlug];
  const planAgain = usePlanAgain();
  useScrollLock();

  // Last time: the route walked, and from the plan of that day (while the device still has it) how the group went.
  const walk = lastWalk(visits, trips) ?? { route, plan: null };
  const last = walk.plan;
  const asLast = [
    pick ? routeNameOf(pick, walk.route, lang) : null,
    last?.start ? tx("štart {name}", { name: tx(last.start.label) }) : null,
    last ? tx(last.transit ? (last.fixed ? "vlakom" : "autobusom") : "autom") : null,
    last?.withKids ? tx("s deťmi") : null,
  ].filter((x): x is string => !!x);
  // The window goes first: while it is open the page behind does not scroll, so the plan could not be shown.
  const again = () =>
    leave(() => {
      onClose();
      window.setTimeout(() => planAgain(walk), 60);
    });

  useEffect(() => {
    if (visits.length === 0 && inner === null) onClose();
  }, [visits.length, inner, onClose]);

  useEffect(() => {
    if (inner) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && leave(onClose);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inner, leave, onClose]);

  if (inner?.kind === "edit") {
    const v = inner.visit;
    return (
      <VisitSheet
        name={name}
        slug={slug}
        reviewed={reviewed}
        pick={pick}
        edit={{
          date: v.date,
          route: v.route,
          onRemove: () => remove(v),
        }}
        onSave={(date, picked) => editVisit(v.id, picked === undefined ? { date } : { date, route: picked })}
        onClose={() => setInner(null)}
      />
    );
  }
  if (inner?.kind === "add") {
    return (
      <VisitSheet
        name={name}
        slug={slug}
        reviewed={reviewed}
        pick={pick}
        onSave={(date, picked) => {
          addVisitByHand({ slug: place, route: picked ?? route, name, date });
          track("trip_done", { trail: slug, how: "page" });
        }}
        onClose={() => setInner(null)}
      />
    );
  }
  if (inner?.kind === "review") {
    return (
      <ReviewSheet
        slug={reviewSlug}
        name={name}
        onDone={(sent) => {
          if (sent && trips.some((x) => x.slug === reviewSlug)) patch(reviewSlug, { reviewed: true });
          setInner(null);
        }}
      />
    );
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={tx("Vaše návštevy")} className="fixed inset-0 z-50 grid place-items-center p-4">
      <div data-state={motion} className="pres pres-backdrop absolute inset-0 touch-none bg-black/45" onClick={() => leave(onClose)} />
      <div data-state={motion} className="pres pres-pop relative flex max-h-[calc(100dvh-2rem)] w-full max-w-[420px] flex-col gap-3 overflow-y-auto overscroll-contain rounded-[var(--radius-card)] bg-[var(--card-bg)] p-5 shadow-[var(--shadow-float)]">
        <div>
          <h2 className="text-lg font-extrabold">{tx("Vaše návštevy")}</h2>
          <p className="text-sm text-[var(--muted)]">{name}</p>
        </div>
        <ul className="flex flex-col gap-2">
          {visits.map((v) => {
            const kind = parseWhen(v.date).kind;
            // At a place with several routes the second line is the route; a route the place lost says nothing.
            const walked = !pick ? null : v.route === UNKNOWN_ROUTE ? tx("trasu neviete") : routeNameOf(pick, v.route, lang);
            const under = walked ?? (kind === "day" || kind === "unknown" ? null : tx("presný deň neviete"));
            // Asked to remove this one: the row turns into the question, so the answer sits where the tap was.
            if (asking === v.id) {
              return (
                <li key={v.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-[var(--danger-bg)] px-3.5 py-2.5 text-sm">
                  <span className="basis-full font-semibold">
                    {tx("Naozaj odstrániť?")} <span className="font-data whitespace-nowrap font-normal">{whenLabel(v.date, lang)}</span>
                  </span>
                  <button type="button" onClick={() => { setAsking(null); remove(v); }} className={`${REMOVE_NOW} ${focus}`}>
                    <UiIcon name="trash" size={16} />
                    {tx("Odstrániť")}
                  </button>
                  <button type="button" onClick={() => setAsking(null)} className={`min-h-10 rounded-full border border-[var(--border)] bg-[var(--card-bg)] px-4 py-2 text-sm font-semibold ${focus}`}>
                    {tx("Nechať")}
                  </button>
                </li>
              );
            }
            return (
              <li key={v.id} className="flex items-stretch gap-2">
                <button type="button" onClick={() => setInner({ kind: "edit", visit: v })} className={`flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-[var(--border)] px-3.5 py-2.5 text-left ${focus}`}>
                  <VisitMark done />
                  <span className="min-w-0 flex-1">
                    {kind === "day" ? (
                      <span className="font-data block whitespace-nowrap text-[17px]">{whenLabel(v.date, lang)}</span>
                    ) : kind === "unknown" ? (
                      <span className="block text-[14.5px] text-[var(--muted)]">{whenLabel(v.date, lang)}</span>
                    ) : (
                      <b className="block text-[14.5px]">{whenLabel(v.date, lang)}</b>
                    )}
                    {under && <span className="block text-[13px] text-[var(--muted)]">{under}</span>}
                  </span>
                  <UiIcon name="chev" size={18} className="text-[var(--muted)]" />
                </button>
                {/* Straight from the list (Peter, 26 Nov 2026): no need to open the visit to remove it. */}
                <button type="button" aria-label={tx("Odstrániť návštevu")} onClick={() => setAsking(v.id)} className={`grid min-h-11 w-11 shrink-0 place-items-center rounded-xl border border-[var(--danger)] text-[var(--danger)] ${focus}`}>
                  <UiIcon name="trash" size={20} />
                </button>
              </li>
            );
          })}
        </ul>
        {canAdd && !gone && (
          <button type="button" onClick={() => setInner({ kind: "add" })} className={outline}>
            {tx("+ Pridať ďalšiu návštevu")}
          </button>
        )}
        {gone ? (
          <p className="text-sm text-[var(--muted)]">{tx("Tento výlet už nie je v ponuke.")}</p>
        ) : stars !== undefined ? (
          // How the visitor rated it, never the word "ohodnotené" (Peter, 26 Nov 2026); a tap changes it.
          <button type="button" onClick={() => setInner({ kind: "review" })} className={`flex min-h-10 w-full items-center gap-2 rounded-xl border border-[var(--border)] px-3.5 py-2 text-left text-sm ${focus}`}>
            <span className="min-w-0 flex-1 font-semibold">{tx("Vaše hodnotenie")}</span>
            <MyStars stars={stars} className="text-[17px]" />
            <span className="sr-only">{tx("{n} z 5", { n: stars })}</span>
            <span className="font-bold text-[var(--accent)] underline underline-offset-[3px]">{tx("Zmeniť")}</span>
          </button>
        ) : (
          <button type="button" onClick={() => setInner({ kind: "review" })} className={outline}>
            {tx(reviewed ? "Zmeniť hodnotenie" : "Ohodnotiť výlet")}
          </button>
        )}
        {!gone && (
          <div className="flex flex-col gap-1.5 border-t border-[var(--border)] pt-3">
            <button type="button" onClick={again} className={`flex min-h-10 w-full items-center justify-center rounded-full border border-[var(--accent)] px-4 py-2.5 text-sm font-bold text-[var(--accent)] hover:bg-[var(--accent-soft)] ${focus}`}>
              {tx("Naplánovať znova")}
            </button>
            {asLast.length > 0 && (
              <p data-as-last className="text-center text-[13px] text-[var(--muted)]">
                {tx("Ako naposledy: {what}", { what: asLast.join(" · ") })}
              </p>
            )}
            {openHref && (
              <LangLink href={openHref} className={`self-center py-1 text-sm font-bold text-[var(--accent)] underline underline-offset-[3px] ${focus}`}>
                {tx("Otvoriť výlet")}
              </LangLink>
            )}
          </div>
        )}
        <p className="text-[13px] text-[var(--muted)]">{tx(pick ? "Ťuknutím na návštevu zmeníte dátum, trasu alebo ju odstránite." : "Ťuknutím na návštevu zmeníte dátum alebo ju odstránite.")}</p>
        <div className="flex justify-end">
          <button type="button" onClick={() => leave(onClose)} className={`rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-bold text-[var(--accent-contrast)] min-h-10 ${focus}`}>
            {tx("Hotovo")}
          </button>
        </div>
      </div>
    </div>
  );
}
