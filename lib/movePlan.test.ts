import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/TrailReminders", () => ({ support: () => "no", subscribe: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));

import { movePlan } from "@/lib/movePlan";
import type { SavedTrip } from "@/lib/savedTrips";

const trip = {
  slug: "hrad-devin",
  name: "Hrad Devín",
  date: "2026-11-21",
  time: "09:00",
  start: null,
  driveMin: 20,
  hikeMin: 60,
  sun: { lat: 48.17, lon: 16.98 },
  savedAt: "2026-11-20T10:00:00Z",
  offline: "ok",
  skipAsk: true,
} as SavedTrip;

describe("movePlan", () => {
  it("moves the plan to the new day and asks about it again after that day", () => {
    const patch = vi.fn();
    movePlan(trip, "2026-12-05", patch, "sk", "home");
    expect(patch).toHaveBeenCalledWith("hrad-devin", { date: "2026-12-05", skipAsk: false });
  });

  it("drops the old day's train times: they belong to the old day", () => {
    const patch = vi.fn();
    movePlan({ ...trip, transit: true, fixed: { there: { leave: 480, arrive: 540 }, back: null } }, "2026-12-05", patch, "sk", "list");
    expect(patch).toHaveBeenCalledWith("hrad-devin", { date: "2026-12-05", skipAsk: false, fixed: null });
  });
});
