import type { Metadata } from "next";
import { SavedIntro } from "@/components/SavedIntro";
import { SavedTripsList } from "@/components/SavedTripsList";
import { SiteFooter } from "@/components/SiteFooter";
import { Here, PageBackLink } from "@/components/CameFrom";
import { T } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Moje výlety",
  robots: { index: false, follow: true },
};

export default function SavedTripsPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <PageBackLink />
        <Here label="Moje výlety" translate />
      </div>
      <header className="flex flex-col gap-1">
        <h1 className="text-[1.65rem] leading-tight font-extrabold"><T>Moje výlety</T></h1>
        <SavedIntro />
      </header>
      <SavedTripsList />
      <SiteFooter />
    </main>
  );
}
