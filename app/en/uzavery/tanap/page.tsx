import { InfoPage } from "@/components/InfoPage";
import { TANAP_CLOSURE_SK } from "@/content/uzavery-tanap";
import { LegalText } from "@/lib/legalText";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "TANAP seasonal closure 2026/2027",
  description: "From 1 November 2026 to 31 May 2027 trails to peaks and saddles in the Tatras are closed. Sections, exceptions and where you can still go.",
  path: "/uzavery/tanap",
  lang: "en",
});

// Place and trail names matter more than the language here: the Slovak text, with an English note.
export default function Page() {
  return (
    <InfoPage title="TANAP seasonal closure 2026/2027" intro="This page is in Slovak: the closure list uses the official Slovak trail and place names.">
      <LegalText text={TANAP_CLOSURE_SK} />
    </InfoPage>
  );
}
