import { InfoPage } from "@/components/InfoPage";
import { LangLink } from "@/lib/i18n";
import { LEGAL_FACTS, LEGAL_UPDATED } from "@/lib/legal";
import { formatDateSk } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Terms of use",
  description: "Túruj's terms of use in short: who runs it, accounts, quick reviews, liability and how to report content.",
  path: "/podmienky",
  lang: "en",
});

// The Slovak page (app/podmienky) is the one that counts; this is a short summary of it.
export default function TermsPage() {
  return (
    <InfoPage title="Terms of use" intro={`Version 1.0 · in force from ${formatDateSk(LEGAL_UPDATED, "en")}. A summary: the Slovak text is the binding one.`}>
      <h2>Who runs Túruj</h2>
      <p>{LEGAL_FACTS.OPERATORS_SHORT}, as private persons (no company yet). Contact: <a href="mailto:info@turuj.sk">info@turuj.sk</a>, also for authorities under the EU Digital Services Act. Address: {LEGAL_FACTS.ADDRESS}.</p>
      <h2>What Túruj is</h2>
      <p>A free planner for one-day trips in Slovakia. Nothing is sold; /plus is only a survey.</p>
      <h2>In the mountains, you decide</h2>
      <p>Túruj is not a navigation app or a guide. Walking times, closures, weather and connections are estimates from public sources and may be incomplete or out of date. Check the weather (SHMÚ), avalanche forecast (HZS), park closures and transport before you go; signs and the Mountain Rescue Service (HZS) on the spot always win. Turn back when the weather turns or you are running late. In an emergency call 18 300 or 112. Adults pay for their own mountain rescue in Slovakia, so insurance is recommended.</p>
      <h2>Accounts</h2>
      <p>Optional, from age 16. One person, one account, your real email. You can delete it at once with “Delete account” in the account menu. We may block an account that breaks these rules or endangers others, and tell you why.</p>
      <h2>Do not</h2>
      <p>Break the law or others’ rights, scrape or overload the site, or try to get into accounts or our systems. Code, texts and design are all rights reserved; map data has its own licences.</p>
      <h2 id="b6">Quick reviews</h2>
      <p>Only for trips you really did; no paid, fake or bulk reviews, and none for places you are personally tied to. Reviews are not verified; we limit them per address, remove obvious spam and never edit them. Totals show from three reviews. Report illegal content to info@turuj.sk or through “Report a problem”; a person on the team decides, and you can ask the other team member to review that decision within 6 months.</p>
      <h2>Data and liability</h2>
      <p>Map data © OpenStreetMap contributors (ODbL); other sources are on <LangLink href="/zdroje">Sources</LangLink>. We give data in good faith and fix errors we learn about. We are not liable for decisions you make on the trail or for changes on the ground after our data date; nothing here limits liability the law does not allow us to limit, such as for harm to life or health caused by our fault.</p>
      <h2>Changes</h2>
      <p>The service runs on free plans and may be slow or partly unavailable. We announce major changes to these terms to account holders by email at least 14 days ahead. Slovak law applies; as a consumer you keep the protection of the country where you live.</p>
    </InfoPage>
  );
}
