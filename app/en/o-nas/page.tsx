import { InfoPage } from "@/components/InfoPage";
import { LangLink } from "@/lib/i18n";
import { CONTACT_EMAIL } from "@/lib/site";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "About us",
  description: "Who makes Túruj, why, and how we work out walking times, the drive and getting back before dark.",
  path: "/o-nas",
  lang: "en",
});

export default function AboutPage() {
  return (
    <InfoPage title="About us" intro="Túruj tells you where to go today so you can fit in the drive, the hike and the way back before dark.">
      <p>
        It is made by Peter Nemčok (routes, calculations, website) and Radoslav Nemec (testing, promotion). We started
        it as a school-leaving project in 2026 and want it to last. Túruj is free, and nobody can buy a better place in
        the list of trips.
      </p>

      <h2>How we work out the times</h2>
      <ul>
        <li>
          Walking follows the DIN 33466 standard, which the trail signposts are based on too: 4 km/h on the flat, 300 m
          an hour uphill, 500 m an hour downhill, rounded up to 15 minutes. With children we allow 1.3 times longer.
        </li>
        <li>The drive uses roads from OpenStreetMap, without traffic jams, right to the car park at the start.</li>
        <li>From the time of sunset on the day of the trip we take away the hike and the way back, and tell you the latest time to set off.</li>
        <li>Trail closures in the Tatra National Park (TANAP) follow the park authority&apos;s official list.</li>
      </ul>
      <p>
        The times are an estimate for an average hiker. Always check the weather and the state of the trail. Where our
        data comes from is on the <LangLink href="/zdroje">Sources</LangLink> page.
      </p>

      <h2>Contact</h2>
      <p>
        Write to us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
      <p>
        Found a mistake in a route or a car park? <LangLink href="/nahlasit-chybu">Report a problem</LangLink>. Send
        ideas or praise through <LangLink href="/napiste-nam">Write to us</LangLink>.
      </p>
    </InfoPage>
  );
}
