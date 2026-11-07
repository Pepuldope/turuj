"use client";

import { useEffect, useState } from "react";
import { applyOptOut, optedOut } from "@/lib/analytics";
import { setTeamAccount, useAccount } from "@/lib/account";

/**
 * On /statistiky: whether this browser is left out of the counts, and how to change it. Two ways:
 * a team account (set here, holds on every device it signs in on) or "?nepocitat=1" for one browser.
 */
export function OptOutNote() {
  const [off, setOff] = useState<boolean | null>(null);
  const { loaded, account } = useAccount();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    applyOptOut();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOff(optedOut());
  }, []);
  if (off === null) return null;
  const team = account?.team === true;
  const flip = async () => {
    setBusy(true);
    setFailed(false);
    const ok = await setTeamAccount(!team);
    setBusy(false);
    if (ok) setOff(!team);
    else setFailed(true);
  };
  return (
    <div className="flex flex-col gap-2 text-xs">
      <p className="opacity-70">
        {/* The team-account switch below shows only when signed in; signed out, point to signing in instead. */}
        {off
          ? `Tento prehliadač sa nepočíta (zrušíte cez ?nepocitat=0 alebo cez tímový účet ${account ? "nižšie" : "po prihlásení"}).`
          : `Tento prehliadač sa počíta. Jeden prehliadač vypnete cez ?nepocitat=1, všetky zariadenia tímu cez tímový účet ${account ? "nižšie" : "po prihlásení"}.`}
      </p>
      {loaded && account && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={flip}
            disabled={busy}
            className="min-h-10 rounded-full border border-[var(--border)] bg-[var(--card-bg)] px-4 text-sm font-semibold hover:border-[var(--accent)] disabled:opacity-60 motion-reduce:transition-none"
          >
            {team ? "Toto nie je tímový účet: počítať ma znova" : "Toto je tímový účet: nepočítať ma na žiadnom zariadení"}
          </button>
          {failed && <span role="status" className="text-[var(--warn)]">Nepodarilo sa uložiť. Skúste to znova.</span>}
        </div>
      )}
    </div>
  );
}
