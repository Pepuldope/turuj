import { CountMeToggle } from "@/components/CountMeToggle";
import { InfoPage } from "@/components/InfoPage";
import { PRIVACY_SK } from "@/content/legal/sukromie";
import { LEGAL_UPDATED } from "@/lib/legal";
import { LegalText } from "@/lib/legalText";
import { formatDateSk } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Súkromie",
  description: "Aké údaje Túruj spracúva, prečo, ako dlho a komu ich posiela, vaše práva a ako vypnúť štatistiky.",
  path: "/sukromie",
});

export default function PrivacyPage() {
  return (
    <InfoPage title="Súkromie" intro={`Aktualizované ${formatDateSk(LEGAL_UPDATED, "sk")}`}>
      <LegalText text={PRIVACY_SK} blocks={{ COUNT_ME: <CountMeToggle /> }} />
    </InfoPage>
  );
}
