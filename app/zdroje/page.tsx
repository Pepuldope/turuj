import { InfoPage } from "@/components/InfoPage";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Zdroje a mapy",
  description: "Odkiaľ Túruj berie mapy a údaje: OpenStreetMap, OpenFreeMap, openrouteservice, cestovný poriadok ŽSR.",
  path: "/zdroje",
});

export default function SourcesPage() {
  return (
    <InfoPage title="Zdroje a mapy" intro="Túruj stojí na otvorených údajoch. Ďakujeme všetkým, ktorí ich tvoria.">
      <h2>OpenStreetMap</h2>
      <p>
        Trasy, parkoviská, zastávky a ďalšie miesta pochádzajú z{" "}
        <a href="https://www.openstreetmap.org/copyright">© prispievateľov OpenStreetMap</a>, dostupné pod licenciou{" "}
        <a href="https://opendatacommons.org/licenses/odbl/">Open Database License (ODbL)</a>. Chybu v mape môžete
        opraviť priamo na <a href="https://www.openstreetmap.org">openstreetmap.org</a>.
      </p>

      <h2>Mapa</h2>
      <ul>
        <li>
          Podkladová mapa: <a href="https://openfreemap.org">OpenFreeMap</a>, údaje © OpenStreetMap, zobrazené cez{" "}
          <a href="https://maplibre.org">MapLibre</a>.
        </li>
        <li>Farby turistických značiek kreslíme sami z údajov OpenStreetMap.</li>
      </ul>

      <h2>Výpočty</h2>
      <ul>
        <li>
          Čas cesty autom: <a href="https://openrouteservice.org">openrouteservice</a> (© HeiGIT), údaje ©
          OpenStreetMap.
        </li>
        <li>
          Vyhľadanie miesta štartu: <a href="https://nominatim.org">Nominatim</a>, údaje © OpenStreetMap.
        </li>
        <li>Východ a západ slnka počítame priamo v aplikácii.</li>
        <li>
          Výšky a prevýšenia: <a href="https://spacedata.copernicus.eu/collections/copernicus-digital-elevation-model">Copernicus DEM GLO-30</a>,
          © DLR e.V. 2010-2014 a © Airbus Defence and Space GmbH 2014-2018, poskytnuté v rámci programu COPERNICUS
          Európskou úniou a ESA. Organizácie zodpovedné za program Copernicus nezodpovedajú za žiadne použitie týchto
          údajov.
        </li>
        <li>
          Predpoveď počasia: <a href="https://api.met.no">MET Norway</a> (Norwegian Meteorological Institute), licencia{" "}
          <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>.
        </li>
        <li>
          Vlaky: cestovný poriadok <a href="https://www.zsr.sk">ŽSR</a> vo formáte GTFS z{" "}
          <a href="https://data.slovensko.sk">data.slovensko.sk</a>, licencia{" "}
          <a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0</a>. Linky autobusov na zastávkach: údaje © OpenStreetMap.
        </li>
        <li>
          Fotky miest: <a href="https://commons.wikimedia.org">Wikimedia Commons</a> cez{" "}
          <a href="https://www.wikidata.org">Wikidata</a>, len voľné licencie (CC0, CC BY, CC BY-SA, voľné dielo). Autor a licencia
          každej fotky sú pod zoznamom na stránke mesta. Kde fotka z Commons chýba, fotka z ulice z{" "}
          <a href="https://www.mapillary.com">Mapillary</a> (CC BY-SA 4.0, autor pri fotke).
        </li>
        <li>
          Presné spoje autobusov a vlakov: odkaz na <a href="https://cp.sk">cp.sk</a>, Google Mapy a Apple Mapy.
        </li>
      </ul>
    </InfoPage>
  );
}
