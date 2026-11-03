import { InfoPage } from "@/components/InfoPage";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Sources and maps",
  description: "Where Túruj gets its maps and data: OpenStreetMap, OpenFreeMap, openrouteservice, the ŽSR train timetable.",
  path: "/zdroje",
  lang: "en",
});

export default function SourcesPage() {
  return (
    <InfoPage title="Sources and maps" intro="Túruj is built on open data. Thank you to everyone who creates it.">
      <h2>OpenStreetMap</h2>
      <p>
        Routes, car parks, stops and other places come from{" "}
        <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>, available under the{" "}
        <a href="https://opendatacommons.org/licenses/odbl/">Open Database License (ODbL)</a>. You can fix a mistake in
        the map directly on <a href="https://www.openstreetmap.org">openstreetmap.org</a>.
      </p>

      <h2>Map</h2>
      <ul>
        <li>
          Base map: <a href="https://openfreemap.org">OpenFreeMap</a>, data © OpenStreetMap, shown with{" "}
          <a href="https://maplibre.org">MapLibre</a>.
        </li>
        <li>We draw the colours of the trail markings ourselves from OpenStreetMap data.</li>
      </ul>

      <h2>Calculations</h2>
      <ul>
        <li>
          Driving time: <a href="https://openrouteservice.org">openrouteservice</a> (© HeiGIT), data © OpenStreetMap.
        </li>
        <li>
          Finding your starting place: <a href="https://nominatim.org">Nominatim</a>, data © OpenStreetMap.
        </li>
        <li>We calculate sunrise and sunset right in the app.</li>
        <li>
          Elevation and climb: <a href="https://spacedata.copernicus.eu/collections/copernicus-digital-elevation-model">Copernicus DEM GLO-30</a>,
          © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European
          Union and ESA. The organisations in charge of the Copernicus programme are not liable for any use of these data.
        </li>
        <li>
          Weather forecast: <a href="https://api.met.no">MET Norway</a> (Norwegian Meteorological Institute), licence{" "}
          <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>.
        </li>
        <li>
          Trains: the <a href="https://www.zsr.sk">ŽSR</a> (Slovak railways) timetable in GTFS format from{" "}
          <a href="https://data.slovensko.sk">data.slovensko.sk</a>, licence{" "}
          <a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0</a>. Bus lines at stops: data © OpenStreetMap.
        </li>
        <li>
          Photos of places: <a href="https://commons.wikimedia.org">Wikimedia Commons</a> via{" "}
          <a href="https://www.wikidata.org">Wikidata</a>, free licences only (CC0, CC BY, CC BY-SA, public domain). The
          author and licence of each photo are below the list on the town&apos;s page.
        </li>
        <li>
          Exact bus and train connections: a link to <a href="https://cp.sk">cp.sk</a>, Google Maps and Apple Maps.
        </li>
      </ul>
    </InfoPage>
  );
}
