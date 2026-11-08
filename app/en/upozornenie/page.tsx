import { InfoPage } from "@/components/InfoPage";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Disclaimer",
  description: "Túruj helps you plan. The times are estimates; everyone is responsible for their own safety on a hike.",
  path: "/upozornenie",
  lang: "en",
});

export default function DisclaimerPage() {
  return (
    <InfoPage title="Disclaimer" intro="Túruj helps you plan a trip. In the mountains, though, you make the decisions.">
      <h2>The times are estimates</h2>
      <p>
        The drive, the walk and the &ldquo;set off by&rdquo; time are calculated from map data and an average pace. What
        really happens depends on the weather, the terrain, the traffic and who you go with. Leave some time to spare,
        especially with children and in autumn, when it gets dark earlier.
      </p>

      <h2>Check before you leave</h2>
      <ul>
        <li>
          The weather and warnings, for example on <a href="https://www.shmu.sk">SHMÚ</a> (the Slovak weather service).
        </li>
        <li>
          Trail closures. In the High Tatras the high mountain trails are closed every year from 1 November to 31 May (
          <a href="https://www.tanap.sk">TANAP</a>).
        </li>
        <li>
          The avalanche forecast in winter on <a href="https://laviny.sk">laviny.sk</a>.
        </li>
        <li>
          In mountain areas, sign in to the trip log, for example in the <a href="https://app.hzs.sk">HZS app</a>.
        </li>
        <li>Parking and public transport. Car park data comes from OpenStreetMap and may be out of date.</li>
      </ul>

      <h2>In an emergency</h2>
      <p>
        Mountain Rescue Service: <a href="tel:18300">18 300</a>, emergency number <a href="tel:112">112</a>.
      </p>

      <h2>Who pays for a rescue</h2>
      <p>
        An adult whom the Mountain Rescue Service helps or searches for in the mountain areas pays the cost of the
        rescue (Section 11(2)(e) of Act No. 544/2002). We recommend mountain insurance, which you can also take out in
        the <a href="https://app.hzs.sk">HZS app</a>.
      </p>

      <h2>Responsibility</h2>
      <p>
        We provide the data in good faith but without any guarantee that it is complete or correct. Everyone is
        responsible for their own decision to set off and for their safety on the hike. If you find a mistake, let us
        know and we will fix it.
      </p>
    </InfoPage>
  );
}
