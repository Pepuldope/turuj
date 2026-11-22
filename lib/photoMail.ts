import { CONTACT_EMAIL, absoluteUrl } from "@/lib/site";

// Texts of the "send us a photo" e-mail (C192), shared by the /poslat-fotku pages (server) and their button (browser).

export const PHOTO_TEXT = {
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

export const photoConsent = (lang: "sk" | "en") => PHOTO_TEXT[lang].consent;

/** The mailto link, with the trip's address when a valid trip slug is given. */
export function photoMailto(lang: "sk" | "en", slug: string | null): string {
  const t = PHOTO_TEXT[lang];
  const trip = slug ? absoluteUrl(`${lang === "en" ? "/en" : ""}/trasa/${slug}`) : "";
  const body = `${t.place}: ${trip}\n\n${t.name}: \n\n${t.consent}\n\n${t.attach}`;
  const subject = slug ? `${t.subject}: ${slug}` : t.subject;
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export const TRIP_SLUG = /^[a-z0-9-]{1,120}$/;
