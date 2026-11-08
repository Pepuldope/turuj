"use client";

import { UiIcon } from "@/components/UiIcon";
import { useEffect, useId, useState } from "react";
import { FEEDBACK_MAX, PROBLEM_TOPICS } from "@/lib/feedbackLimits";
import type { FeedbackKind, ProblemTopic } from "@/lib/feedbackLimits";
import { LangLink, useLang, useT } from "@/lib/i18n";
import { CONTACT_EMAIL } from "@/lib/site";

const TOPIC_LABEL: Record<ProblemTopic, string> = {
  trasa: "Trasa je zlá alebo uzavretá",
  parkovisko: "Parkovisko alebo zastávka nesedí",
  fotka: "Zlá fotka",
  web: "Niečo na stránke nefunguje",
  ine: "Iné",
};

type State = "idle" | "sending" | "sent" | "error";

/**
 * "Napíšte nám" (an idea or what to improve) and "Nahlásiť chybu" (what is wrong, and on which trip
 * when it came from a trip page: ?vylet=<slug>). Saved in our database; an email only if they want a reply.
 */
export function FeedbackForm({ kind }: { kind: FeedbackKind }) {
  const t = useT();
  const lang = useLang();
  const ids = { text: useId(), email: useId() };
  const [topic, setTopic] = useState<ProblemTopic | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [tripName, setTripName] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");

  // The trip it is about comes in the link (the page itself is prebuilt).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const v = q.get("vylet");
    if (!v || !/^[a-z0-9-]{1,120}$/.test(v)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSlug(v);
    setTripName(q.get("nazov")?.slice(0, 100) || null);
  }, []);

  const ready = text.trim().length >= 3 && (kind === "napad" || topic !== null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || state === "sending") return;
    setState("sending");
    try {
      const r = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, topic, slug, text, email: email.trim() || null, lang }),
      });
      setState(r.ok ? "sent" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "sent") {
    return (
      <div role="status" className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--ok-bg)] p-4 text-[var(--ok)]">
        <strong className="text-base">{t("Ďakujeme, máme to.")}</strong>
        <span>{email.trim() ? t("Odpovieme vám na {email}.", { email: email.trim() }) : t("Prečítame si to čo najskôr.")}</span>
        <LangLink href="/">{t("Späť na výlety")}</LangLink>
      </div>
    );
  }

  return (
    <form onSubmit={send} className="flex flex-col gap-4">
      {slug && (
        <p className="w-fit rounded-lg bg-[var(--accent-soft)] px-3 py-1.5 font-semibold text-[var(--accent)]">
          {t("Výlet: {name}", { name: tripName ?? slug })}
        </p>
      )}
      {kind === "chyba" && (
        <fieldset className="flex flex-col gap-2">
          <legend className="pb-1 font-semibold">{t("Čo nesedí?")}</legend>
          {PROBLEM_TOPICS.map((k) => (
            <label key={k} className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--card-bg)] px-3 py-2.5 has-[:checked]:border-[var(--accent)] has-[:checked]:bg-[var(--accent-soft)]">
              <input type="radio" name="topic" value={k} checked={topic === k} onChange={() => setTopic(k)} className="accent-[var(--accent)]" />
              {t(TOPIC_LABEL[k])}
            </label>
          ))}
        </fieldset>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.text} className="font-semibold">
          {kind === "chyba" ? t("Popíšte, čo je zle") : t("Čo sa vám páči a čo by sme mali zlepšiť?")}
        </label>
        <textarea
          id={ids.text}
          required
          rows={6}
          maxLength={FEEDBACK_MAX}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={kind === "chyba" ? t("Napr. parkovisko je od jari zatvorené, parkuje sa o 300 m nižšie.") : t("Napíšte čokoľvek, aj jednu vetu.")}
          className="rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-3 text-base outline-none focus:border-[var(--accent)]"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.email} className="font-semibold">
          {t("Váš email")} <span className="font-normal text-[var(--muted)]">{t("(nepovinné, len ak chcete odpoveď)")}</span>
        </label>
        <input
          id={ids.email}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-11 rounded-xl border border-[var(--border)] bg-[var(--card-bg)] px-3 text-base outline-none focus:border-[var(--accent)]"
        />
      </div>
      {state === "error" && <p role="alert" className="flex items-start gap-1.5 text-[var(--warn)]"><UiIcon name="warn" size={16} className="mt-0.5" /><span>{t("Správu sa nepodarilo poslať. Skúste to znova o chvíľu.")}</span></p>}
      <button
        type="submit"
        disabled={!ready || state === "sending"}
        className="h-12 rounded-xl bg-[var(--accent)] text-base font-bold text-[var(--accent-contrast)] disabled:opacity-50"
      >
        {state === "sending" ? t("Posielame…") : t("Poslať")}
      </button>
      <p className="text-center text-[var(--muted)]">
        {t("Radšej email?")} <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </p>
    </form>
  );
}
