"use client";

import { useEffect, useState } from "react";
import type { Fit } from "@/lib/reviewLimits";
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
 * Under the trip facts: what other groups said (stars, matched the description, crowds).
 * The "were you here?" question is the visited row (VisitRow).
 */
export function TripReviews({ slug }: { slug: string }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const tx = useT();
  const lang = useLang();

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
        <details className="details-roll text-xs text-[var(--muted)]">
          <summary className="cursor-pointer">{tx("Ako fungujú hodnotenia")}</summary>
          <p className="pt-1">
            {tx("Neoveríme, že ste na výlete boli, preto hodnotenia neoznačujeme ako overené. Počet hodnotení z jednej adresy za minútu je obmedzený. Hodnotenia priebežne prezeráme a zjavný spam alebo hromadne pridané hodnotenia mažeme. Sami výlety nehodnotíme za iných a hodnotenia neupravujeme. Hodnotenia členov tímu označíme.")}{" "}
            <LangLink href="/podmienky#b6" className="underline">
              {tx("Viac v podmienkach")}
            </LangLink>
          </p>
        </details>
      )}
    </>
  );
}
