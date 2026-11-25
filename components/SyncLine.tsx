"use client";

import { openSignIn, useAccount } from "@/lib/account";
import { needsSync, syncNow, useSyncStatus } from "@/lib/accountSync";
import { useSavedTrips } from "@/lib/savedTrips";
import { useT } from "@/lib/i18n";
import { UiIcon } from "@/components/UiIcon";

// The look of the site's inline text links (GoalStayRow, HomeExplorer); the padding is the tap target.
const LINK = "cursor-pointer py-1 font-semibold text-[var(--accent)] underline underline-offset-2";

/** The line under "Moje výlety": where the trips are kept, and what to do when that is not the account. */
export function SyncLine() {
  const t = useT();
  const { loaded, account } = useAccount();
  const { trips } = useSavedTrips();
  const sync = useSyncStatus();
  const offline = t("Pri každom výlete vidíte, či funguje aj bez signálu.");
  const cls = "text-sm text-[var(--muted)] break-words [overflow-wrap:anywhere]";

  if (!loaded) return <p className={cls}>{offline}</p>;
  if (!account) {
    if (trips.length === 0) return <p className={cls}>{t("Uložené len v tomto zariadení. Pri každom výlete vidíte, či funguje aj bez signálu.")}</p>;
    return (
      <p className={cls}>
        {t("Výlety sú len na tomto zariadení.")}{" "}
        <button type="button" onClick={openSignIn} className={LINK}>
          {t("Prihlásiť sa")}
        </button>{" "}
        {offline}
      </p>
    );
  }
  if (sync.state === "failed") {
    return (
      <p className={cls}>
        {t("Nepodarilo sa uložiť do účtu.")}{" "}
        <button type="button" onClick={() => void syncNow(account.email)} className={LINK}>
          {t("Skúsiť znova")}
        </button>{" "}
        {offline}
      </p>
    );
  }
  // Without signal a change waits on this device: don't say it is in the account yet.
  if (navigator.onLine === false && needsSync(account.email)) return <p className={cls}>{t("Zmeny sa do účtu uložia, keď budete mať signál.")} {offline}</p>;
  return (
    <p className={cls}>
      <UiIcon name="check" size={14} className="mr-1 align-[-2px] text-[var(--ok)]" />
      {t("Uložené v účte {email}, aj na ďalších zariadeniach.", { email: account.email })} {offline}
    </p>
  );
}
