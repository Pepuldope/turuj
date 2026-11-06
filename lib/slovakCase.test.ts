import { describe, expect, it } from "vitest";
import { accusative, directionTo } from "@/lib/slovakCase";

// Real names from the trip data (public/data/trips/index.json) and the kind the trip has.
describe("accusative after na", () => {
  const cases: [string, Parameters<typeof accusative>[1], string][] = [
    ["Kriváň", "vrchol", "na Kriváň"],
    ["Babia hora", "vrchol", "na Babiu horu"],
    ["Kráľova hoľa", "vrchol", "na Kráľovu hoľu"],
    ["Veľká Javorina", "vrchol", "na Veľkú Javorinu"],
    ["Rozsutec", "vrchol", "na Rozsutec"],
    ["Hoľa (Ľubovec)", "vrchol", "na Hoľu (Ľubovec)"],
    ["Skalka (Hubina)", "vrchol", "na Skalku (Hubina)"],
    ["Kamenné vráta (Brestovec)", "vrchol", "na Kamenné vráta (Brestovec)"],
    ["Ostrý vrch", "vrchol", "na Ostrý vrch"],
    ["Vrch Slobodných", "vrchol", "na vrch Slobodných"],
    ["Popradské pleso", "pleso", "na Popradské pleso"],
    ["Zelené Kačacie pleso", "pleso", "na Zelené Kačacie pleso"],
    ["Počúvadliansky tajch", "pleso", "na Počúvadliansky tajch"],
    ["Trenčiansky hrad", "hrad", "na Trenčiansky hrad"],
    ["Hrad Vršatec", "hrad", "na hrad Vršatec"],
    ["Čonkavár", "hrad", "na Čonkavár"],
    ["Chata Magura", "chata", "na chatu Magura"],
    ["Bagarova chata", "chata", "na Bagarovu chatu"],
    ["Rozhľadňa Dukla", "vyhliadka", "na rozhľadňu Dukla"],
    ["Biela skala (Trenčianske Teplice)", "vyhliadka", "na Bielu skalu (Trenčianske Teplice)"],
    ["Lúčanský vodopád", "vodopad", "na Lúčanský vodopád"],
    ["Predajnianske vodopády", "vodopad", "na Predajnianske vodopády"],
    ["Plavecký hrad z Plaveckého Podhradia", "hrad", "na Plavecký hrad z Plaveckého Podhradia"],
  ];
  it.each(cases)("%s -> %s", (name, kind, want) => {
    expect(directionTo(name, kind)).toBe(want);
  });
});

describe("genitive after do (caves, valleys)", () => {
  it.each([
    ["Jánošíkova jaskyňa", "jaskyna", "do Jánošíkovej jaskyne"],
    ["Demänovská jaskyňa Slobody", "jaskyna", "do Demänovskej jaskyne Slobody"],
    ["Jaskyňa Driny", "jaskyna", "do jaskyne Driny"],
    ["Jaskyňa pod Jeleňom", "jaskyna", "do jaskyne pod Jeleňom"],
    ["Fričkovská jaskyňa 1", "jaskyna", "do Fričkovskej jaskyne 1"],
    ["Vrátna dolina", "roklina", "do Vrátnej doliny"],
    ["Sokolia dolina", "roklina", "do Sokolej doliny"],
    ["Roklina Machnaté", "roklina", "do rokliny Machnaté"],
  ] as const)("%s -> %s", (name, kind, want) => {
    expect(directionTo(name, kind)).toBe(want);
  });
});

describe("falls back when not confident", () => {
  it.each([
    ["Nad Černovou", "vrchol"], // starts with a preposition
    ["Pri Bielej studničke", "vrchol"],
    ["Holubyho chata", "chata"], // genitive modifier in front of a feminine noun
    ["Loviská", "vrchol"], // neuter plural that ends like a feminine adjective
    ["Jarabinský prielom", "roklina"], // a gorge noun we have no genitive for
    ["Zbojnícka diera", "jaskyna"],
    ["Ponor do Diablovej diery", "jaskyna"],
    ["Štefanová - nový vchod", "jaskyna"],
    ["Vlčie diery", "roklina"],
    ["Považská lesná železnica", "ine"], // kind "ine": we do not know what it is
    ["Dolina Bystrička", "vrchol"], // a valley under an "na" kind: wrong preposition
  ] as const)("%s", (name, kind) => {
    const p = accusative(name, kind);
    expect(p.confident).toBe(false);
    expect(p.text).toBe(name);
    expect(directionTo(name, kind)).toBeNull();
  });
});
