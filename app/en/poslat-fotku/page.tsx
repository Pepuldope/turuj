import { InfoPage } from "@/components/InfoPage";
import { SendPhotoButton, photoConsent } from "@/components/SendPhotoButton";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Send us a photo from your trip",
  description: "For many trips we don't have a photo yet. If you've been there, send us yours. We'll credit you by name.",
  path: "/poslat-fotku",
  lang: "en",
});

const CONSENT = photoConsent("en");

export default function SendPhotoPage() {
  return (
    <InfoPage
      title="Send us a photo from your trip"
      intro="For many trips we don't have a photo yet. If you've been there and have your own photo, send it to us. We'll credit you by name."
    >
      <h2>What to send</h2>
      <ul>
        <li>The photo itself, ideally landscape, at least 1200 px wide, with no close-up faces and no watermarks.</li>
        <li>Which trip or place it is (a link to the trip on turuj.sk or the name of the place).</li>
        <li>The name to show under the photo (or “anonymous”).</li>
      </ul>

      <h2>Consent</h2>
      <p className="rounded-xl border border-[var(--card-edge)] bg-[var(--card-bg)] p-3">{CONSENT}</p>
      <p>By sending the photo you confirm this consent.</p>

      <SendPhotoButton lang="en" />
      <p className="text-xs text-[var(--muted)]">We review photos by hand; they reach the site within a few days.</p>
    </InfoPage>
  );
}
