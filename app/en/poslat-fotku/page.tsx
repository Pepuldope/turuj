import { InfoPage } from "@/components/InfoPage";
import { UiIcon } from "@/components/UiIcon";
import { pageMetadata } from "@/lib/seo";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata = pageMetadata({
  title: "Send us a photo from your trip",
  description: "For many trips we don't have a photo yet. If you've been there, send us yours. We'll credit you by name.",
  path: "/poslat-fotku",
  lang: "en",
});

const CONSENT =
  "I took this photo myself. I agree that Túruj may use it free of charge on turuj.sk and on its social media, with my name credited next to it. I can withdraw this consent at any time by e-mail and the photo will be removed.";
const BODY = `Trip / place: \n\nName to show with the photo (or anonymous): \n\n${CONSENT}\n\n(Please attach the photo to this e-mail.)`;
const MAILTO = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Trip photo")}&body=${encodeURIComponent(BODY)}`;

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

      <a
        href={MAILTO}
        data-umami-event="photo_send_open"
        className="inline-flex w-fit items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2.5 font-bold !text-[var(--accent-contrast)] !no-underline hover:opacity-90"
      >
        <UiIcon name="mail" size={16} />
        Send the photo by e-mail
      </a>
      <p className="text-xs text-[var(--muted)]">We review photos by hand; they reach the site within a few days.</p>
    </InfoPage>
  );
}
