import type { Metadata } from "next";
import { InfoPage } from "@/components/InfoPage";
import { OptOutNote } from "@/components/OptOutNote";
import { StatsTables } from "@/components/StatsTables";

export const metadata: Metadata = { title: "Visit statistics", robots: { index: false, follow: false } };

/** English twin of /statistiky: same numbers, English labels (StatsTables follows the page language). */
export default function StatsPage() {
  return (
    <InfoPage
      title="Visit statistics"
      intro="How many different people came in the month and how many of them on at least 2 or 4 different days. The current month fills in as it goes."
    >
      <StatsTables />
      <OptOutNote />
    </InfoPage>
  );
}
