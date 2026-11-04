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
  // Home-screen app on iPhone: a see-through status bar with a white clock over our own
  // night-blue strip (StatusStrip in TopBar). With the default style iOS laid a white haze
  // over the top of the page on first open (Peter, 2026-11-04).
  appleWebApp: { capable: true, title: "Túruj", statusBarStyle: "black-translucent" },
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
