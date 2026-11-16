// Backgrounds for trip cards without a photo (Peter, 15 Nov 2026): low hills in two solid tones mixed from the kind
// colour (back 15 % white, front 30 %), the back hill's outline carrying a quiet, off-centre sign of the kind. viewBox
// 96 x 150, drawn bottom-aligned. Holes (cave, lake) show the kind colour. Drafts: Túruj/brand-ux/mockups/2026-11-15-card-scenes.
import type { DestinationKind } from "@/lib/tripSchema";

export interface CardScene {
  /** The back hill with its sign. */
  back: string;
  backEvenOdd?: boolean;
  /** Water in the front hill's tone, drawn before it (the waterfall). */
  water?: string;
  /** A front hill of its own (the lake cut into it); else FRONT_HILL. */
  front?: string;
  frontEvenOdd?: boolean;
}

export const FRONT_HILL = "M0 150 L0 130 C18 124 36 127 52 123 C68 119 84 124 96 121 L96 150Z";

export const CARD_SCENES: Record<DestinationKind, CardScene> = {
  vrchol: { back: "M0 104 L10 92 L19 78 L28 93 L40 100 C56 96 70 98 82 102 L96 100 L96 150 L0 150Z" },
  hrad: { back: "M0 106 C18 100 34 102 50 100 L60 99 V90 h3 v2.5 h3 V90 h3 v2.5 h2 V83 l3 -3.5 l3 3.5 V92.5 h2 V90 h3 v2.5 h3 V90 h1 V99 L96 102 L96 150 L0 150Z" },
  vyhliadka: { back: "M0 104 C20 98 40 100 58 98 L64 97 L65.5 84 L64 84 L64 81.5 L67.5 78 L71 81.5 L71 84 L69.5 84 L71 97 C80 98 88 100 96 100 L96 150 L0 150Z" },
  chata: { back: "M0 104 L10 102 V96 L16.5 90.5 L23 96 V101 C40 98 64 100 96 102 L96 150 L0 150Z" },
  ine: { back: "M0 104 C20 98 40 100 58 101 L61 101 L65 93 L69 101 L71 101 L75.5 91 L80 101 C86 101 92 101 96 101 L96 150 L0 150Z" },
  jaskyna: { back: "M0 100 C14 92 30 94 44 98 C60 102 78 100 96 102 L96 150 L0 150Z M10 150 V117 C10 111.5 13.5 107.5 18 107.5 C22.5 107.5 26 111.5 26 117 V150Z", backEvenOdd: true },
  roklina: { back: "M0 98 C20 94 40 96 58 99 L62 150 L66 150 L69 99 C78 96 88 97 96 99 L96 150 L0 150Z" },
  vodopad: { back: "M0 102 C16 96 30 92 44 92 C54 92 60 96 63.5 100 L69.5 100 C73 96 80 94 96 96 L96 150 L0 150Z", water: "M63.5 99 h6 L71 126 h-9Z" },
  pleso: { back: "M0 104 C20 100 38 100 50 100 L66 86 L82 100 L96 100 L96 150 L0 150Z", front: "M0 150 L0 130 C18 124 36 127 52 123 C68 119 84 124 96 121 L96 150Z M42 137 C47 132.5 58 131.5 66 131.5 C74 131.5 85 132.5 90 137 C85 140.5 74 141.5 66 141.5 C58 141.5 47 140.5 42 137Z", frontEvenOdd: true },
};
