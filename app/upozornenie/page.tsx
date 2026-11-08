import { InfoPage } from "@/components/InfoPage";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Upozornenie",
  description: "Túruj pomáha s plánovaním. Časy sú odhady, za bezpečnosť na túre zodpovedá každý sám.",
  path: "/upozornenie",
});

export default function DisclaimerPage() {
  return (
    <InfoPage title="Upozornenie" intro="Túruj vám pomôže výlet naplánovať. Na horách však rozhodujete vy.">
      <h2>Časy sú odhady</h2>
      <p>
        Čas cesty, chôdze aj „vyraziť najneskôr“ sú výpočty z mapových údajov a priemerného tempa. Skutočnosť závisí
        od počasia, terénu, premávky a toho, s kým idete. Nechajte si rezervu, najmä s deťmi a na jeseň, keď sa skôr
        stmieva.
      </p>

      <h2>Pred odchodom si overte</h2>
      <ul>
        <li>
          Počasie a výstrahy, napríklad na <a href="https://www.shmu.sk">SHMÚ</a>.
        </li>
        <li>
          Uzávery chodníkov. Vo Vysokých Tatrách sú vysokohorské chodníky každý rok od 1. 11. do 31. 5. zatvorené (
          <a href="https://www.tanap.sk">TANAP</a>).
        </li>
        <li>
          Lavínovú predpoveď v zime na <a href="https://laviny.sk">laviny.sk</a>.
        </li>
        <li>
          V horských oblastiach sa zapíšte do knihy vychádzok, napríklad v <a href="https://app.hzs.sk">aplikácii HZS</a>.
        </li>
        <li>Parkovanie a spoje. Údaje o parkoviskách pochádzajú z OpenStreetMap a nemusia byť aktuálne.</li>
      </ul>

      <h2>V núdzi</h2>
      <p>
        Horská záchranná služba: <a href="tel:18300">18 300</a>, tiesňová linka <a href="tel:112">112</a>.
      </p>

      <h2>Kto platí záchranu</h2>
      <p>
        Dospelý, ktorému Horská záchranná služba v horských oblastiach pomáha alebo ktorého hľadá, platí náklady
        záchrany (§ 11 ods. 2 písm. e) zákona č. 544/2002 Z. z.). Odporúčame poistenie do hôr, uzavriete ho aj v{" "}
        <a href="https://app.hzs.sk">aplikácii HZS</a>.
      </p>

      <h2>Zodpovednosť</h2>
      <p>
        Údaje poskytujeme v dobrej viere, no bez záruky úplnosti a správnosti. Za rozhodnutie vyraziť a za bezpečnosť
        na túre zodpovedá každý sám. Ak nájdete chybu, dajte nám vedieť, opravíme ju.
      </p>
    </InfoPage>
  );
}
