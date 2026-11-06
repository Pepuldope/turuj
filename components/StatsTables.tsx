"use client";

import { useEffect, useState } from "react";
import type { AccountMonth } from "@/lib/auth";
import type { MonthEvents } from "@/lib/eventCounts";
import type { MonthStats } from "@/lib/visitStore";

interface Stats {
  months: MonthStats[] | null;
  events: MonthEvents[] | null;
  accounts?: { total: number; months: AccountMonth[] } | null;
}

/** The tables on /statistiky, read from /api/statistiky when the page opens. */
export function StatsTables() {
  const [data, setData] = useState<Stats | "loading" | "error">("loading");
  useEffect(() => {
    fetch("/api/statistiky", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: Stats) => setData(d))
      .catch(() => setData("error"));
  }, []);

  if (data === "loading") return <p>Načítavame…</p>;
  if (data === "error") return <p>Čísla sa nepodarilo načítať. Skúste stránku obnoviť.</p>;
  const { months: rows, events, accounts } = data;

  return (
    <>
      {rows === null ? (
        <p>Počítadlo beží len na zverejnenej stránke (Cloudflare).</p>
      ) : rows.length === 0 ? (
        <p>Zatiaľ žiadne návštevy.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="py-2">Mesiac</th>
              <th>Ľudia</th>
              <th>2+ dni</th>
              <th>4+ dni</th>
              <th>Priemer dní</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.month} className="border-b border-[var(--border)]">
                <td className="py-2">{r.month}</td>
                <td>{r.visitors}</td>
                <td>{r.visitors_2plus_days}</td>
                <td className="font-semibold">{r.visitors_4plus_days}</td>
                <td>{r.avg_days}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {events && events.length > 0 && (
        <>
          <h2>Plány</h2>
          <p className="text-sm">
            <b>Naplánované</b> (hlavné číslo): výlety, ktoré niekto uložil, poslal, spustil k nim navigáciu alebo stiahol
            GPX, každý výlet raz za otvorenie stránky (zbiera sa od novembra 2026). Ďalej koľkokrát v mesiaci bol zadaný štart, výlet uložený, plán poslaný (z toho do 2 minút od príchodu), plán
            otvorený kamarátom a spustená navigácia. Túruj+: kliknutia „Chcel by som to“ / „Za túto cenu nie“ na
            stránke /plus.
          </p>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="py-2">Mesiac</th>
                <th>Naplánované</th>
                <th>Štart</th>
                <th>Uložené</th>
                <th>Poslané</th>
                <th>Do 2 min</th>
                <th>Otvorené</th>
                <th>Navigácia</th>
                <th>Túruj+</th>
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
              <h3 className="font-semibold">Odkiaľ o nás vedia</h3>
              <p className="text-sm">Odpovede na „Ako ste sa o nás dozvedeli?“ po prvom uložení výletu.</p>
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
      {accounts && (
        <>
          <h2>Účty</h2>
          <p className="text-sm">
            Spolu <b>{accounts.total}</b> účtov. Nové účty v mesiaci a koľkokrát sa ľudia prihlásili cez Google a
            kódom na email (prvé prihlásenie nového účtu sa počíta tiež).
          </p>
          {accounts.months.length > 0 && (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="py-2">Mesiac</th>
                  <th>Nové účty</th>
                  <th>Prihlásenia Google</th>
                  <th>Prihlásenia email</th>
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
        Človek, ktorému sa medzi dňami zmení IP adresa (napr. mobil na inej sieti), sa počíta ako dvaja ľudia, takže
        ľudí môže byť o niečo menej a ľudí s 2+ a 4+ dňami o niečo viac, ako ukazujú čísla.
      </p>
    </>
  );
}
