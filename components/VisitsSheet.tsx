"use client";

import { useEffect, useState } from "react";
import { track } from "@/lib/analytics";
import { useLang, useT } from "@/lib/i18n";
import { useSavedTrips } from "@/lib/savedTrips";
import { addVisitByHand, dropVisit, editVisit, planVisitId } from "@/lib/visits";
import type { Visit } from "@/lib/visits";
import { parseWhen, whenLabel } from "@/lib/visitWhen";
import { ReviewSheet } from "@/components/ReviewSheet";
import { UiIcon } from "@/components/UiIcon";
import { VisitMark } from "@/components/VisitMark";
import { VisitSheet } from "@/components/VisitSheet";
import { useLeave } from "@/lib/usePresence";

const focus = "focus-visible:outline-2 focus-visible:outline-[var(--accent)]";
const outline = `flex min-h-10 w-full items-center justify-center rounded-full border border-[var(--border)] px-4 py-2.5 text-sm font-semibold ${focus}`;

type Inner = { kind: "edit"; visit: Visit } | { kind: "add" } | { kind: "review" } | null;

/**
 * "Vaše návštevy" (Peter, 25 Nov 2026): the visits of one place, latest first. A row opens the window of that
 * visit (change the day, or remove it); only one window is on screen at a time.
 */
export function VisitsSheet({
  visits,
  name,
  slug,
  place,
  route,
  single,
  reviewed,
  onClose,
}: {
  visits: Visit[];
  name: string;
  slug: string;
  place: string;
  route: string;
  single: boolean;
  reviewed: boolean;
  onClose: () => void;
}) {
  const tx = useT();
  const lang = useLang();
  const { trips, patch } = useSavedTrips();
  const { state: motion, leave } = useLeave();
  const [inner, setInner] = useState<Inner>(null);

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
        edit={{
          date: v.date,
          onRemove: () => {
            dropVisit(v.id);
            // A visit that came from a saved plan: the plan is not done any more and is not asked about again.
            const s = trips.find((x) => planVisitId(x.route ?? x.slug, x.date) === v.id);
            if (s) patch(s.slug, { doneAt: undefined, skipAsk: true });
          },
        }}
        onSave={(date) => editVisit(v.id, { date })}
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
        onSave={(date) => {
          addVisitByHand({ slug: place, route, name, date });
          track("trip_done", { trail: slug, how: "page" });
        }}
        onClose={() => setInner(null)}
      />
    );
  }
  if (inner?.kind === "review") {
    return (
      <ReviewSheet
        slug={slug}
        name={name}
        onDone={(sent) => {
          if (sent && trips.some((x) => x.slug === slug)) patch(slug, { reviewed: true });
          setInner(null);
        }}
      />
    );
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={tx("Vaše návštevy")} className="fixed inset-0 z-50 grid place-items-center p-4">
      <div data-state={motion} className="pres pres-backdrop absolute inset-0 bg-black/45" onClick={() => leave(onClose)} />
      <div data-state={motion} className="pres pres-pop relative flex max-h-[calc(100dvh-2rem)] w-full max-w-[420px] flex-col gap-3 overflow-y-auto rounded-[var(--radius-card)] bg-[var(--card-bg)] p-5 shadow-[var(--shadow-float)]">
        <div>
          <h2 className="text-lg font-extrabold">{tx("Vaše návštevy")}</h2>
          <p className="text-sm text-[var(--muted)]">{name}</p>
        </div>
        <ul className="flex flex-col gap-2">
          {visits.map((v) => {
            const kind = parseWhen(v.date).kind;
            return (
              <li key={v.id}>
                <button type="button" onClick={() => setInner({ kind: "edit", visit: v })} className={`flex min-h-10 w-full items-center gap-2.5 rounded-xl border border-[var(--border)] px-3.5 py-2.5 text-left ${focus}`}>
                  <VisitMark done />
                  <span className="min-w-0 flex-1">
                    {kind === "day" ? (
                      <span className="font-data whitespace-nowrap text-[17px]">{whenLabel(v.date, lang)}</span>
                    ) : kind === "unknown" ? (
                      <span className="text-[14.5px] text-[var(--muted)]">{whenLabel(v.date, lang)}</span>
                    ) : (
                      <>
                        <b className="block text-[14.5px]">{whenLabel(v.date, lang)}</b>
                        <span className="block text-[13px] text-[var(--muted)]">{tx("presný deň neviete")}</span>
                      </>
                    )}
                  </span>
                  <UiIcon name="chev" size={18} className="text-[var(--muted)]" />
                </button>
              </li>
            );
          })}
        </ul>
        {single && (
          <button type="button" onClick={() => setInner({ kind: "add" })} className={outline}>
            {tx("+ Pridať ďalšiu návštevu")}
          </button>
        )}
        {!reviewed && (
          <button type="button" onClick={() => setInner({ kind: "review" })} className={outline}>
            {tx("Ohodnotiť výlet")}
          </button>
        )}
        <p className="text-[13px] text-[var(--muted)]">{tx("Ťuknutím na návštevu zmeníte dátum alebo ju odstránite.")}</p>
        <div className="flex justify-end">
          <button type="button" onClick={() => leave(onClose)} className={`rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-bold text-[var(--accent-contrast)] min-h-10 ${focus}`}>
            {tx("Hotovo")}
          </button>
        </div>
      </div>
    </div>
  );
}
