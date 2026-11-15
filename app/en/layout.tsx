import type { Metadata } from "next";
import { OG_IMAGE_EN, SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: { default: `Where to go hiking today in Slovakia | ${SITE_NAME}`, template: `%s | ${SITE_NAME}` },
  description: "Day trips to the mountains and nature in Slovakia: how long the drive takes, where to park, the latest time to set off and be back before dark.",
  openGraph: { type: "website", locale: "en_GB", siteName: SITE_NAME, images: [OG_IMAGE_EN] },
};

/** English pages: the same pages as Slovak, under /en. The text comes from lib/en.ts (lib/i18n.tsx reads the address). */
export default function EnglishLayout({ children }: LayoutProps<"/en">) {
  return (
    <>
      {/* Screen readers and the browser's translate offer read the page's language before it hydrates. */}
      <script dangerouslySetInnerHTML={{ __html: 'document.documentElement.lang="en"' }} />
      {children}
    </>
  );
}
