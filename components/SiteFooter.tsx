"use client";

import { CONTACT_EMAIL, TESTER_FORM_URL } from "@/lib/site";
import { LangLink, useT } from "@/lib/i18n";
import { UiIcon } from "@/components/UiIcon";
import type { UiIconName } from "@/lib/uiIcons";

type FooterLink = { href: string; label: string; icon: UiIconName };

/** Three short groups, so a new link (e.g. "Získať aplikáciu") just joins one. */
const GROUPS: { title: string; links: FooterLink[] }[] = [
  {
    title: "Výlety",
    links: [
      { href: "/vylety-z", label: "Výlety z miest", icon: "peak" },
      { href: "/aplikacia", label: "Získať appku", icon: "phone" },
      { href: "/zdroje", label: "Zdroje", icon: "book" },
    ],
  },
  {
    title: "Kontakt",
    links: [
      { href: "/napiste-nam", label: "Napíšte nám", icon: "chat" },
      { href: "/nahlasit-chybu", label: "Nahlásiť chybu", icon: "flag" },
    ],
  },
  {
    title: "O projekte",
    links: [
      { href: "/ako-to-funguje", label: "Ako to funguje", icon: "help" },
      { href: "/o-nas", label: "O nás", icon: "person" },
      { href: "/sukromie", label: "Súkromie", icon: "lock" },
      { href: "/pristupnost", label: "Prístupnosť", icon: "access" },
      { href: "/podmienky", label: "Podmienky", icon: "doc" },
      { href: "/upozornenie", label: "Upozornenie", icon: "warn" },
      { href: "/uzavery", label: "Uzávery", icon: "barrier" },
    ],
  },
];

const LINK =
  "flex min-w-0 items-center gap-2 py-1 text-[var(--muted)] hover:text-[var(--accent)] hover:underline";

/** Name, slogan and the tester button, link groups with icons, then the safety note and data credits, at the bottom of every page. */
export function SiteFooter() {
  const t = useT();
  return (
    // Sized by its own width, not the screen's: on a computer it also sits in the narrow trip panel.
    <footer className="@container mt-auto border-t border-[var(--border)] pt-5 text-sm text-[var(--muted)]">
      <div className="flex flex-col gap-4 @2xl:grid @2xl:grid-cols-[200px_minmax(0,1fr)] @2xl:gap-x-8">
        <div className="flex flex-col gap-1">
          <picture>
            <source
              srcSet="/brand/turuj-wordmark-on-dark.svg"
              media="(prefers-color-scheme: dark)"
            />
            <img
              src="/brand/turuj-wordmark.svg"
              alt="Túruj"
              width={56}
              height={24}
              className="h-6 w-auto"
            />
          </picture>
          <p className="text-[13px]">
            {t("Neplánuj.")}{" "}
            <strong className="accent-on-sunk">{t("Turuj.")}</strong>
          </p>
          <a
            href={TESTER_FORM_URL}
            target="_blank"
            rel="noopener noreferrer"
            data-umami-event="tester_signup_open"
            className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-full bg-[var(--accent)] px-3.5 py-2 font-bold whitespace-nowrap text-[var(--accent-contrast)] hover:opacity-90"
          >
            <UiIcon name="star" size={15} />
            {t("Chcem testovať")}
          </a>
        </div>
        <nav
          aria-label={t("Pätička")}
          className="grid grid-cols-2 gap-x-4 gap-y-4 @md:grid-cols-3"
        >
          {GROUPS.map((g) => (
            <div key={g.title} className="flex min-w-0 flex-col gap-0.5">
              <h2 className="pb-1 text-[11px] font-extrabold tracking-[0.07em] text-[var(--foreground)] uppercase">
                {t(g.title)}
              </h2>
              {g.links.map((l) => (
                <LangLink key={l.href} href={l.href} className={LINK}>
                  <UiIcon name={l.icon} size={16} />
                  <span className="min-w-0">{t(l.label)}</span>
                </LangLink>
              ))}
              {g.title === "Kontakt" && (
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="flex min-w-0 items-center gap-2 py-1 accent-on-sunk font-semibold break-all hover:underline"
                >
                  <UiIcon name="mail" size={16} />
                  <span className="min-w-0">{CONTACT_EMAIL}</span>
                </a>
              )}
            </div>
          ))}
        </nav>
        <div className="flex flex-col gap-0.5 border-t border-[var(--border)] pt-3 text-xs @2xl:col-span-2">
          <p>{t("Časy sú odhad. Na horách rozhoduje počasie a vaše sily.")}</p>
          <p>
            {t("Mapa a dáta:")}{" "}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              © OpenStreetMap
            </a>
            ,{" "}
            <a
              href="https://openfreemap.org"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              OpenFreeMap
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
