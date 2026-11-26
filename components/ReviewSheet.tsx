"use client";

import { UiIcon } from "@/components/UiIcon";
import { useState } from "react";
import { ReviewFields } from "@/components/ReviewFields";
import { keptReview } from "@/lib/reviewed";
import { sendReview } from "@/lib/sendReview";
import type { ReviewAnswers } from "@/lib/sendReview";
import "@/lib/legacyStorage";
import { LangLink, useT } from "@/lib/i18n";
import { PREVIEW_MESSAGE } from "@/lib/previewGuard";
import { useLeave } from "@/lib/usePresence";
import { useScrollLock } from "@/lib/useScrollLock";

/**
 * The quick review after a trip (Peter, 2026-10-22: under a minute; 2026-10-23: four questions
 * at most, only stars and choices, no typing): stars, did it match the description, did the
 * plan's times hold, was it crowded. A centred sheet over the page. Also the way to change a rating.
 */
export function ReviewSheet({ slug, name, onDone }: { slug: string; name: string; onDone: (sent: boolean) => void }) {
  // A trip rated before opens with its old answers (Peter, 26 Nov 2026): a second rating replaces the first.
  const [answers, setAnswers] = useState<ReviewAnswers>(() => keptReview(slug));
  // What was sent before, if anything. Then the window shows a rating that exists (Peter, 26 Nov 2026: "you already
  // have sent it"): it closes with "Zavrieť", and "Uložiť" is there only once something was changed.
  const [before] = useState(answers);
  const sentBefore = before.stars > 0;
  const changed = answers.stars !== before.stars || answers.fit !== before.fit || answers.crowded !== before.crowded || answers.timing !== before.timing;
  const [state, setState] = useState<"idle" | "sending" | "error" | "preview">("idle");
  const tx = useT();
  // Fades and scales away before the parent removes it (Peter, 17 Nov).
  const { state: motion, leave } = useLeave();
  useScrollLock();

  async function send() {
    setState("sending");
    const r = await sendReview(slug, answers);
    if (r === "ok") leave(() => onDone(true));
    else setState(r);
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={tx("Hodnotenie: {name}", { name })} className="fixed inset-0 z-50 grid place-items-center p-4">
      <div data-state={motion} className="pres pres-backdrop absolute inset-0 touch-none bg-black/45" />
      <div data-state={motion} className="pres pres-pop relative flex max-h-[calc(100dvh-2rem)] w-full max-w-[420px] flex-col gap-4 overflow-y-auto overscroll-contain rounded-[var(--radius-card)] bg-[var(--card-bg)] p-5 shadow-[var(--shadow-float)]">
        <div>
          <h2 className="text-lg font-extrabold">{tx(sentBefore ? "Vaše hodnotenie" : "Aký bol výlet?")}</h2>
          <p className="text-sm text-[var(--muted)]">{name} · {tx(sentBefore ? "môžete ho zmeniť" : "zaberie to pár sekúnd")}</p>
        </div>
        <ReviewFields value={answers} onChange={setAnswers} detail />
        {/* More than the quick choices (C2): an idea for us, or something wrong on this trip. */}
        <p className="text-[13px] text-[var(--muted)]">
          {tx("Chcete nám napísať viac?")}{" "}
          <LangLink href={`/napiste-nam?vylet=${slug}&nazov=${encodeURIComponent(name)}`} className="font-semibold text-[var(--accent)] underline">
            {tx("Napíšte nám")}
          </LangLink>{" "}
          ·{" "}
          <LangLink href={`/nahlasit-chybu?vylet=${slug}&nazov=${encodeURIComponent(name)}`} className="font-semibold text-[var(--accent)] underline">
            {tx("Nahlásiť chybu")}
          </LangLink>
        </p>
        {state === "preview" && <p className="text-sm text-[var(--muted)]">{tx(PREVIEW_MESSAGE)}</p>}
        {state === "error" && <p className="flex items-start gap-1.5 text-sm text-[var(--danger)]"><UiIcon name="warn" size={15} className="mt-0.5" /><span>{tx("Nepodarilo sa odoslať. Skúste to o chvíľu.")}</span></p>}
        <div className="flex justify-between gap-2">
          <button type="button" onClick={() => leave(() => onDone(false))} className="rounded-full border border-[var(--border)] px-4 py-2.5 text-sm font-semibold">
            {tx(sentBefore ? "Zavrieť" : "Teraz nie")}
          </button>
          <button
            type="button"
            disabled={answers.stars === 0 || state === "sending" || (sentBefore && !changed)}
            onClick={send}
            className="rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-bold text-[var(--accent-contrast)] disabled:opacity-40"
          >
            {state === "sending" ? tx("Odosielam…") : tx(sentBefore ? "Uložiť zmenu" : "Odoslať")}
          </button>
        </div>
      </div>
    </div>
  );
}
