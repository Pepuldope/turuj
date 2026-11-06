/**
 * Region names after "v oblasti" (genitive), e.g. "v oblasti Malých Karpát". Hand-written, one row
 * per region in pipeline/config.yaml; a region missing here gets no "v oblasti" sentence at all.
 */
const GENITIVE: Record<string, string> = {
  Tatry: "Tatier",
  "Slovenský raj": "Slovenského raja",
  "Malá Fatra": "Malej Fatry",
  "Malé Karpaty": "Malých Karpát",
  "Veľká Fatra": "Veľkej Fatry",
  "Nízke Tatry": "Nízkych Tatier",
  "Chočské vrchy a Orava": "Chočských vrchov a Oravy",
  Pieniny: "Pienin",
  "Kysuce a Javorníky": "Kysúc a Javorníkov",
  "Strážovské vrchy a Súľovské skaly": "Strážovských vrchov a Súľovských skál",
  "Biele Karpaty": "Bielych Karpát",
  "Považský Inovec, Tribeč a Vtáčnik": "Považského Inovca, Tribeča a Vtáčnika",
  "Štiavnické a Kremnické vrchy": "Štiavnických a Kremnických vrchov",
  "Poľana a Muránska planina": "Poľany a Muránskej planiny",
  "Slovenský kras a Volovské vrchy": "Slovenského krasu a Volovských vrchov",
  "Levočské vrchy, Branisko a Čergov": "Levočských vrchov, Braniska a Čergova",
  "Slanské vrchy, Vihorlat a Poloniny": "Slanských vrchov, Vihorlatu a Polonín",
  "Záhorie a Podunajsko": "Záhoria a Podunajska",
  "Krupinská planina, Ipeľ a Cerová vrchovina": "Krupinskej planiny, Ipľa a Cerovej vrchoviny",
  "Košická kotlina a juh východu": "Košickej kotliny a juhu východu",
};

/** "Malých Karpát" for "Malé Karpaty"; null when the form isn't known (or the region is the catch-all "Ďalšie miesta na Slovensku"). */
export function regionGenitive(name: string): string | null {
  return GENITIVE[name] ?? null;
}
