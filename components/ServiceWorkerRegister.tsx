"use client";

import { useEffect } from "react";
import { keepStorageIfSaved } from "@/lib/savedTrips";

/** Registers the service worker once on mount. Renders nothing. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline caching is a progressive enhancement; ignore registration failures.
    });
    keepStorageIfSaved();
  }, []);

  return null;
}
