import { InfoPage } from "@/components/InfoPage";
import { CLOSURES_INDEX_EN } from "@/content/uzavery-index-en";
import { LegalText } from "@/lib/legalText";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Trail closures 2026/2027",
  description: "Seasonal trail closures in the Tatras and Malá Fatra: dates, sections and sources.",
  path: "/uzavery",
  lang: "en",
});

// Official trail and place names stay Slovak; everything around them is English.
export default function Page() {
  return (
    <InfoPage title="Trail closures 2026/2027">
      <LegalText text={CLOSURES_INDEX_EN} />
    </InfoPage>
  );
}
