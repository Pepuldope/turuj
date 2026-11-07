"use client";

import { useEffect } from "react";
import { applyOptOut, countsHere } from "@/lib/analytics";
import { whenAccountKnown } from "@/lib/account";

/**
 * Tells the server "someone visited today" once per page load (see
 * app/api/visit/route.ts). Sends nothing in the body. Also where "?nepocitat=1"
 * switches counting off for this browser (lib/analytics.ts), as does a team account (lib/account.ts).
 */
export function VisitBeacon() {
  useEffect(() => {
    applyOptOut();
    // A signed-in team account opts this browser out (lib/account.ts) before the visit is sent.
    whenAccountKnown().then(() => {
      if (!countsHere()) return;
      try {
        if (!navigator.sendBeacon?.("/api/visit")) {
          fetch("/api/visit", { method: "POST", keepalive: true }).catch(() => {});
        }
      } catch {
        // Counting must never break the app.
      }
    });
  }, []);

  return null;
}
