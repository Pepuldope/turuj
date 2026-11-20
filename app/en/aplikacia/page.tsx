import { InfoPage } from "@/components/InfoPage";
import { InstallGuide } from "@/components/InstallGuide";
import { JsonLd } from "@/components/JsonLd";
import { webApplicationLd } from "@/lib/appScreens";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Get the app",
  description: "How to put Túruj on your iPhone or Android home screen: step by step, with pictures.",
  path: "/aplikacia",
  lang: "en",
});

export default function AppPage() {
  return (
    <InfoPage title="Túruj ako appka" intro="Žiadny obchod s aplikáciami: Túruj si pridáte na plochu priamo z prehliadača.">
      <JsonLd data={{ "@context": "https://schema.org", "@graph": [webApplicationLd("en", "/aplikacia")] }} />
      <InstallGuide />
    </InfoPage>
  );
}
