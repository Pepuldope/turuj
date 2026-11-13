"use client";

import { useEffect, useMemo } from "react";
import { setDayModel } from "@/lib/dayClock";
import type { DayModel } from "@/lib/dayClock";
import type { DayPlan } from "@/lib/dayPlan";
import { goalTime } from "@/lib/dayClock";
import { trimProfile } from "@/lib/tripProfile";
import type { TripProfile } from "@/lib/tripProfile";
import type { TrailJoin } from "@/lib/trailJoin";

/**
 * Tells the day map (lib/dayClock.ts) what the plan is: the same hike times, trail profile, walk to the
 * trail and stops the sun dial and the times row are made of, so the map's labels and its walker agree with them.
 * `profile` is the final profile (with the stops in), `fullProfile` the trail alone as the server built it.
 */
export function usePublishDay({
  plan,
  profile,
  fullProfile,
  skip,
  approachShare,
  mode,
  startName,
}: {
  plan: DayPlan | null;
  profile: TripProfile | null;
  fullProfile: TripProfile | null;
  skip: Pick<TrailJoin, "skip_out" | "skip_back"> | null;
  /** The walk to the trail and back as a share of the walking time (TripPlanner's `withApproach` argument). */
  approachShare: number;
  mode: DayModel["mode"];
  /** The start's name (already in the page's language), for the label where the ride leaves the map; null without a start. */
  startName: string | null;
}) {
  const model = useMemo<DayModel | null>(() => {
    if (!plan) return null;
    const hs = plan.hikeStart.getTime();
    const he = plan.hikeEnd.getTime();
    const byName = new Map<string, number[]>();
    for (const pa of profile?.pauses ?? []) {
      if (!pa.kind) continue;
      byName.set(pa.name, [...(byName.get(pa.name) ?? []), hs + pa.from * (he - hs)]);
    }
    const ms = (k: "drive-there" | "drive-back") => {
      const s = plan.segments.find((x) => x.kind === k);
      return s ? { from: s.start.getTime(), to: s.end.getTime() } : null;
    };
    const there = ms("drive-there");
    const back = ms("drive-back");
    return {
      hs,
      he,
      trail: fullProfile && skip ? trimProfile(fullProfile, skip.skip_out, skip.skip_back) : fullProfile,
      // withApproach leaves the profile alone for a share this small or this big.
      approach: approachShare > 0 && approachShare < 0.5 ? approachShare : 0,
      pauses: (profile?.pauses ?? []).map(({ from, to }) => ({ from, to })),
      goalTime: profile ? goalTime(plan, profile).getTime() : null,
      stops: [...byName].map(([name, times]) => ({ name, times })),
      mode,
      ride: startName && mode !== "foot" && (there || back) ? { name: startName, there, back } : null,
    };
  }, [plan, profile, fullProfile, skip, approachShare, mode, startName]);
  useEffect(() => {
    setDayModel(model);
    return () => setDayModel(null);
  }, [model]);
}
