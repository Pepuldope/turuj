import { Fragment } from "react";

/** Times, distances and durations in the numbers font (brand manual: "like a signpost"), the words around them in the text font. */
export function Nums({ text }: { text: string }) {
  const parts = text.split(/(\d[\d:.,]*(?:\s?(?:h|min|km|m)\b)?(?:\s?\d+\s?min\b)?)/);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <span key={i} className="font-data text-[1.1em]">
            {p}
          </span>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}
