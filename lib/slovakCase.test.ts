import { describe, expect, it } from "vitest";
import { accusative, directionTo, fromStart, genitiveFrom, zOrZo } from "@/lib/slovakCase";

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
    ["Hrad Sitno", "hrad", "na hrad Sitno"],
    ["Vodopád Skok", "vodopad", "na vodopád Skok"],
    ["Hrad Strečno", "hrad", "na hrad Strečno"],
    ["Pleso nad Skokom", "pleso", "na Pleso nad Skokom"],
    ["Chata pod Rysmi", "chata", "na Chatu pod Rysmi"],
    ["Sedlo pod Svišťovkou", "vrchol", "na Sedlo pod Svišťovkou"],
    ["Zelené pleso", "pleso", "na Zelené pleso"],
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
    ["Téryho chata", "chata"], // same: the name keeps its capital on the "Túra: {name}" fallback
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

describe("genitive after z / zo (where a route starts)", () => {
  it.each([
    ["Brezina", "z Breziny"],
    ["Horná Dolina", "z Hornej Doliny"],
    ["Nižná Revúca", "z Nižnej Revúce"],
    ["Silická Brezová", "zo Silickej Brezovej"],
    ["Valaská Dubová", "z Valaskej Dubovej"],
    ["Zázrivá", "zo Zázrivej"],
    ["Šiatorská Bukovinka", "zo Šiatorskej Bukovinky"],
    ["Sklabiňa", "zo Sklabine"],
    ["Vasiľovská hoľa, chata", "z Vasiľovskej hole, chata"],
    ["Trangoška", "z Trangošky"],
    ["Rača, amfiteáter", "z Rače, amfiteáter"],
    ["Hamovanie", "z Hamovania"],
    ["Horné Srnie,Rybníky", "z Horného Srnia, Rybníky"],
    ["Plavecké Podhradie", "z Plaveckého Podhradia"],
    ["Radošovo", "z Radošova"],
    ["Košarisko", "z Košariska"],
    ["Fačkov", "z Fačkova"],
    ["Parkovisko", "z parkoviska"],
    ["Tri Studničky (Stará horáreň)", "z Troch Studničiek (Stará horáreň)"],
    ["Štefanová (bus)", "zo Štefanovej (bus)"],
    ["Slanec", null], // masculine: Slanca? varies
  ])("%s -> %s", (name, want) => {
    expect(fromStart(name)).toBe(want ?? null);
  });

  it("is not confident about plurals, masculine nouns, prepositions and odd shapes", () => {
    for (const n of ["Narcie", "Horné Vestenice", "Červený Kameň", "Zubák", "Pod tromi Tablami", "Kláštor pod Znievom", "Vrútky-Piatrová, hotel", "Dva stromy 35'", "Chata Vrátna", "Lúčky, Aqua - Vital park"]) {
      const o = genitiveFrom(n);
      expect(o.confident, n).toBe(false);
      expect(o.text).toBe(n);
    }
  });

  it("picks zo before s, z, š, ž", () => {
    expect([zOrZo("Štrby"), zOrZo("Silickej"), zOrZo("Zázrivej"), zOrZo("Žiliny"), zOrZo("Breziny")]).toEqual(["zo", "zo", "zo", "zo", "z"]);
  });
});
