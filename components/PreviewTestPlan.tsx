"use client";

import { useEffect } from "react";
import { COUNTED_HOSTS } from "@/lib/site";

/** How many days ago the test plan's day was. */
const PAST_DAYS = 3;

/**
 * A one-click test plan for previews (Peter, 27 Nov 2026: pasting a line into the browser's console was too fiddly):
 * any page with `?test-plan=past` puts a saved plan for Burianka three days ago on this device, replacing the saved
 * list, and reloads the page without the parameter. Does nothing on the live site (COUNTED_HOSTS).
 */
export function PreviewTestPlan() {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("test-plan") !== "past" || COUNTED_HOSTS.includes(url.host.toLowerCase())) return;
    const date = new Date(Date.now() - PAST_DAYS * 86400000).toLocaleDateString("en-CA", { timeZone: "Europe/Bratislava" });
    const plan = {
      slug: "burianka",
      place: "burianka",
      route: "burianka",
      name: "Burianka",
      date,
      time: "08:00",
      start: null,
      driveMin: null,
      hikeMin: 15,
      withKids: false,
      sun: { lat: 48.17, lon: 16.98 },
      stops: [],
      closures: [],
      savedAt: new Date().toISOString(),
      offline: "ok",
    };
    try {
      localStorage.setItem("turuj-saved-trips", JSON.stringify([plan]));
    } catch {
      return;
    }
    url.searchParams.delete("test-plan");
    window.location.replace(url.toString());
  }, []);
  return null;
}
