"use client";

import { UiIcon } from "@/components/UiIcon";
import { CONTACT_EMAIL, absoluteUrl } from "@/lib/site";

// "Poslať fotku e-mailom" on /poslat-fotku (C192). Opened from a trip without a photo (?vylet=<slug>), the e-mail
// already names that trip; otherwise the person fills it in. The page stays static: the address is read in the browser when the button is tapped.

const TEXT = {
  sk: {
    consent:
      "Fotku som odfotil(a) ja. Súhlasím, aby ju Túruj bezplatne používal na turuj.sk a na svojich sociálnych sieťach s mojím menom pri fotke. Súhlas môžem kedykoľvek zrušiť e-mailom a fotku odstránime.",
    place: "Výlet / miesto",
    name: "Meno pri fotke (alebo anonymne)",
    attach: "(Fotku priložte k tomuto e-mailu.)",
    subject: "Fotka z výletu",
    button: "Poslať fotku e-mailom",
  },
  en: {
    consent:
      "I took this photo myself. I agree that Túruj may use it free of charge on turuj.sk and on its social media, with my name credited next to it. I can withdraw this consent at any time by e-mail and the photo will be removed.",
    place: "Trip / place",
    name: "Name to show with the photo (or anonymous)",
    attach: "(Please attach the photo to this e-mail.)",
    subject: "Trip photo",
    button: "Send the photo by e-mail",
  },
} as const;

export const photoConsent = (lang: "sk" | "en") => TEXT[lang].consent;

/** The mailto link, with the trip's address when a valid trip slug is given. */
export function photoMailto(lang: "sk" | "en", slug: string | null): string {
  const t = TEXT[lang];
  const trip = slug ? absoluteUrl(`${lang === "en" ? "/en" : ""}/trasa/${slug}`) : "";
  const body = `${t.place}: ${trip}\n\n${t.name}: \n\n${t.consent}\n\n${t.attach}`;
  const subject = slug ? `${t.subject}: ${slug}` : t.subject;
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

const SLUG = /^[a-z0-9-]{1,120}$/;

export function SendPhotoButton({ lang }: { lang: "sk" | "en" }) {
  return (
    <a
      href={photoMailto(lang, null)}
      // The trip comes from the page's address, read when tapped (the link itself is the same for every visitor).
      onClick={(e) => {
        const slug = new URLSearchParams(window.location.search).get("vylet");
        if (slug && SLUG.test(slug)) e.currentTarget.href = photoMailto(lang, slug);
      }}
      data-umami-event="photo_send_open"
      className="inline-flex w-fit items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2.5 font-bold !text-[var(--accent-contrast)] !no-underline hover:opacity-90"
    >
      <UiIcon name="mail" size={16} />
      {TEXT[lang].button}
    </a>
  );
}
