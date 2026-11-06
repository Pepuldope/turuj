"use client";

import { useState } from "react";
import { HEARD_FROM, track } from "@/lib/analytics";
import { useT } from "@/lib/i18n";

/** Fixed answers only, so nothing typed ever leaves the device. */
const LABEL: Record<(typeof HEARD_FROM)[number], string> = {
  google: "Google",
  ai: "ChatGPT / AI",
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  kamarat: "Od kamaráta",
  skola: "V škole",
  klub: "Klub / KST",
  ine: "Inde",
};

const chip =
  "rounded-[var(--radius-chip)] border border-[var(--border)] bg-[var(--card-bg)] px-3 py-1.5 text-sm font-semibold hover:border-[var(--accent)]";

/**
 * One-tap "Ako ste sa o nás dozvedeli?" after the first saved trip on this device (heard_from):
 * the only way to see word of mouth (WhatsApp, Messenger) that arrives as "direct". Skippable,
 * asked once, and nothing new is stored: the parent shows it when the saved list goes from 0 to 1.
 */
export function HeardFrom({ onDone }: { onDone: () => void }) {
  const t = useT();
  const [thanks, setThanks] = useState(false);
  if (thanks) return <p className="text-sm">{t("Ďakujeme!")}</p>;
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-[var(--sun-soft)] p-3 text-sm">
      <p className="font-semibold">{t("Ako ste sa o Túruj dozvedeli?")}</p>
      <div className="flex flex-wrap gap-1.5">
        {HEARD_FROM.map((ch) => (
          <button
            key={ch}
            type="button"
            className={chip}
            onClick={() => {
              track("heard_from", { ch });
              setThanks(true);
              setTimeout(onDone, 1500);
            }}
          >
            {t(LABEL[ch])}
          </button>
        ))}
        <button type="button" onClick={onDone} className="px-2 text-sm underline">
          {t("Preskočiť")}
        </button>
      </div>
    </div>
  );
}
