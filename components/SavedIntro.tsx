"use client";

import { useInstalled } from "@/lib/installApp";
import { useT } from "@/lib/i18n";

/** The line under "Moje výlety". Only the installed app talks about working without signal (Peter, 25 Nov 2026). */
export function SavedIntro() {
  const t = useT();
  const installed = useInstalled();
  return (
    <p className="text-sm text-[var(--muted)]">
      {installed ? t("Uložené len v tomto zariadení. Pri každom výlete vidíte, či funguje aj bez signálu.") : t("Uložené len v tomto zariadení.")}
    </p>
  );
}
