import type { Metadata, Viewport } from "next";
import { preload } from "react-dom";
import "./fonts.css";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { AccountSync } from "@/components/AccountSync";
import { PreviewTestPlan } from "@/components/PreviewTestPlan";
import { OfflineCopies } from "@/components/OfflineCopies";
import { StaleCodeReload } from "@/components/StaleCodeReload";
import { UserLocationProvider } from "@/lib/userLocation";
import { TripSettingsProvider } from "@/lib/tripSettings";
import { Analytics } from "@/components/Analytics";
import { VisitBeacon } from "@/components/VisitBeacon";
import { TopBar } from "@/components/TopBar";
import { SkipToTrips } from "@/components/SkipToTrips";
import { LangProvider } from "@/lib/i18n";
import { OG_IMAGE, SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from "@/lib/site";

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

// Latin subsets are needed on every page; latin-ext is fetched only when a Slovak letter shows up.
const PRELOAD_FONTS = ["figtree-latin", "bricolage-grotesque-latin-800", "barlow-condensed-latin-600"];

export default function RootLayout({ children }: LayoutProps<"/">) {
  for (const f of PRELOAD_FONTS) preload(`/fonts/${f}.woff2`, { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  return (
    // English pages (app/en): worker.ts sends lang="en" in the HTML, the script in app/en/layout.tsx covers local runs.
    <html
      lang="sk"
      suppressHydrationWarning
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">
        <ServiceWorkerRegister />
        <AccountSync />
        <PreviewTestPlan />
        <OfflineCopies />
        <StaleCodeReload />
        <LangProvider>
          <UserLocationProvider>
            <TripSettingsProvider>
              <SkipToTrips />
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
