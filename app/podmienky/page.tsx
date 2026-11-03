import { InfoPage } from "@/components/InfoPage";
import { TERMS_SK } from "@/content/legal/podmienky";
import { LEGAL_UPDATED } from "@/lib/legal";
import { LegalText } from "@/lib/legalText";
import { formatDateSk } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Podmienky používania",
  description: "Podmienky používania Túruja: kto ho prevádzkuje, čo platí pre účty a hodnotenia, za čo zodpovedáme a ako nahlásiť obsah.",
  path: "/podmienky",
});

export default function TermsPage() {
  return (
    <InfoPage title="Podmienky používania" intro={`Verzia 1.0 · platné od ${formatDateSk(LEGAL_UPDATED, "sk")}`}>
      <LegalText text={TERMS_SK} />
    </InfoPage>
  );
}
