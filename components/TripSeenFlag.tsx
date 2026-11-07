"use client";

import { useEffect } from "react";
import { TRIP_SEEN_KEY } from "@/lib/tripSeen";

/** Renders nothing: remembers in this browser that a trip page was opened (the app bar waits for it). */
export function TripSeenFlag() {
  useEffect(() => {
    try {
      localStorage.setItem(TRIP_SEEN_KEY, "1");
    } catch {
      // Storage blocked: the app bar then waits for a saved trip instead.
    }
  }, []);
  return null;
}
