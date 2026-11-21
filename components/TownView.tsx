import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/SiteFooter";
import { ClosedSinks } from "@/components/ClosedSinks";
import { TownTile } from "@/components/TownTile";
import { ShownBetween } from "@/components/ShownBetween";
import { UiIcon } from "@/components/UiIcon";
import { dayMonthOf, todayMonthDay } from "@/lib/closedToday";
import { HOLIDAY_DATES, HOLIDAY_SHOWN, HOLIDAY_SUN_DAY } from "@/lib/holidayBlock";
import { SATELLITE_TOWNS, getTownTrips } from "@/lib/townTrips";
import { tripsCount } from "@/lib/format";
import { townFrom, townOf } from "@/lib/townNames";
import { pageMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { absoluteUrl } from "@/lib/site";
import { langPath, tr } from "@/lib/lang";
import type { Lang } from "@/lib/lang";
import { photoSource } from "@/lib/tripFiles";

/** "12 túr" (1 túra, 2-4 túry, 5+ túr); "12 hikes" in English. */
function hikesCount(n: number, lang: Lang): string {
  if (lang === "en") return n === 1 ? "1 hike" : `${n} hikes`;
  return n === 1 ? "1 túra" : n >= 2 && n <= 4 ? `${n} túry` : `${n.toLocaleString("sk-SK")} túr`;
}

/**
 * Title and description in the words people search: "výlety v okolí {mesta}" (research 01 #4, 02 §7; C40).
 * Towns with only a few trips within an hour count the whole 1.5 h reach instead, so the title never says "2 túry".
 */
export async function townMetadata(id: string, lang: Lang) {
  const data = await getTownTrips(id, lang);
  if (!data) return { title: tr(lang, "Mesto sa nenašlo"), robots: { index: false } };
  const { town, total, withinHour, kidsWithinHour } = data;
  const around = townOf(lang, town.id, town.name);
  const title =
    lang === "en"
      ? tr(lang, "Day trips & hikes from {town}", { town: town.name })
      : withinHour >= 10
        ? `Výlety v okolí ${around}: ${hikesCount(withinHour, lang)} do 1 h autom`
        : `Výlety v okolí ${around}: ${hikesCount(total, lang)} do 1,5 h autom`;
  const description = tr(lang, "{hour} do hodiny autom {from}, z toho {kids} pre rodiny s deťmi, spolu {total} do hodiny a pol. Hrady, vrcholy, jaskyne: pri každom parkovanie, autobus či vlak a kedy najneskôr vyraziť.", {
    hour: tripsCount(withinHour, lang),
    from: townFrom(lang, town.id, town.name),
    kids: kidsWithinHour.toLocaleString(lang === "en" ? "en-GB" : "sk-SK"),
    total: total.toLocaleString(lang === "en" ? "en-GB" : "sk-SK"),
  });
  const meta = pageMetadata({ title, description, path: `/vylety-z/${town.id}`, lang });
  // A small town next to a bigger one with the same trips: open to people, not offered to search engines.
  return SATELLITE_TOWNS[town.id] ? { ...meta, robots: { index: false, follow: true } } : meta;
}

/** A browse page: rows of photo tiles, the place first and the facts second. */
export async function TownView({ id, lang }: { id: string; lang: Lang }) {
  const data = await getTownTrips(id, lang);
  if (!data) notFound();
  const { town, total, rows, holiday } = data;
  const url = absoluteUrl(langPath(lang, `/vylety-z/${town.id}`));
  const around = townOf(lang, town.id, town.name);
  const listed = rows.flatMap((r) => r.tiles).filter((t, i, all) => all.findIndex((x) => x.slug === t.slug) === i);
  // A line of text from the page's own facts, so the town page reads as more than a grid of tiles.
  const nearest = [...listed].sort((a, b) => a.carMin - b.carMin).slice(0, 3);
  const kids = listed.filter((t) => t.kids).length;
  const intro =
    lang === "sk" && nearest.length
      ? `Najbližšie výlety ${townFrom(lang, town.id, town.name)}: ${nearest.map((t) => `${t.name} (${t.carMin} min autom)`).join(", ")}.` +
        (kids ? ` Z výletov na tejto stránke sa ${kids === 1 ? "1 hodí" : kids < 5 ? `${kids} hodia` : `${kids} hodí`} aj pre rodiny s deťmi.` : "") +
        " Pri každom nájdete parkovanie, autobus či vlak a čas, kedy najneskôr vyraziť."
      : null;
  const credits = [...(holiday?.tiles ?? []), ...rows.flatMap((r) => r.tiles)].filter((t, i, all) => t.photo && all.findIndex((x) => x.slug === t.slug) === i);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-6">
      {/* schema.org data: breadcrumbs and the trips the page lists, so search engines see the page as a list of places. */}
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: tr(lang, "Výlety"), item: absoluteUrl(langPath(lang, "/")) },
                { "@type": "ListItem", position: 2, name: tr(lang, "Výlety z miest"), item: absoluteUrl(langPath(lang, "/vylety-z")) },
                { "@type": "ListItem", position: 3, name: tr(lang, "Výlety v okolí {town}", { town: around }), item: url },
              ],
            },
            {
              "@type": "ItemList",
              "@id": `${url}#vylety`,
              name: tr(lang, "Výlety v okolí {town}", { town: around }),
              numberOfItems: listed.length,
              itemListElement: listed.map((t, i) => ({
                "@type": "ListItem",
                position: i + 1,
                name: t.name,
                url: absoluteUrl(langPath(lang, `/trasa/${t.slug}`)),
              })),
            },
          ],
        }}
      />
      <div className="flex items-center justify-between gap-3">
        <Link href={langPath(lang, "/")} className="w-fit text-sm font-semibold text-[var(--accent)]">
          ← {tr(lang, "Všetky výlety")}
        </Link>
      </div>
      <header className="flex flex-col gap-1">
        <h1 className="text-[2.3rem] leading-none font-extrabold tracking-tight">{tr(lang, "Výlety v okolí {town}", { town: around })}</h1>
        <p className="font-medium text-[var(--muted)]">{tr(lang, "{n} do hodiny a pol autom", { n: tripsCount(total, lang) })}</p>
        {intro && <p className="mt-1 text-sm text-[var(--muted)]">{intro}</p>}
      </header>
      {holiday && (
        // Christmas holidays (C64b): short trips with kids and when to leave, while the days are shortest.
        <ShownBetween from={HOLIDAY_SHOWN.from} to={HOLIDAY_SHOWN.to}>
          <section className="flex flex-col gap-2.5">
            <div className="flex flex-col gap-0.5">
              <h2 className="flex items-baseline justify-between gap-2 text-[1.35rem] leading-tight font-extrabold tracking-tight">
                {tr(lang, "Cez sviatky")}
                <span className="text-sm font-medium text-[var(--muted)]">{holiday.tiles.length}</span>
              </h2>
              <p className="text-[12.5px] text-[var(--muted)]">
                {tr(lang, "Krátke výlety s deťmi")} ·{" "}
                <span className="whitespace-nowrap">
                  {dayMonthOf(HOLIDAY_DATES.from, lang)} – {dayMonthOf(HOLIDAY_DATES.to, lang)}
                </span>
              </p>
            </div>
            <p className="flex items-start gap-2.5 rounded-xl bg-[var(--sun-soft)] px-3 py-2.5 text-sm leading-snug">
              <span className="mt-px flex-none text-[var(--time)]">
                <UiIcon name="sunset" size={22} />
              </span>
              <span>
                {tr(lang, "Slnko zapadá o")} <b className="font-data text-xl leading-none whitespace-nowrap text-[var(--time)]">{holiday.sunset}</b>{" "}
                <span className="text-[12.5px] whitespace-nowrap text-[var(--muted)]">({dayMonthOf(HOLIDAY_SUN_DAY, lang)})</span>. {tr(lang, "Dni sú krátke, z túry buďte dole ešte za svetla.")}
              </span>
            </p>
            <div className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1.5 [scrollbar-width:none]">
              {holiday.tiles.map((tile) => (
                <div key={tile.slug} className="flex-none snap-start">
                  <TownTile tile={tile} lang={lang} townId={town.id} />
                </div>
              ))}
            </div>
            <p className="flex gap-1.5 text-[12.5px] leading-snug text-[var(--muted)]">
              <span className="mt-px flex-none">
                <UiIcon name="clock" size={15} />
              </span>
              <span>
                {tr(lang, "Čas „vyrazte do“ ráta cestu autom {from} a túru detským tempom tak, aby ste boli dole pol hodiny pred západom slnka.", { from: townFrom(lang, town.id, town.name) })}{" "}
                {tr(lang, "Bez známej uzávery k {date}, stav chodníka neoverený. Hrady a jaskyne môžu mať cez sviatky zatvorené, overte si ich.", { date: dayMonthOf(todayMonthDay(), lang) })}
              </span>
            </p>
          </section>
        </ShownBetween>
      )}
      {rows.map((row) => (
        <section key={row.title} className="flex flex-col gap-2.5">
          <h2 className="flex items-baseline justify-between gap-2 text-[1.35rem] leading-tight font-extrabold tracking-tight">
            {tr(lang, row.title, { town: around })}
            <span className="text-sm font-medium text-[var(--muted)]">{row.count}</span>
          </h2>
          <div className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1.5 [scrollbar-width:none]">
            {row.tiles.map((tile) => (
              <ClosedSinks key={tile.slug} range={tile.closedRange}>
                <TownTile tile={tile} lang={lang} townId={town.id} />
              </ClosedSinks>
            ))}
          </div>
        </section>
      ))}
      <Link
        href={langPath(lang, "/")}
        className="flex h-11 items-center justify-center rounded-xl bg-[var(--accent)] font-bold text-[var(--accent-contrast)]"
      >
        {tr(lang, "Všetky výlety na mape")}
      </Link>
      {credits.length > 0 && (
        <details className="details-roll text-[13px] text-[var(--muted)]">
          <summary className="cursor-pointer font-semibold">{tr(lang, "Autori fotiek")}</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {credits.map((t) => (
              <li key={t.slug}>
                {t.name}:{" "}
                <a href={t.photo!.page} className="underline" rel="noopener">
                  {t.photo!.author}
                </a>
                , <LicenseName name={t.photo!.license} url={t.photo!.license_url} lang={lang} />, {photoSource(t.photo!)}
              </li>
            ))}
          </ul>
        </details>
      )}
      <SiteFooter />
    </main>
  );
}

/** "CC BY-SA 4.0" linked to the licence text, as the CC licences ask; CC0 and public domain as plain text. */
function LicenseName({ name, url: given, lang }: { name: string; url?: string | null; lang: Lang }) {
  const m = /^CC (BY(?:-SA)?) (\d\.\d)(?: ([a-z]{2}))?$/.exec(name);
  if (given?.startsWith("https://") || m) {
    const url = given?.startsWith("https://") ? given : `https://creativecommons.org/licenses/${m![1].toLowerCase()}/${m![2]}/${m![3] ? `${m![3]}/` : ""}`;
    return (
      <a href={url} className="underline" rel="noopener license">
        {name}
      </a>
    );
  }
  if (name === "CC0") {
    return (
      <a href="https://creativecommons.org/publicdomain/zero/1.0/" className="underline" rel="noopener license">
        CC0
      </a>
    );
  }
  return <>{name === "Public domain" ? tr(lang, "voľné dielo") : name}</>;
}
