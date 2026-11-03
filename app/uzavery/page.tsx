import { InfoPage } from "@/components/InfoPage";
import { CLOSURES_INDEX_SK } from "@/content/uzavery-index";
import { LegalText } from "@/lib/legalText";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Uzávery turistických chodníkov 2026/2027",
  description: "Sezónne uzávery chodníkov v Tatrách a v Malej Fatre: od kedy do kedy, ktoré úseky a odkiaľ to vieme. S dátumom poslednej kontroly.",
  path: "/uzavery",
});

export default function ClosuresPage() {
  return (
    <InfoPage title="Uzávery turistických chodníkov">
      <LegalText text={CLOSURES_INDEX_SK} />
    </InfoPage>
  );
}
