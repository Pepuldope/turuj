import { describe, expect, it } from "vitest";
import { cpSkUrl, googleWalkUrl, mapyUrl, mapyWalkUrl, parkingPlace, readSharedPlan, sharePath, shareText, startTown, walkStops } from "./links";
import { dayAfterNa, dayChips, dayFit, dayInSentence, longDay } from "./days";

const BRATISLAVA = { lat: 48.1486, lon: 17.1077 };

describe("shared plan links", () => {
  const car = { date: "2026-10-17", meet: "09:40", transit: false, withKids: false, pick: 0 };

  it("carries the meeting time, never the sender's start", () => {
    const path = sharePath("pajstun", car);
    expect(path).toBe("/trasa/pajstun?den=2026-10-17&stretnutie=09%3A40");
    expect(readSharedPlan(path.split("?")[1])).toEqual({ ...car, time: null });
  });

  it("carries the kids pace and the picked parking or stop", () => {
    const bus = { ...car, transit: true, withKids: true, pick: 2 };
    const path = sharePath("pajstun", bus);
    expect(path).toBe("/trasa/pajstun?den=2026-10-17&stretnutie=09%3A40&cesta=bus&deti=1&s=2");
    expect(readSharedPlan(path.split("?")[1])).toEqual({ ...bus, time: null });
    expect(readSharedPlan(sharePath("pajstun", { ...car, pick: 1 }).split("?")[1])?.pick).toBe(1);
  });

  it("still reads older links with the sender's departure", () => {
    expect(readSharedPlan("den=2026-10-17&odchod=08:50&z=Bratislava")).toEqual({
      date: "2026-10-17",
      meet: null,
      time: "08:50",
      transit: false,
      withKids: false,
      pick: 0,
    });
  });

  it("reads odd picks as our default", () => {
    expect(readSharedPlan("den=2026-10-17&stretnutie=08:50&p=-1")?.pick).toBe(0);
    expect(readSharedPlan("den=2026-10-17&stretnutie=08:50&p=1.5")?.pick).toBe(0);
    // A parking pick doesn't count for a plan met at a stop.
    expect(readSharedPlan("den=2026-10-17&stretnutie=08:50&cesta=bus&p=2")?.pick).toBe(0);
  });

  it("ignores broken shared links", () => {
    expect(readSharedPlan("den=zajtra&stretnutie=08:50")).toBeNull();
    expect(readSharedPlan("den=2026-10-17")).toBeNull();
    expect(readSharedPlan("den=2026-02-30&stretnutie=08:50")).toBeNull();
    expect(readSharedPlan("den=2026-10-17&stretnutie=25:99")).toBeNull();
    expect(readSharedPlan("den=2028-02-29&stretnutie=23:59")).not.toBeNull();
  });

  it("shares a GPS start only as its town name", () => {
    expect(startTown({ label: "Vaša poloha", source: "gps" }, null)).toBeNull();
    expect(startTown({ label: "Pezinok", source: "gps" }, "Pezinok")).toBe("Pezinok");
    expect(startTown({ label: "Pezinok, okres Pezinok", source: "manual" })).toBe("Pezinok");
  });

  it("writes a chat-ready message with times that hold for every friend", () => {
    const text = shareText({
      name: "Vodopád Hučák",
      dayLabel: "sobota 24. 10.",
      withKids: true,
      meet: new Date(2026, 9, 24, 8, 56),
      place: parkingPlace(null),
      end: new Date(2026, 9, 24, 9, 41),
      endPlace: "car",
      inDaylight: true,
      hikeMin: 45,
      difficulty: "lahka",
      url: "https://turuj.sk/trasa/hucak",
    });
    expect(text).toBe(
      "Vodopád Hučák · sobota 24. 10. (s deťmi)\n" +
        "• 8:56 stretnutie na parkovisku\n" +
        "• 45 min chôdze, ľahká\n" +
        "• 9:41 späť pri aute\n" +
        "\n" +
        "Celý plán je na Túruj, aj kedy vyraziť z tvojho miesta:\n" +
        "https://turuj.sk/trasa/hucak"
    );
  });

  it("warns after sunset and starts at the trail without a ride", () => {
    const text = shareText({
      name: "Chleb",
      dayLabel: "sobota 10. 10.",
      withKids: false,
      meet: new Date(2026, 9, 10, 10, 0),
      place: null,
      end: new Date(2026, 9, 10, 19, 10),
      endPlace: null,
      inDaylight: false,
      hikeMin: 360,
      difficulty: "tazka",
      url: "https://turuj.sk/trasa/chleb",
    });
    expect(text).toContain("• 10:00 začiatok túry\n• 6 h chôdze, ťažká\n• 19:10 koniec túry");
    expect(text).toContain("Pozor, z túry zídete až po západe slnka.");
  });

  it("names a parking only when it has its own name", () => {
    expect(parkingPlace("Parkovisko")).toBe("na parkovisku");
    expect(parkingPlace("Parkovisko Pod Kriváňom")).toBe("na parkovisku Pod Kriváňom");
  });
});

describe("hand-off links", () => {
  it("prefills cp.sk with from, to, day and time", () => {
    expect(cpSkUrl("Borinka", "Bratislava", "2026-10-17", "08:50")).toBe(
      "https://cp.sk/vlakbusmhd/spojenie/?f=Bratislava&t=Borinka&date=17.10.2026&time=08%3A50"
    );
    expect(cpSkUrl("Borinka", null, null, null)).toBe("https://cp.sk/vlakbusmhd/spojenie/?t=Borinka");
  });

  it("uses lon,lat order for Mapy.com", () => {
    expect(mapyUrl({ lat: 48.3, lon: 17.1 }, null)).toContain("center=17.10000,48.30000");
    expect(mapyUrl({ lat: 48.3, lon: 17.1 }, BRATISLAVA)).toContain("start=17.10770,48.14860&end=17.10000,48.30000");
  });
});

describe("days", () => {
  it("offers Dnes, Zajtra and the weekend without duplicates", () => {
    // Friday 16 Oct 2026: tomorrow is Saturday.
    expect(dayChips(new Date(2026, 9, 16, 10)).map((c) => c.label)).toEqual(["Dnes", "Zajtra", "Ne"]);
    // Tuesday 13 Oct 2026.
    expect(dayChips(new Date(2026, 9, 13, 10)).map((c) => c.iso)).toEqual([
      "2026-10-13",
      "2026-10-14",
      "2026-10-17",
      "2026-10-18",
    ]);
  });

  it("names days the way people say them", () => {
    const now = new Date(2026, 9, 13, 10);
    expect(dayInSentence("2026-10-13", now)).toBe("dnes");
    expect(dayInSentence("2026-10-14", now)).toBe("zajtra");
    expect(dayInSentence("2026-10-17", now)).toBe("v sobotu");
    expect(dayInSentence("2026-10-22", now)).toBe("vo štvrtok 22. 10.");
    expect(longDay("2026-10-17")).toBe("sobota 17. 10.");
  });

  it("is strict today and lenient on other days", () => {
    const base = { date: "2026-10-13", driveMin: 60, hikeMin: 240, location: BRATISLAVA };
    expect(dayFit({ ...base, now: new Date(2026, 9, 13, 8) })!.status).toBe("fits");
    expect(dayFit({ ...base, now: new Date(2026, 9, 13, 14) })!.status).toBe("too-late");
    // Same trip planned for tomorrow from this afternoon still fits.
    expect(dayFit({ ...base, date: "2026-10-14", now: new Date(2026, 9, 13, 14) })!.status).toBe("fits");
  });

  it("drops trips that would mean leaving before 5:00", () => {
    const fit = dayFit({ date: "2026-10-14", now: new Date(2026, 9, 13, 14), driveMin: 360, hikeMin: 450, location: BRATISLAVA })!;
    expect(fit.status).toBe("too-early");
    expect(dayFit({ date: "2026-10-14", now: new Date(2026, 9, 13, 14), driveMin: 120, hikeMin: 450, location: BRATISLAVA })!.status).toBe("fits");
  });

  it("drops trips longer than the day's daylight", () => {
    const fit = dayFit({ date: "2026-12-21", now: new Date(2026, 11, 1), driveMin: 120, hikeMin: 480, location: BRATISLAVA })!;
    expect(fit.status).toBe("too-long");
  });
});

describe("walking hand-off", () => {
  // A straight 4-point trail north from the car, goal at the top.
  const up: [number, number][] = [
    [49.0, 19.0],
    [49.01, 19.0],
    [49.02, 19.0],
    [49.03, 19.0],
    [49.04, 19.0],
  ];
  const car = { lat: 48.999, lon: 19.0 };

  it("gives Google 3 points ending at the goal of a there-and-back walk", () => {
    const url = googleWalkUrl(car, { points: up, loop: false }, null);
    expect(url).toContain("travelmode=walking");
    expect(url).toContain("origin=48.99900,19.00000");
    expect(url).toContain("destination=49.04000,19.00000");
    expect(url.split("waypoints=")[1].split("&")[0].split("%7C")).toHaveLength(3);
  });

  it("sends Mapy.com up, round the goal and back to the car", () => {
    const { via, end } = walkStops({ points: up, loop: false }, null, 15, true);
    expect(end).toBe("start");
    expect(via.length).toBeLessThanOrEqual(15);
    expect(via[Math.floor(via.length / 2)]).toEqual({ lat: 49.04, lon: 19.0 });
    const url = mapyWalkUrl(car, { points: up, loop: false }, null);
    expect(url).toContain("routeType=foot_hiking");
    expect(url).toContain("start=19.00000,48.99900&end=19.00000,48.99900");
  });

  it("starts where a parking up the trail joins it", () => {
    const { via } = walkStops({ points: up, loop: false }, { lat: 49.02, lon: 19.0 }, 3, false);
    expect(via.every((p) => p.lat >= 49.02)).toBe(true);
  });

  it("goes round a loop and back to the start", () => {
    const loop: [number, number][] = [
      [49.0, 19.0],
      [49.0, 19.01],
      [49.01, 19.01],
      [49.01, 19.0],
      [49.0, 19.0],
    ];
    const { via, end } = walkStops({ points: loop, loop: true }, null, 3, false);
    expect(end).toBe("start");
    expect(via).toHaveLength(3);
  });
});

describe("walk stops on a short walk", () => {
  it("never repeats a point or the goal", () => {
    const walk = { points: [[49, 19], [49.001, 19]] as [number, number][], loop: false };
    const { via, end } = walkStops(walk, null, 15, true);
    expect(end).toBe("start");
    const keys = via.map((p) => `${p.lat},${p.lon}`);
    keys.forEach((k, i) => expect(k).not.toBe(keys[i - 1]));
    expect(keys.filter((k) => k === "49.001,19")).toHaveLength(1);
  });
});

describe("dayAfterNa", () => {
  it("reads after \"na\"", () => {
    expect(dayAfterNa("2026-10-18")).toBe("nedeľu 18. 10.");
    expect(dayAfterNa("2026-10-22")).toBe("štvrtok 22. 10.");
  });
});
