import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/SiteFooter";
import { TownTile } from "@/components/TownTile";
import { getTown, getTownTrips } from "@/lib/townTrips";
import { tripsCount } from "@/lib/format";
import { townFrom, townOf } from "@/lib/townNames";
import { pageMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { absoluteUrl } from "@/lib/site";
import { langPath, tr } from "@/lib/lang";
import type { Lang } from "@/lib/lang";
import { photoSource } from "@/lib/tripFiles";

export function townMetadata(id: string, lang: Lang) {
  const town = getTown(id);
  if (!town) return { title: tr(lang, "Mesto sa nenašlo"), robots: { index: false } };
  return pageMetadata({
    title: tr(lang, "Výlety {from} a okolia – túry na jeden deň", { from: townFrom(lang, town.id, town.name) }),
    description: tr(lang, "Jednodňové výlety do hôr a prírody do hodiny a pol autom z mesta {town}: hrady, vrcholy, jaskyne, výlety s deťmi. Koľko trvá cesta a túra a kedy vyraziť.", { town: town.name }),
    path: `/vylety-z/${town.id}`,
    lang,
  });
}

/** A browse page: rows of photo tiles, the place first and the facts second. */
export async function TownView({ id, lang }: { id: string; lang: Lang }) {
  const data = await getTownTrips(id);
  if (!data) notFound();
  const { town, total, rows } = data;
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
  const credits = rows.flatMap((r) => r.tiles).filter((t, i, all) => t.photo && all.findIndex((x) => x.slug === t.slug) === i);

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
                { "@type": "ListItem", position: 3, name: tr(lang, "Okolo {town}", { town: around }), item: url },
              ],
            },
            {
              "@type": "ItemList",
              "@id": `${url}#vylety`,
              name: tr(lang, "Výlety okolo {town}", { town: around }),
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
        <h1 className="text-[2.3rem] leading-none font-extrabold tracking-tight">{tr(lang, "Okolo {town}", { town: around })}</h1>
        <p className="font-medium text-[var(--muted)]">{tr(lang, "{n} do hodiny a pol autom", { n: tripsCount(total, lang) })}</p>
        {intro && <p className="mt-1 text-sm text-[var(--muted)]">{intro}</p>}
      </header>
      {rows.map((row) => (
        <section key={row.title} className="flex flex-col gap-2.5">
          <h2 className="flex items-baseline justify-between gap-2 text-[1.35rem] leading-tight font-extrabold tracking-tight">
            {tr(lang, row.title)}
            <span className="text-sm font-medium text-[var(--muted)]">{row.count}</span>
          </h2>
          <div className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1.5 [scrollbar-width:none]">
            {row.tiles.map((tile) => (
              <TownTile key={tile.slug} tile={tile} lang={lang} townId={town.id} />
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
        <details className="text-[13px] text-[var(--muted)]">
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
