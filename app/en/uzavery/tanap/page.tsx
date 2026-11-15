import { InfoPage } from "@/components/InfoPage";
import { TANAP_CLOSURE_EN } from "@/content/uzavery-tanap-en";
import { LegalText } from "@/lib/legalText";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "TANAP seasonal closure 2026/2027",
  description: "From 1 November 2026 to 31 May 2027 trails to peaks and saddles in the Tatras are closed. Sections, exceptions and where you can still go.",
  path: "/uzavery/tanap",
  lang: "en",
});

// Official trail and place names stay Slovak; everything around them is English.
export default function Page() {
  return (
    <InfoPage title="TANAP seasonal closure 2026/2027" intro="1 November 2026 – 31 May 2027 · verified 31 October 2026">
      <LegalText text={TANAP_CLOSURE_EN} />
    </InfoPage>
  );
}
