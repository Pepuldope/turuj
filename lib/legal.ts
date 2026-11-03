// Facts the terms (/podmienky) and privacy page (/sukromie) name. Peter fills what is still open.

/** Date shown on both pages; change it with every real change of either text. */
export const LEGAL_UPDATED = "2026-11-03";

export const LEGAL_FACTS: Record<string, string> = {
  OPERATORS: "Peter Nemčok a Radoslav Nemec, dvaja plnoletí študenti",
  OPERATORS_SHORT: "Peter Nemčok a Radoslav Nemec",
  // Peter, 2026-11-03.
  ADDRESS: "Turnianska 3, 851 07 Bratislava-Petržalka",
  CONTROLLERS:
    "Túruj robia Peter Nemčok a Radoslav Nemec. O vašich údajoch rozhodujeme spoločne, preto sme spoloční prevádzkovatelia (čl. 26 nariadenia (EÚ) 2016/679, ďalej GDPR). Medzi sebou sme sa dohodli, že žiadosti o údaje vybavuje Peter Nemčok a Radoslav Nemec ho zastúpi, keď nemôže. Napísať však môžete ktorémukoľvek z nás a svoje práva môžete uplatniť voči obom.",
  DB_ACCESS:
    "Prístup k databáze a ku kódu má len Peter Nemčok a jeho účty sú chránené dvojfázovým overením (2FA).",
};

/** Placeholders left open: a test keeps them off the live site. */
export function openFacts(): string[] {
  return Object.entries(LEGAL_FACTS).filter(([, v]) => v.includes("[doplníme]")).map(([k]) => k);
}
