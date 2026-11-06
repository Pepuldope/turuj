import { CountMeToggle } from "@/components/CountMeToggle";
import { InfoPage } from "@/components/InfoPage";
import { LEGAL_FACTS, LEGAL_UPDATED } from "@/lib/legal";
import { formatDateSk } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Privacy",
  description: "What data Túruj processes, why, for how long and who receives it, your rights, and how to switch statistics off.",
  path: "/sukromie",
  lang: "en",
});

// The Slovak page (app/sukromie) is the one that counts; this is a summary of it.
export default function PrivacyPage() {
  return (
    <InfoPage title="Privacy" intro={`Updated ${formatDateSk(LEGAL_UPDATED, "en")}. A summary: the Slovak text is the binding one.`}>
      <p><strong>In short:</strong> an account only if you want one, a cookie only for signing in, visits counted without cookies or ad tools, and we neither sell data nor use it for ads. Some services we use are in the USA; they are listed below.</p>
      <h2>Who we are</h2>
      <p>{LEGAL_FACTS.OPERATORS_SHORT}, joint controllers under GDPR art. 26. Email <a href="mailto:info@turuj.sk">info@turuj.sk</a> · address {LEGAL_FACTS.ADDRESS}. No data protection officer.</p>
      <h2>What we keep and for how long</h2>
      <ul>
        <li>Account (email, name if given, Google account number with Google sign-in, dates): until you delete it. Passwords only as a salted PBKDF2 hash.</li>
        <li>Sign-in cookie <code>turuj_s</code>: at most 180 days; we store only its hash. Email codes: deleted when used, otherwise within an hour.</li>
        <li>Quick reviews: trip, answers, date and a random number from your browser; no name, email or IP address.</li>
        <li>Messages from “Write to us” / “Report a problem”: deleted automatically 12 months after they arrive. Emails to info@turuj.sk: at most 12 months after the last reply.</li>
        <li>Walk reminders you switch on: push address and keys, deleted once sent or cancelled (about 16 hours at most).</li>
        <li>Returning visitors: a monthly-keyed hash of IP address and browser type, deleted at month end; only totals stay.</li>
        <li>Technical logs: 3 days. Your location or start: rounded (about 100 m or 1 km), never stored in our database.</li>
      </ul>
      <h2>Who receives data</h2>
      <p>Cloudflare (hosting, database, logs, email forwarding, Web Analytics), Umami (statistics), Resend (sign-in emails), Google (Google sign-in, the Gmail inbox behind info@turuj.sk, tester forms), your browser’s push service (encrypted reminders), openrouteservice by HeiGIT in Germany and, as a fallback, the public OSRM demo server (drive times from your rounded start, called by our server), Nominatim by the OpenStreetMap Foundation in the UK (place search, called by your browser), OpenFreeMap and Wikimedia Commons (map tiles and photos). US transfers rely on the EU-US Data Privacy Framework and standard contractual clauses; the UK on the Commission’s adequacy decision.</p>
      <h2>Cookies and browser storage</h2>
      <p>Two strictly necessary cookies: <code>turuj_s</code> (signed in) and <code>turuj_g</code> (Google sign-in protection, 10 minutes). Saved trips, your start and settings stay in your browser’s storage and are never sent to us.</p>
      <h2>Statistics and how to switch them off</h2>
      <p>Umami counts pages and a few steps without cookies (including the skippable “How did you hear about Túruj?” answer after your first saved trip); Cloudflare measures page speed; our own counter keeps only monthly totals. This button stops Umami and our counters in this browser (an ad blocker stops Cloudflare’s speed beacon):</p>
      <CountMeToggle />
      <h2>Your rights</h2>
      <p>Access, correction, erasure, restriction, portability, objection, and withdrawing consent (GDPR arts. 15–21, 7(3)). Write to info@turuj.sk, from the account’s address for account data; we answer within a month, free of charge. You can complain to the Slovak Office for Personal Data Protection, Galvaniho 7/B, 821 04 Bratislava, dataprotection.gov.sk.</p>
      <h2>Children and security</h2>
      <p>Accounts from age 16; younger people can use everything else without one. Only Peter can reach the database and the code, and his accounts use two-factor authentication (2FA). If a breach puts you at risk we tell the authority within 72 hours and you too when the risk is high.</p>
    </InfoPage>
  );
}
