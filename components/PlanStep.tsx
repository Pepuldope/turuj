"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ComponentProps, ReactNode } from "react";
import { PhoneTripMap } from "@/components/PhoneTripMap";
import { UiIcon } from "@/components/UiIcon";
import { useT } from "@/lib/i18n";

/**
 * One choice of the trip plan: a blue frame with its number, the pick so far and "Zmeniť".
 * Folds open on a tap of the header; several can be open together. Only a choice gets this look:
 * what is not a choice (`StepInfo`) is plain grey label and text.
 */
export function PlanStep({
  n,
  title,
  summary,
  defaultOpen = false,
  onOpen,
  warn = false,
  children,
}: {
  n: number;
  title: string;
  /** The current pick, shown on one line. */
  summary: ReactNode;
  defaultOpen?: boolean;
  /** Called when the step is opened (the big map frames this step's choice). */
  onOpen?: () => void;
  /** The pick has a problem (too late a start): the summary carries the warning sign. */
  warn?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const t = useT();
  const bodyId = useId();
  return (
    <section aria-label={title} className="overflow-hidden rounded-[14px] border-[1.5px] border-[var(--accent)] bg-[var(--card-bg)]">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => {
          if (!open) onOpen?.();
          setOpen(!open);
        }}
        className="flex min-h-[52px] w-full items-center gap-2.5 px-3 py-2.5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        <span aria-hidden className="font-data grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] text-[15px] font-extrabold text-[var(--accent)]">
          {n}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[12.5px] leading-tight font-semibold text-[var(--muted)]">{title}</span>
          <span className={`flex min-w-0 items-center gap-1.5 text-[15px] leading-snug font-bold ${warn ? "text-[var(--warn)]" : ""}`}>
            {warn && <UiIcon name="warn" size={15} className="shrink-0" />}
            <span className="min-w-0 truncate">{summary}</span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-0.5 text-[13.5px] font-bold text-[var(--accent)]">
          {open ? t("Hotovo") : t("Zmeniť")}
          <span className={`transition-transform ${open ? "rotate-180" : ""}`}>
            <UiIcon name="down" size={16} />
          </span>
        </span>
      </button>
      {open && (
        <div id={bodyId} className="flex flex-col gap-3 px-3 pb-3">
          {children}
        </div>
      )}
    </section>
  );
}

/** A fact that is not a choice (a trip with a single route): grey label, plain text, no frame. */
export function StepInfo({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col px-1">
      <span className="text-[12.5px] font-semibold text-[var(--muted)]">{title}</span>
      <span className="text-[15px] font-bold">{children}</span>
    </div>
  );
}

/**
 * The map of one step, on phones only (the big map beside the page does it on wide screens). It is
 * mounted only while near the screen, so a page with three open steps never holds more than a
 * couple of MapLibre maps; the fixed height keeps the page from jumping meanwhile.
 */
export function StepMap(props: Omit<ComponentProps<typeof PhoneTripMap>, "compact">) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => setNear(entries[entries.length - 1].isIntersecting), { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className="h-[220px] shrink-0 lg:hidden">
      {near ? <PhoneTripMap {...props} compact /> : <div className="h-full rounded-xl border border-[var(--border)] bg-[var(--segment-bg)]" />}
    </div>
  );
}
