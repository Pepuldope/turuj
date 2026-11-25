import { getAllTrails } from "@/lib/tripFiles";
import { closedLast } from "@/lib/homeOrder";
import { getKnownTownIds } from "@/lib/townTrips";
import { Here } from "@/components/CameFrom";
import { HomeExplorer } from "@/components/HomeExplorer";
import { JsonLd } from "@/components/JsonLd";
import { webApplicationLd } from "@/lib/appScreens";
import { pageMetadata } from "@/lib/seo";
import { SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/site";

const TITLE = "Where to go hiking today – a day trip planner for Slovakia";
const DESCRIPTION =
  "Day trips to the mountains and nature in Slovakia: how long the drive takes, where to park, the latest time to set off and be back before dark.";

// The English home (app/page.tsx is the Slovak one): the same list and map, built once per deploy.
export const dynamic = "force-static";

export const metadata = pageMetadata({
  title: `${TITLE} | ${SITE_NAME}`,
  description: DESCRIPTION,
  path: "/",
  absoluteTitle: true,
  lang: "en",
});

const HOME_FIRST = 30;

export default async function EnglishHome() {
  // The best known trips are in the page itself; the browser then loads every trip.
  const [all, knownTowns] = await Promise.all([getAllTrails(), getKnownTownIds()]);
  // Trips closed today sink below the open ones (Rysy and Kriváň in winter), as in the browser list.
  const trails = closedLast(all).slice(0, HOME_FIRST);

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebSite",
              "@id": `${SITE_URL}/en#website`,
              url: absoluteUrl("/en"),
              name: SITE_NAME,
              description: DESCRIPTION,
              inLanguage: "en",
              publisher: { "@id": `${SITE_URL}/#organization` },
            },
            {
              "@type": "Organization",
              "@id": `${SITE_URL}/#organization`,
              name: SITE_NAME,
              url: absoluteUrl("/"),
              logo: absoluteUrl("/icons/icon-512.png"),
            },
            webApplicationLd("en", "/"),
          ],
        }}
      />
      <HomeExplorer trails={trails} knownTowns={knownTowns} />
      <Here label="Všetky výlety" translate />
    </>
  );
}
