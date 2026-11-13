"use client";

import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { DayPlan } from "@/lib/dayPlan";

/**
 * The chosen day's plan, for steps that are rendered by TripSheet but sit inside TripPlanner's plan card
 * (Kadiaľ pôjdete's route rows, Zastávky po ceste). Since the 12 Nov 2026 reorder, Kedy is the LAST step,
 * so these earlier steps show the day's conditions (daylight, return time) from the plan as it stands:
 * the chosen day and the current start time (the default one until Kedy is opened).
 */
export interface PlanDay {
  /** Null while the plan isn't known yet (no sun times, route still loading). */
  plan: DayPlan | null;
  /** True while the route/ride is still being worked out: don't warn from a guess. */
  loading: boolean;
  /** "Dnes" / "Zajtra" / "Sobota" etc., already translated. */
  dayWord: string;
  /** The day after "na": "dnes", "zajtra", "sobotu 14. 11." (lib/days.ts dayAfterNa), for "na {day} pridlhá". */
  dayNa: string;
  /** Minutes the chosen stops add to the walk (already included in plan.hikeEnd). */
  stopMin: number;
  /**
   * The ride before the walk in ms (the drive, or the way to the stop); 0 when there is no leg (no start set, or on foot).
   * With a leg, every time the Kedy step and its shortcuts speak is the departure from home (Peter, 2026-11-13).
   */
  leadMs: number;
  /**
   * Move the start to this time ("HH:MM"): the departure when there is a leg, else the walk start. It is the stored
   * setting as it is (departure by car, time at the stop by bus or train), no conversion.
   */
  setStart: (hhmm: string) => void;
}

const PlanDayContext = createContext<PlanDay | null>(null);

export function PlanDayProvider({ value, children }: { value: PlanDay; children: ReactNode }) {
  return <PlanDayContext.Provider value={value}>{children}</PlanDayContext.Provider>;
}

/** Null outside a trip page's plan card (e.g. the /cesty comparison page): render no day notes then. */
export function usePlanDay(): PlanDay | null {
  return useContext(PlanDayContext);
}
