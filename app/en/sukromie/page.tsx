import { CountMeToggle } from "@/components/CountMeToggle";
import { InfoPage } from "@/components/InfoPage";
import { PRIVACY_EN } from "@/content/legal/sukromie.en";
import { LEGAL_UPDATED } from "@/lib/legal";
import { LegalText } from "@/lib/legalText";
import { formatDateSk } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Privacy",
  description: "What data Túruj processes, why, for how long and who receives it, your rights, and how to switch statistics off.",
  path: "/sukromie",
  lang: "en",
});

// The whole Slovak text in English (Peter, 26 Nov 2026: the short summary that stood here "looks different to the
// Slovak version... the whole table is missing"). The Slovak page (app/sukromie) is still the one that counts.
export default function PrivacyPage() {
  return (
    <InfoPage title="Privacy" intro={`Updated ${formatDateSk(LEGAL_UPDATED, "en")}. A translation: the Slovak text is the binding one.`}>
      <LegalText text={PRIVACY_EN} blocks={{ COUNT_ME: <CountMeToggle /> }} />
    </InfoPage>
  );
}
