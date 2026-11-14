/** Which question rows "Dobré vedieť pred výletom" shows, in order. Five to eight by construction (Peter, 14 Nov 2026). */
export type AnswerRow = "dlzka" | "teren" | "trasa" | "tam" | "uzavery" | "kedy" | "odchod" | "o";

export interface RowFacts {
  hasPlaces: boolean;
  hasParking: boolean;
  hasStops: boolean;
  /** The month table has rows (needs the sun at the start). */
  hasMonths: boolean;
  hasAbout: boolean;
}

/** Always there: dlzka, teren, uzavery, odchod; kedy needs the month table (the sun's place is always known in practice). */
export function answerRows(f: RowFacts): AnswerRow[] {
  const rows: AnswerRow[] = ["dlzka", "teren"];
  if (f.hasPlaces) rows.push("trasa");
  if (f.hasParking || f.hasStops) rows.push("tam");
  rows.push("uzavery");
  if (f.hasMonths) rows.push("kedy");
  rows.push("odchod");
  if (f.hasAbout) rows.push("o");
  return rows;
}
