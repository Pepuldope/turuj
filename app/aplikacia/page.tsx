import { InfoPage } from "@/components/InfoPage";
import { AppScreens } from "@/components/AppScreens";
import { InstallGuide } from "@/components/InstallGuide";
import { JsonLd } from "@/components/JsonLd";
import { webApplicationLd } from "@/lib/appScreens";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Získať appku",
  description: "Ako si dať Túruj na plochu iPhonu alebo Androidu: krok za krokom, s obrázkami.",
  path: "/aplikacia",
});

export default function AppPage() {
  return (
    <InfoPage title="Túruj ako appka" intro="Žiadny obchod s aplikáciami: Túruj si pridáte na plochu priamo z prehliadača.">
      <JsonLd data={{ "@context": "https://schema.org", "@graph": [webApplicationLd("sk", "/aplikacia")] }} />
      <AppScreens />
      <InstallGuide />
    </InfoPage>
  );
}
