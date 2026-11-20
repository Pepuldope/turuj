import { AppScreens } from "@/components/AppScreens";
import { InfoPage } from "@/components/InfoPage";
import { LangLink } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "How Túruj works",
  description:
    "How to plan a day trip into the Slovak mountains in 5 minutes with Túruj: picking a hike, parking, bus or train, walking time and the latest time to set off.",
  path: "/ako-to-funguje",
  lang: "en",
});

export default function HowItWorksPage() {
  return (
    <InfoPage
      title="How Túruj works"
      intro="Túruj plans day trips into the mountains and nature of Slovakia. In five minutes you know where to go, how to get there and the latest time to set off."
    >
      <AppScreens />

      <h2>1. Say where you start and when</h2>
      <p>
        On the home page, enter the town or place you leave from and pick a day: today, tomorrow or another. Túruj sorts
        thousands of trips by how far they are and how long they take. Trips you could not finish in daylight that day
        stay in the list, in grey.
      </p>

      <h2>2. Find a trip that suits you</h2>
      <p>
        Search by goal: a peak, castle, waterfall, mountain lake, cave, gorge, viewpoint or mountain hut. Turn on “With
        children?” for easier routes and longer walking times. The map shows every trip at once. Larger towns also have
        a page of <LangLink href="/vylety-z">trips around the town</LangLink>.
      </p>

      <h2>3. Everything about the hike in one place</h2>
      <ul>
        <li>length, climb and walking time there and back, also at a slower pace with children,</li>
        <li>where to park, whether the car park is paid and how far it is to the start,</li>
        <li>the nearest bus stop or railway station and the walk from it,</li>
        <li>the drive from your town and the latest time to set off to be back before dark,</li>
        <li>the weather for the day, seasonal trail closures in the Tatras and entry fees where we know them,</li>
        <li>huts, springs and viewpoints on the way, and other routes to the same place.</li>
      </ul>

      <h2>4. Save the plan and go</h2>
      <p>
        “Save trip” keeps the plan and its map on your phone, so it opens without signal in the mountains. Send the plan
        to your group with one link, open navigation to the car park in Google Maps or Mapy.com, or download the
        route as a GPX file.
      </p>

      <h2>What it costs</h2>
      <p>
        Nothing. Túruj is free, with no sign-up and no ads, and nobody can buy a better place in the list. Times are an
        estimate for an average walker: always check the weather and the trail before you leave. Data sources are on the{" "}
        <LangLink href="/zdroje">Sources</LangLink> page.
      </p>
    </InfoPage>
  );
}
