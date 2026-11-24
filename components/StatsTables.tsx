"use client";

import { useEffect, useState } from "react";
import type { AccountMonth } from "@/lib/auth";
import type { DayEvents, MonthEvents } from "@/lib/eventCounts";
import type { MonthStats } from "@/lib/visitStore";
import { useT } from "@/lib/i18n";

interface Stats {
  months: MonthStats[] | null;
  events: MonthEvents[] | null;
  accounts?: { total: number; months: AccountMonth[] } | null;
  days?: DayEvents[] | null;
}

/** How a start came about (start_set's detail), in the order shown. "manual" is the name from before 8 Nov 2026. */
const START_HOW: [string, string][] = [
  ["gps", "poloha"],
  ["typed", "napísané miesto"],
  ["suggestion", "mesto z ponuky"],
  ["town_button", "tlačidlo mesta"],
  ["map_pick", "bod na mape"],
  ["town_page", "stránka mesta"],
  ["remembered", "zapamätaný"],
  ["manual", "napísané alebo vybrané (do 8. 11.)"],
];
/** The day-picker choices (day_pick's detail). */
const DAY_PICK: [string, string][] = [
  ["dnes", "Dnes"],
  ["zajtra", "Zajtra"],
  ["so", "Sobota"],
  ["ne", "Nedeľa"],
  ["iny", "Iný deň"],
];

/** "2026-11-23" -> "23. 11." (the site's date format; the space doesn't break). */
function shortDay(day: string): string {
  return `${Number(day.slice(8, 10))}.\u00a0${Number(day.slice(5, 7))}.`;
}

/** "poloha 12, napísané miesto 5": the counted choices in the listed order, zeros left out. */
function split(counts: Record<string, number> | undefined, labels: [string, string][], t: (s: string) => string): string {
  return labels
    .filter(([key]) => (counts?.[key] ?? 0) > 0)
    .map(([key, label]) => `${t(label)} ${counts![key]}`)
    .join(", ");
}

/** The tables on /statistiky, read from /api/statistiky when the page opens. */
export function StatsTables() {
  const t = useT();
  const [data, setData] = useState<Stats | "loading" | "error">("loading");
  useEffect(() => {
    fetch("/api/statistiky", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: Stats) => setData(d))
      .catch(() => setData("error"));
  }, []);

  if (data === "loading") return <p>{t("Načítavame…")}</p>;
  if (data === "error") return <p>{t("Čísla sa nepodarilo načítať. Skúste stránku obnoviť.")}</p>;
  const { months: rows, events, accounts, days } = data;

  return (
    <>
      {rows === null ? (
        <p>{t("Počítadlo beží len na zverejnenej stránke (Cloudflare).")}</p>
      ) : rows.length === 0 ? (
        <p>{t("Zatiaľ žiadne návštevy.")}</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="py-2">{t("Mesiac")}</th>
              <th>{t("Ľudia")}</th>
              <th>{t("2+ dni")}</th>
              <th>{t("4+ dni")}</th>
              <th>{t("4+ dni používania (otvorený alebo uložený výlet)")}</th>
              <th>{t("Priemer dní")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.month} className="border-b border-[var(--border)]">
                <td className="py-2">{r.month}</td>
                <td>{r.visitors}</td>
                <td>{r.visitors_2plus_days}</td>
                <td className="font-semibold">{r.visitors_4plus_days}</td>
                <td className="font-semibold">{r.visitors_4plus_use_days ?? 0}</td>
                <td>{r.avg_days}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {events && events.length > 0 && (
        <>
          <h2>{t("Plány")}</h2>
          <p className="text-sm">
            <b>{t("Naplánované")}</b>{" "}
            {t("(hlavné číslo): výlety, ktoré niekto uložil, poslal, spustil k nim navigáciu alebo stiahol GPX, každý výlet raz za otvorenie stránky (zbiera sa od novembra 2026). Ďalej koľkokrát v mesiaci bol zadaný štart, výlet uložený, plán poslaný (z toho do 2 minút od príchodu), plán otvorený kamarátom a spustená navigácia. Túruj+: kliknutia „Chcel by som to“ / „Za túto cenu nie“ na stránke /plus.")}
          </p>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="py-2">{t("Mesiac")}</th>
                <th>{t("Naplánované")}</th>
                <th>{t("Štart")}</th>
                <th>{t("Uložené")}</th>
                <th>{t("Poslané")}</th>
                <th>{t("Do 2 min")}</th>
                <th>{t("Otvorené")}</th>
                <th>{t("Navigácia")}</th>
                <th>{t("Túruj+")}</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.month} className="border-b border-[var(--border)]">
                  <td className="py-2">{e.month}</td>
                  <td className="font-semibold">{e.planned}</td>
                  <td>{e.starts}</td>
                  <td>{e.saved}</td>
                  <td className="font-semibold">{e.sent}</td>
                  <td>{e.sentFast}</td>
                  <td>{e.friendOpens}</td>
                  <td>{e.navigations}</td>
                  <td>
                    {e.plusWant} / {e.plusNo}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {events.some((e) => Object.keys(e.heardFrom ?? {}).length > 0) && (
            <>
              <h3 className="font-semibold">{t("Odkiaľ o nás vedia")}</h3>
              <p className="text-sm">{t("Odpovede na „Ako ste sa o nás dozvedeli?“ po prvom uložení výletu.")}</p>
              <ul className="text-sm">
                {events
                  .filter((e) => Object.keys(e.heardFrom ?? {}).length > 0)
                  .map((e) => (
                    <li key={e.month}>
                      <b>{e.month}:</b>{" "}
                      {Object.entries(e.heardFrom)
                        .sort((a, b) => b[1] - a[1])
                        .map(([ch, n]) => `${ch} ${n}`)
                        .join(", ")}
                    </li>
                  ))}
              </ul>
            </>
          )}
        </>
      )}
      {events && events.length > 0 && (
        <>
          <h2>{t("Výlety a hľadanie")}</h2>
          <p className="text-sm">
            {t("Koľkokrát v mesiaci niekto otvoril stránku výletu (počíta sa od konca novembra 2026, obnovenie stránky sa počíta znova), stiahol GPX, začal výlet v Mojich výletoch, koľkokrát vyšiel zoznam výletov prázdny a koľko hľadaní na úvodnej stránke niečo našlo alebo nenašlo.")}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="py-2">{t("Mesiac")}</th>
                  <th>{t("Otvorené výlety")}</th>
                  <th>{t("GPX")}</th>
                  <th>{t("Začaté výlety")}</th>
                  <th>{t("Prázdny zoznam")}</th>
                  <th>{t("Hľadanie: našlo / nenašlo")}</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.month} className="border-b border-[var(--border)]">
                    <td className="py-2">{e.month}</td>
                    <td className="font-semibold">{e.opened ?? 0}</td>
                    <td>{e.gpx}</td>
                    <td>{e.onTrail}</td>
                    <td>{e.listEmpty}</td>
                    <td>
                      {e.searchHit ?? 0} / {e.searchMiss ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3 className="font-semibold">{t("Ako ľudia zadali štart")}</h3>
          <p className="text-sm">{t("Každá návšteva sa počíta raz (do 8. 11. 2026 sa počítalo každé načítanie stránky).")}</p>
          <ul className="text-sm">
            {events.map((e) => (
              <li key={e.month}>
                <b>{e.month}:</b> {split(e.startHow, START_HOW, t) || "0"}
              </li>
            ))}
          </ul>
          {events.some((e) => Object.keys(e.dayPick ?? {}).length > 0) && (
            <>
              <h3 className="font-semibold">{t("Ktorý deň si vybrali")}</h3>
              <ul className="text-sm">
                {events
                  .filter((e) => Object.keys(e.dayPick ?? {}).length > 0)
                  .map((e) => (
                    <li key={e.month}>
                      <b>{e.month}:</b> {split(e.dayPick, DAY_PICK, t)}
                    </li>
                  ))}
              </ul>
            </>
          )}
        </>
      )}
      {days && days.length > 0 && (
        <>
          <h2>{t("Posledných 14 dní")}</h2>
          <p className="text-sm">{t("Počty po dňoch, na porovnanie pred zmenou stránky a po nej. Dni bez jedinej akcie chýbajú.")}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="py-2">{t("Deň")}</th>
                  <th>{t("Štart")}</th>
                  <th>{t("Otvorené výlety")}</th>
                  <th>{t("Naplánované")}</th>
                  <th>{t("Uložené")}</th>
                  <th>{t("Poslané")}</th>
                  <th>{t("GPX")}</th>
                  <th>{t("Hľadanie")}</th>
                </tr>
              </thead>
              <tbody>
                {days.map((d) => (
                  <tr key={d.day} className="border-b border-[var(--border)]">
                    <td className="py-2 whitespace-nowrap">{shortDay(d.day)}</td>
                    <td>{d.counts.start_set ?? 0}</td>
                    <td>{d.counts.trip_open ?? 0}</td>
                    <td className="font-semibold">{d.counts.plan_commit ?? 0}</td>
                    <td>{d.counts.trip_saved ?? 0}</td>
                    <td>{d.counts.share_sent ?? 0}</td>
                    <td>{d.counts.gpx_download ?? 0}</td>
                    <td>{d.counts.trip_search ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {accounts && (
        <>
          <h2>{t("Účty")}</h2>
          <p className="text-sm">
            {t("Spolu")} <b>{accounts.total}</b> {t("účtov. Nové účty v mesiaci a koľkokrát sa ľudia prihlásili cez Google a kódom na email (prvé prihlásenie nového účtu sa počíta tiež).")}
          </p>
          {accounts.months.length > 0 && (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="py-2">{t("Mesiac")}</th>
                  <th>{t("Nové účty")}</th>
                  <th>{t("Prihlásenia Google")}</th>
                  <th>{t("Prihlásenia email")}</th>
                </tr>
              </thead>
              <tbody>
                {accounts.months.map((m) => (
                  <tr key={m.month} className="border-b border-[var(--border)]">
                    <td className="py-2">{m.month}</td>
                    <td className="font-semibold">{m.created}</td>
                    <td>{m.google}</td>
                    <td>{m.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      <p className="text-xs opacity-70">
        {t("Človek, ktorému sa medzi dňami zmení IP adresa (napr. mobil na inej sieti), sa počíta ako dvaja ľudia, takže ľudí môže byť o niečo menej a ľudí s 2+ a 4+ dňami o niečo viac, ako ukazujú čísla.")}
      </p>
    </>
  );
}
