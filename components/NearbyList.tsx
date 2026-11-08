"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { dayMonthOf, inYearlyRange, pluralClass, todayMonthDay } from "@/lib/closedToday";
import { tr } from "@/lib/lang";
import type { Lang } from "@/lib/lang";
import { Nums } from "@/components/Nums";
import { UiIcon } from "@/components/UiIcon";

/** One neighbouring trip, all text ready (the server wrote it in the page's language). */
export interface NearbyItem {
  slug: string;
  href: string;
  name: string;
  meta: string;
  /** The yearly closure chip text ("zatvorené 1. 11.–31. 5."), when a rule covers the trip. */
  chip: string | null;
  /** The yearly rule as "MM-DD". */
  from: string | null;
  to: string | null;
}

/** How many not-closed neighbours show. */
const SHOWN = 7;

const CARD = "rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card-bg)]";

const noop = () => () => {};
/** Today's "MM-DD" in the browser; null on the server and while hydrating, so the built HTML never depends on the date. */
const useToday = () => useSyncExternalStore(noop, () => todayMonthDay(), () => null);

function Card({ item, hidden }: { item: NearbyItem; hidden?: boolean }) {
  return (
    <li hidden={hidden} className={`${CARD} hover:border-[var(--accent)]`}>
      <Link href={item.href} className="flex min-h-14 items-center gap-3 rounded-[var(--radius-card)] px-4 py-3">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-base font-semibold leading-snug text-[var(--foreground)]">{item.name}</span>
          <span className="text-sm leading-snug text-[var(--muted)]">
            <Nums text={item.meta} />
          </span>
          {item.chip && (
            <span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-[var(--danger-bg)] px-2.5 py-1 text-xs font-semibold text-[var(--danger)]">
              <UiIcon name="warn" size={12} />
              {item.chip}
            </span>
          )}
        </span>
        <span className="text-[var(--muted)]">
          <UiIcon name="chev" size={16} />
        </span>
      </Link>
    </li>
  );
}

function closedHeading(lang: Lang, n: number): string {
  const c = pluralClass(n);
  if (c === "one") return tr(lang, "{n} ďalší výlet v okolí je teraz uzavretý", { n });
  if (c === "few") return tr(lang, "{n} ďalšie výlety v okolí sú teraz uzavreté", { n });
  return tr(lang, "{n} ďalších výletov v okolí je teraz uzavretých", { n });
}

/**
 * The neighbour cards. In the built HTML (and without JavaScript) every one is a plain link in distance
 * order. In the browser, trips whose yearly closure is in force today move into one collapsed card at
 * the end and only the first SHOWN of the rest stay visible: the links remain in the page either way.
 */
export function NearbyList({ lang, items }: { lang: Lang; items: NearbyItem[] }) {
  const today = useToday();
  const closedNow = (i: NearbyItem) => today !== null && i.from !== null && i.to !== null && inYearlyRange(i.from, i.to, today);
  const open = items.filter((i) => !closedNow(i));
  const closed = items.filter(closedNow);
  const ends = new Set(closed.map((i) => i.to));
  const end = ends.size === 1 ? [...ends][0] : null;
  return (
    <>
      <ul className="flex flex-col gap-2.5">
        {open.map((item, i) => (
          <Card key={item.slug} item={item} hidden={today !== null && i >= SHOWN} />
        ))}
      </ul>
      {closed.length > 0 && (
        <details className={`group ${CARD}`}>
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-[var(--radius-card)] px-4 py-3 [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 flex-1 text-base leading-snug font-semibold text-[var(--foreground)]">
              <Nums text={closedHeading(lang, closed.length) + (end ? ` ${tr(lang, "(do {when})", { when: dayMonthOf(end) })}` : "")} />
            </span>
            <span className="text-[var(--muted)] group-open:rotate-90 motion-safe:transition-transform motion-reduce:transition-none">
              <UiIcon name="chev" size={16} />
            </span>
          </summary>
          <ul className="flex flex-col gap-2.5 px-3 pb-3">
            {closed.map((item) => (
              <Card key={item.slug} item={item} />
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
