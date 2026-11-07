import { InfoPage } from "@/components/InfoPage";
import { LangLink } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Accessibility statement",
  description: "How accessible Túruj is: what works, what does not yet, and how to report a problem.",
  path: "/pristupnost",
  lang: "en",
});

export default function AccessibilityPage() {
  return (
    <InfoPage title="Accessibility statement" intro="Last updated: 7 November 2026">
      <p>
        Túruj voluntarily aims to meet WCAG 2.2 level AA. We are a microenterprise, so the Slovak act no. 351/2022 on the
        accessibility of websites and mobile apps does not apply to us. We still want everyone to be able to plan a hike.
      </p>
      <h2>What works</h2>
      <ul>
        <li>Most pages can be used with a keyboard.</li>
        <li>Every fact on the map is also text in the trip list and on the trip page.</li>
        <li>Dark mode follows your device setting.</li>
        <li>Pages zoom to 200 % without losing content.</li>
      </ul>
      <h2>What does not work yet</h2>
      <ul>
        <li>Keyboard focus in the start picker and on the full-screen map.</li>
        <li>The search on the home page with a screen reader.</li>
      </ul>
      <p>We are working on both.</p>
      <h2>Reporting a problem</h2>
      <p>
        If something cannot be read or used, <LangLink href="/nahlasit-chybu">report it to us</LangLink> or write to{" "}
        <a href="mailto:info@turuj.sk">info@turuj.sk</a>. We read every message and reply.
      </p>
    </InfoPage>
  );
}
