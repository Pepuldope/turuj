"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { needsSync, syncIfOlder, syncNow, syncOff } from "@/lib/accountSync";
import { useAccount } from "@/lib/account";
import { fillHowOnce, moveDoneTripsToVisits } from "@/lib/visits";

// How soon a change made on another device shows here (Peter, 26 Nov 2026: a trip removed on the phone took
// about 5 minutes to go from the Mac, which is what the first version waited before it looked again).
// A change made on THIS device is sent 2 s after it; these are the times this device looks for the others' changes.
/** A page load looks when the last exchange is older than this. */
const LOAD_MS = 60 * 1000;
/** Coming back to the tab or the app looks when the last exchange is older than this. */
const BACK_MS = 10 * 1000;
/** While Moje výlety is open and on screen it looks this often. */
const LIST_MS = 20 * 1000;
const DEBOUNCE_MS = 2000;

/** Keeps the signed-in account's trips and visits in step with this device. Renders nothing. */
export function AccountSync() {
  const { loaded, account } = useAccount();
  const email = account?.email ?? null;
  const onList = /^(\/en)?\/ulozene\/?$/.test(usePathname() ?? "");

  useEffect(() => {
    moveDoneTripsToVisits();
    fillHowOnce();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (!email) {
      syncOff();
      return;
    }
    if (needsSync(email)) void syncNow(email);
    else syncIfOlder(email, LOAD_MS);

    let timer: ReturnType<typeof setTimeout> | undefined;
    const changed = () => {
      clearTimeout(timer);
      timer = setTimeout(() => needsSync(email) && void syncNow(email), DEBOUNCE_MS);
    };
    const online = () => needsSync(email) && void syncNow(email);
    // The tab or the installed app is looked at again: another device may have changed something meanwhile.
    const back = () => document.visibilityState === "visible" && syncIfOlder(email, BACK_MS);
    window.addEventListener("turuj-saved-trips", changed);
    window.addEventListener("turuj-visits", changed);
    window.addEventListener("online", online);
    window.addEventListener("focus", back);
    document.addEventListener("visibilitychange", back);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("turuj-saved-trips", changed);
      window.removeEventListener("turuj-visits", changed);
      window.removeEventListener("online", online);
      window.removeEventListener("focus", back);
      document.removeEventListener("visibilitychange", back);
    };
  }, [loaded, email]);

  // Moje výlety is the page where the lists are read: it looks when it opens (also from another page of the
  // site, without a page load) and then every 20 s while it is on screen.
  useEffect(() => {
    if (!loaded || !email || !onList) return;
    syncIfOlder(email, 3000);
    const id = setInterval(() => {
      // Every tick looks, unless an exchange has only just finished (a change made here, the tab coming back).
      if (document.visibilityState === "visible" && navigator.onLine !== false) syncIfOlder(email, 5000);
    }, LIST_MS);
    return () => clearInterval(id);
  }, [loaded, email, onList]);

  return null;
}
