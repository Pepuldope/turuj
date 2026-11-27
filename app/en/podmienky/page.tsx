import { InfoPage } from "@/components/InfoPage";
import { TERMS_EN } from "@/content/legal/podmienky.en";
import { LEGAL_UPDATED } from "@/lib/legal";
import { LegalText } from "@/lib/legalText";
import { formatDateSk } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Terms of use",
  description: "Túruj's terms of use: who runs it, what holds for accounts and reviews, what we are responsible for and how to report content.",
  path: "/podmienky",
  lang: "en",
});

// The whole Slovak text in English (Peter, 27 Nov 2026, after the privacy page got the same the day before; a short
// summary stood here since 25 Oct). The Slovak page (app/podmienky) is still the one that counts.
export default function TermsPage() {
  return (
    <InfoPage title="Terms of use" intro={`Version 1.0 · in force from ${formatDateSk(LEGAL_UPDATED, "en")}. A translation: the Slovak text is the binding one.`}>
      <LegalText text={TERMS_EN} />
    </InfoPage>
  );
}
