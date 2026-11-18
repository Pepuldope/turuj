import { InfoPage } from "@/components/InfoPage";
import { UiIcon } from "@/components/UiIcon";
import { pageMetadata } from "@/lib/seo";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata = pageMetadata({
  title: "Pošlite nám fotku z výletu",
  description: "Pri mnohých výletoch zatiaľ nemáme fotku. Ak ste tam boli, pošlite nám svoju. Pri fotke uvedieme vaše meno.",
  path: "/poslat-fotku",
});

const CONSENT =
  "Fotku som odfotil(a) ja. Súhlasím, aby ju Túruj bezplatne používal na turuj.sk a na svojich sociálnych sieťach s mojím menom pri fotke. Súhlas môžem kedykoľvek zrušiť e-mailom a fotku odstránime.";
const BODY = `Výlet / miesto: \n\nMeno pri fotke (alebo anonymne): \n\n${CONSENT}\n\n(Fotku priložte k tomuto e-mailu.)`;
const MAILTO = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Fotka z výletu")}&body=${encodeURIComponent(BODY)}`;

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

      <a
        href={MAILTO}
        data-umami-event="photo_send_open"
        className="inline-flex w-fit items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2.5 font-bold !text-[var(--accent-contrast)] !no-underline hover:opacity-90"
      >
        <UiIcon name="mail" size={16} />
        Poslať fotku e-mailom
      </a>
      <p className="text-xs text-[var(--muted)]">Fotky prezeráme ručne, na stránku sa dostanú do pár dní.</p>
    </InfoPage>
  );
}
