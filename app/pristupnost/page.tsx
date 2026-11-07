import { InfoPage } from "@/components/InfoPage";
import { LangLink } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Vyhlásenie o prístupnosti",
  description: "Ako je Túruj prístupný: čo funguje, čo ešte nie a ako nám nahlásiť problém.",
  path: "/pristupnost",
});

export default function AccessibilityPage() {
  return (
    <InfoPage title="Vyhlásenie o prístupnosti" intro="Posledná aktualizácia: 7. 11. 2026">
      <p>
        Túruj sa dobrovoľne snaží spĺňať štandard WCAG 2.2 na úrovni AA. Sme mikropodnik, preto sa na nás zákon č. 351/2022
        o prístupnosti webových sídel a mobilných aplikácií nevzťahuje. Chceme, aby sa výlety dali plánovať každému.
      </p>
      <h2>Čo funguje</h2>
      <ul>
        <li>Väčšinu stránok ovládate klávesnicou.</li>
        <li>Každá informácia z mapy je aj ako text v zozname výletov a na stránke výletu.</li>
        <li>Tmavý režim sa riadi nastavením zariadenia.</li>
        <li>Stránky sa dajú priblížiť na 200 % bez straty obsahu.</li>
      </ul>
      <h2>Čo ešte nefunguje</h2>
      <ul>
        <li>Pohyb klávesnice (fokus) v okne s výberom štartu a na mape na celú obrazovku.</li>
        <li>Vyhľadávanie na úvodnej stránke so čítačkou obrazovky.</li>
      </ul>
      <p>Na oboch pracujeme.</p>
      <h2>Nahlásenie problému</h2>
      <p>
        Ak sa vám niečo nedá prečítať alebo ovládať, <LangLink href="/nahlasit-chybu">nahláste nám to</LangLink> alebo napíšte
        na <a href="mailto:info@turuj.sk">info@turuj.sk</a>. Prečítame si to a odpovieme.
      </p>
    </InfoPage>
  );
}
