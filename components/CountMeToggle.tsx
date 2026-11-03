"use client";

import { useEffect, useState } from "react";
import { optedOut, setOptedOut } from "@/lib/analytics";
import { useT } from "@/lib/i18n";

/** On /sukromie: "Nepočítať ma" stops Umami and our own counters in this browser. */
export function CountMeToggle() {
  const t = useT();
  const [off, setOff] = useState<boolean | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOff(optedOut());
  }, []);
  if (off === null) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-3">
      <p className="flex-1 text-sm">
        {off ? t("Tento prehliadač sa do štatistík nepočíta.") : t("Tento prehliadač sa do štatistík počíta.")}
      </p>
      <button
        type="button"
        onClick={() => {
          setOptedOut(!off);
          setOff(!off);
        }}
        className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-bold hover:border-[var(--accent)]"
      >
        {off ? t("Znova ma počítať") : t("Nepočítať ma")}
      </button>
    </div>
  );
}
