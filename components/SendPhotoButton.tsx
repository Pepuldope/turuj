"use client";

import { UiIcon } from "@/components/UiIcon";
import { PHOTO_TEXT, TRIP_SLUG, photoMailto } from "@/lib/photoMail";

// "Poslať fotku e-mailom" on /poslat-fotku (C192). Opened from a trip without a photo (?vylet=<slug>), the e-mail
// already names that trip; otherwise the person fills it in. The page stays static: the address is read in the browser when the button is tapped.

export function SendPhotoButton({ lang }: { lang: "sk" | "en" }) {
  return (
    <a
      href={photoMailto(lang, null)}
      // The trip comes from the page's address, read when tapped (the link itself is the same for every visitor).
      onClick={(e) => {
        const slug = new URLSearchParams(window.location.search).get("vylet");
        if (slug && TRIP_SLUG.test(slug)) e.currentTarget.href = photoMailto(lang, slug);
      }}
      data-umami-event="photo_send_open"
      className="inline-flex w-fit items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2.5 font-bold !text-[var(--accent-contrast)] !no-underline hover:opacity-90"
    >
      <UiIcon name="mail" size={16} />
      {PHOTO_TEXT[lang].button}
    </a>
  );
}
