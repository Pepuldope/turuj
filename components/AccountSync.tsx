"use client";

import { useEffect } from "react";
import { lastSyncAt, needsSync, syncNow, syncOff } from "@/lib/accountSync";
import { useAccount } from "@/lib/account";
import { moveDoneTripsToVisits } from "@/lib/visits";

const STALE_MS = 5 * 60 * 1000;
const DEBOUNCE_MS = 2000;

/** Keeps the signed-in account's trips and visits in step with this device. Renders nothing. */
export function AccountSync() {
  const { loaded, account } = useAccount();
  const email = account?.email ?? null;

  useEffect(() => {
    moveDoneTripsToVisits();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (!email) {
      syncOff();
      return;
    }
    const stale = () => {
      const at = lastSyncAt(email);
      return at === null || Date.now() - at > STALE_MS;
    };
    const onList = /^(\/en)?\/ulozene\/?$/.test(location.pathname);
    if (needsSync(email) || stale() || onList) void syncNow(email);

    let timer: ReturnType<typeof setTimeout> | undefined;
    const changed = () => {
      clearTimeout(timer);
      timer = setTimeout(() => needsSync(email) && void syncNow(email), DEBOUNCE_MS);
    };
    const online = () => needsSync(email) && void syncNow(email);
    const visible = () => document.visibilityState === "visible" && stale() && void syncNow(email);
    window.addEventListener("turuj-saved-trips", changed);
    window.addEventListener("turuj-visits", changed);
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("turuj-saved-trips", changed);
      window.removeEventListener("turuj-visits", changed);
      window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [loaded, email]);

  return null;
}
