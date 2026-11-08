"use client";

import { useEffect, useState } from "react";
import { formatDateSk } from "@/lib/format";
import { isoDate } from "@/lib/days";
import type { Fit } from "@/lib/reviewLimits";
import { useSavedTrips } from "@/lib/savedTrips";
import { ReviewSheet } from "@/components/ReviewSheet";
import { LangLink, useLang, useT } from "@/lib/i18n";
import { decimal } from "@/lib/lang";

/** Shown once a trip has this many reviews: fewer says more about one group than the trail. */
const MIN_SHOWN = 3;

const FIT_WORDS: Record<Fit, string> = { popis: "podľa popisu", tazsie: "ťažšie, ako čakali", lahsie: "ľahšie, ako čakali" };

interface Summary {
  n: number;
  stars?: number;
  fit?: Record<Fit, number>;
  crowded?: number;
}

/**
 * Under the trip facts: what other groups said (stars, matched the description, crowds),
 * and, when this trip is saved for a day that has passed, "Boli ste na výlete?" (Peter, 2026-10-22).
 */
export function TripReviews({ slug, name }: { slug: string; name: string }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const { trips, patch } = useSavedTrips();
  const [reviewing, setReviewing] = useState(false);
  const tx = useT();
  const lang = useLang();
  const saved = trips.find((t) => t.slug === slug);
  const ask = saved && !saved.doneAt && !saved.skipAsk && saved.date < isoDate(new Date());

  useEffect(() => {
    let live = true;
    fetch(`/api/review?slug=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((s: Summary | null) => live && setSummary(s))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [slug]);

  const shown = summary && summary.n >= MIN_SHOWN && summary.stars !== undefined;
  const topFit = shown && summary.fit ? (Object.entries(summary.fit) as [Fit, number][]).sort((a, b) => b[1] - a[1])[0] : null;

  return (
    <>
      {shown && (
        <p className="flex flex-wrap items-center gap-x-2 text-[14px]">
          <span className="font-bold">
            <span className="text-[#f5b301]">★</span> {decimal(lang, summary.stars!)}
          </span>
          <span className="text-[var(--muted)]">· {tx("{n} hodnotení", { n: summary.n })}</span>
          {topFit && topFit[1] > 0 && <span className="text-[var(--muted)]">· {tx("väčšinou {how}", { how: tx(FIT_WORDS[topFit[0]]) })}</span>}
          {summary.crowded! * 2 > summary.n && <span className="text-[var(--muted)]">· {tx("často veľa ľudí")}</span>}
        </p>
      )}
      {shown && (
        <details className="text-xs text-[var(--muted)]">
          <summary className="cursor-pointer">{tx("Ako fungujú hodnotenia")}</summary>
          <p className="pt-1">
            {tx("Neoveríme, že ste na výlete boli, preto hodnotenia neoznačujeme ako overené. Počet hodnotení z jednej adresy za minútu je obmedzený. Hodnotenia priebežne prezeráme a zjavný spam alebo hromadne pridané hodnotenia mažeme. Sami výlety nehodnotíme za iných a hodnotenia neupravujeme. Hodnotenia členov tímu označíme.")}{" "}
            <LangLink href="/podmienky#b6" className="underline">
              {tx("Viac v podmienkach")}
            </LangLink>
          </p>
        </details>
      )}
      {ask && (
        <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-[var(--accent)] bg-[var(--card-bg)] p-3">
          <span className="flex-1 text-[15px] font-bold">{tx("Boli ste na výlete {date}?", { date: formatDateSk(saved.date, lang) })}</span>
          <button
            type="button"
            onClick={() => {
              patch(slug, { doneAt: new Date().toISOString() });
              if (!saved.reviewed) setReviewing(true);
            }}
            className="rounded-full bg-[var(--ok)] px-4 py-2 text-sm font-bold text-white"
          >
            {tx("Áno")} ✓
          </button>
          <button type="button" onClick={() => patch(slug, { skipAsk: true })} className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-semibold">
            {tx("Ešte nie")}
          </button>
        </div>
      )}
      {reviewing && (
        <ReviewSheet
          slug={slug}
          name={name}
          onDone={(sent) => {
            if (sent) patch(slug, { reviewed: true });
            setReviewing(false);
          }}
        />
      )}
    </>
  );
}
