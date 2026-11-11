"use client";

import type { RouteBrief } from "@/lib/tripSchema";
import type { RouteWalk } from "@/lib/walkFacts";
import { RouteRows, ShorterRouteHint } from "@/components/RouteRows";
import { Dot, routeLabel } from "@/components/routeBits";
import { LangLink, useLang, useT } from "@/lib/i18n";
import { routeNameIn } from "@/lib/lang";
import type { Lang } from "@/lib/lang";

const plural = (n: number, lang: Lang) => (lang === "en" ? `${n} routes` : n >= 5 ? `${n} ciest` : `${n} cesty`);

interface Props {
  /** The trip on screen. */
  slug: string;
  destination: string;
  /** The main route first, then the others (the trip file's "routes"). */
  routes: RouteBrief[];
  /** Each route's walk from its default parking and stop (lib/tripFiles.ts getRouteWalks). */
  walks: Record<string, RouteWalk>;
}

/**
 * Most places have more than one marked route. The page shows the main one (the start most
 * people use); here you switch to another. Phones get one folded "Cesta" row so the page stays
 * easy to scroll; wider screens list the routes as cards. Both link to the map comparison.
 */
export function RouteChoice({ slug, destination, routes, walks }: Props) {
  const t = useT();
  const lang = useLang();
  if (routes.length < 2) return null;
  const at = Math.max(0, routes.findIndex((r) => r.slug === slug));
  const current = routes[at];
  const compare = `/trasa/${slug}/cesty`;

  const rows = <RouteRows routes={routes} at={at} walks={walks} />;

  return (
    <section aria-label={t("Cesty k cieľu: {name}", { name: destination })} className="flex flex-col gap-2">
      <ShorterRouteHint routes={routes} at={at} walks={walks} />
      {/* Phones: the map comparison is the main way to choose; the list folds into one row. */}
      <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card-bg)] lg:hidden">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-3 px-3.5 py-2.5 [&::-webkit-details-marker]:hidden">
            <Dot i={at} />
            <span className="flex min-w-0 flex-col">
              <span className="text-[12px] text-[var(--muted)]">{t("Cesta")}</span>
              <span className="truncate text-[15px] font-bold">
                {routeNameIn(lang, routeLabel(current))} · {current.start_name}
              </span>
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-1 text-[13px] font-semibold text-[var(--muted)]">
              {plural(routes.length, lang)}
              <svg aria-hidden width="14" height="14" viewBox="0 0 14 14" className="transition-transform group-open:rotate-180">
                <path d="M3 5l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </span>
          </summary>
          <ul className="flex flex-col divide-y divide-[var(--border)] border-t border-[var(--border)]">{rows}</ul>
        </details>
        <div className="border-t border-[var(--border)] p-2.5">
          <LangLink
            href={compare}
            className="flex w-full items-center justify-center rounded-xl bg-[var(--accent)] px-4 py-3 text-[15px] font-bold whitespace-nowrap text-[var(--accent-contrast)]"
          >
            {t("Porovnať na mape")} ›
          </LangLink>
        </div>
      </div>

      {/* Wider screens: every route as a card. */}
      <div className="hidden flex-col gap-2 lg:flex">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-base font-bold">{t("Cesty k cieľu: {name}", { name: destination })}</p>
          <LangLink href={compare} className="shrink-0 text-sm font-bold whitespace-nowrap text-[var(--accent)]">
            {t("Porovnať na mape")} ›
          </LangLink>
        </div>
        {/* The first and last rows follow the list's corners (16 px card minus the 1 px border), so their hover
            outline isn't cut off by the rounded edge (Peter, 2026-11-11). */}
        <ul className="flex flex-col divide-y divide-[var(--border)] overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card-bg)] [&>li:first-child>a]:rounded-t-[15px] [&>li:last-child>a]:rounded-b-[15px]">
          {rows}
        </ul>
      </div>
    </section>
  );
}
