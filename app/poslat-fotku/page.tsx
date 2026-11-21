import { InfoPage } from "@/components/InfoPage";
import { SendPhotoButton, photoConsent } from "@/components/SendPhotoButton";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Pošlite nám fotku z výletu",
  description: "Pri mnohých výletoch zatiaľ nemáme fotku. Ak ste tam boli, pošlite nám svoju. Pri fotke uvedieme vaše meno.",
  path: "/poslat-fotku",
});

const CONSENT = photoConsent("sk");

export default function SendPhotoPage() {
  return (
    <InfoPage
      title="Pošlite nám fotku z výletu"
      intro="Pri mnohých výletoch zatiaľ nemáme fotku. Ak ste tam boli a máte vlastnú fotku, pošlite nám ju. Pri fotke uvedieme vaše meno."
    >
      <h2>Čo poslať</h2>
      <ul>
        <li>Samotnú fotku, ideálne na šírku, aspoň 1200 px široká, bez ľudí zblízka na tvári a bez vodoznaku.</li>
        <li>Ktorý výlet alebo miesto to je (odkaz na výlet na turuj.sk alebo názov miesta).</li>
        <li>Meno, ktoré sa má zobraziť pod fotkou (alebo „anonymne“).</li>
      </ul>

      <h2>Súhlas</h2>
      <p className="rounded-xl border border-[var(--card-edge)] bg-[var(--card-bg)] p-3">{CONSENT}</p>
      <p>Odoslaním fotky tento súhlas potvrdzujete.</p>

      <SendPhotoButton lang="sk" />
      <p className="text-xs text-[var(--muted)]">Fotky prezeráme ručne, na stránku sa dostanú do pár dní.</p>
    </InfoPage>
  );
}
