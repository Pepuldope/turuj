import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Bricolage_Grotesque, Figtree } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { StaleCodeReload } from "@/components/StaleCodeReload";
import { UserLocationProvider } from "@/lib/userLocation";
import { TripSettingsProvider } from "@/lib/tripSettings";
import { Analytics } from "@/components/Analytics";
import { VisitBeacon } from "@/components/VisitBeacon";
import { TopBar } from "@/components/TopBar";
import { LangProvider } from "@/lib/i18n";
import { OG_IMAGE, SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from "@/lib/site";

// Brand fonts (strategy/06-identity): latin-ext covers every Slovak letter.
const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin", "latin-ext"],
});

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin", "latin-ext"],
  weight: ["700", "800"],
});

const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin", "latin-ext"],
  weight: ["600"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_TITLE} | ${SITE_NAME}`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  manifest: "/manifest.json",
  openGraph: {
    type: "website",
    locale: "sk_SK",
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE],
  },
  twitter: { card: "summary_large_image", images: [OG_IMAGE.url] },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#17213a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // English pages (app/en): worker.ts sends lang="en" in the HTML, the script in app/en/layout.tsx covers local runs.
    <html
      lang="sk"
      suppressHydrationWarning
      className={`${figtree.variable} ${bricolage.variable} ${barlowCondensed.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* TEMP iPhone app check, preview only (workers.dev): what the page sees at the top. Remove before merge. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){if(!/workers\.dev$/.test(location.hostname))return;addEventListener("load",function(){var p=document.createElement("div");p.style.cssText="position:fixed;top:0;left:0;right:0;height:env(safe-area-inset-top);visibility:hidden";document.body.appendChild(p);var d=document.createElement("div");d.style.cssText="position:fixed;left:8px;bottom:90px;z-index:99;background:#000c;color:#fff;font:12px monospace;padding:6px 8px;border-radius:8px;white-space:pre";var m=function(q){return matchMedia(q).matches};var f=function(){d.textContent="inset-top "+p.offsetHeight+"px\nstandalone "+m("(display-mode: standalone)")+" navStandalone "+!!navigator.standalone+"\nscreen "+screen.width+"x"+screen.height+" inner "+innerWidth+"x"+innerHeight+"\nscrollY "+Math.round(scrollY)+" dpr "+devicePixelRatio+"\nmeta-sb "+((document.querySelector('meta[name=apple-mobile-web-app-status-bar-style]')||{}).content||"none")};f();document.body.appendChild(d);addEventListener("scroll",f,{passive:true});addEventListener("resize",f)})})()`,
          }}
        />
        <ServiceWorkerRegister />
        <StaleCodeReload />
        <LangProvider>
          <UserLocationProvider>
            <TripSettingsProvider>
              <TopBar />
              {children}
            </TripSettingsProvider>
          </UserLocationProvider>
        </LangProvider>
        <VisitBeacon />
        <Analytics />
      </body>
    </html>
  );
}
