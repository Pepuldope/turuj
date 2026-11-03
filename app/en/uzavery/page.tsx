import { InfoPage } from "@/components/InfoPage";
import { CLOSURES_INDEX_SK } from "@/content/uzavery-index";
import { LegalText } from "@/lib/legalText";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Trail closures 2026/2027",
  description: "Seasonal trail closures in the Tatras and Malá Fatra: dates, sections and sources.",
  path: "/uzavery",
  lang: "en",
});

// Place and trail names matter more than the language here: the Slovak text, with an English note.
export default function Page() {
  return (
    <InfoPage title="Trail closures 2026/2027" intro="This page is in Slovak: the closure list uses the official Slovak trail and place names.">
      <LegalText text={CLOSURES_INDEX_SK} />
    </InfoPage>
  );
}
