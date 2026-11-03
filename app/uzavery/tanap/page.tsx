import { InfoPage } from "@/components/InfoPage";
import { TANAP_CLOSURE_SK } from "@/content/uzavery-tanap";
import { LegalText } from "@/lib/legalText";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Sezónna uzávera TANAP 2026/2027: čo je zatvorené",
  description: "Od 1. novembra 2026 do 31. mája 2027 sú v Tatrách zatvorené chodníky na štíty a do sediel. Zoznam úsekov, výnimky a kam sa dá ísť aj v zime.",
  path: "/uzavery/tanap",
});

export default function TanapClosurePage() {
  return (
    <InfoPage title="Sezónna uzávera v TANAP-e 2026/2027" intro="1. novembra 2026 – 31. mája 2027 · overené 31. októbra 2026">
      <LegalText text={TANAP_CLOSURE_SK} />
    </InfoPage>
  );
}
