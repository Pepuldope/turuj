"use client";

import { useLang, useT } from "@/lib/i18n";
import { APP_SCREENS, SCREEN_HEIGHT, SCREEN_WIDTH, screenPath } from "@/lib/appScreens";

/** Three phone screenshots of Túruj: the trip list, a day plan, the saved trips. */
export function AppScreens() {
  const t = useT();
  const lang = useLang();
  return (
    <section className="flex flex-col gap-3">
      <h2>{t("Ako Túruj vyzerá")}</h2>
      <ul className="!m-0 !flex list-none snap-x snap-mandatory gap-3 overflow-x-auto !pl-0 pb-1 sm:overflow-visible">
        {APP_SCREENS.map((s) => (
          <li key={s.id} className="!mt-0 flex w-[160px] shrink-0 snap-start flex-col gap-2 sm:w-auto sm:min-w-0 sm:flex-1 sm:shrink">
            {/* eslint-disable-next-line @next/next/no-img-element -- fixed static files, already WebP */}
            <img
              src={screenPath(lang, s.id)}
              width={SCREEN_WIDTH}
              height={SCREEN_HEIGHT}
              alt={t(s.alt)}
              loading="lazy"
              decoding="async"
              className="h-auto w-full rounded-[var(--radius-card)] border border-[var(--border)] shadow-[var(--shadow-card)]"
            />
            <p className="text-[13px] leading-snug text-[var(--muted)]">{t(s.caption)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
