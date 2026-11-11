"use client";

import { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import type { ComponentProps, ReactNode } from "react";
import { PhoneTripMap } from "@/components/PhoneTripMap";
import { UiIcon } from "@/components/UiIcon";
import { fitOnMap } from "@/lib/mapFocus";
import type { MapFit } from "@/lib/mapFocus";
import { useT } from "@/lib/i18n";

/** One step as the provider knows it. */
export interface StepDef {
  id: string;
  /** The number shown on the badge. */
  n: number;
  title: string;
  /** Starts open. */
  open?: boolean;
  /** What the big map frames when the step is opened (wide screens). */
  fit?: MapFit;
}

interface StepsApi {
  steps: StepDef[];
  isOpen: (id: string) => boolean;
  toggle: (id: string) => void;
  /** Folds `from`, opens `to` and brings its header into view (focus moves there too). */
  go: (from: string, to: string) => void;
  /** Scrolls to the plan's result: the sun dial, the times and Uložiť. */
  toResult: () => void;
}

const StepsContext = createContext<StepsApi | null>(null);

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Which steps are open, shared by the steps (they can be far apart in the tree: the route step comes
 * from the server) so "Ďalej" can fold one and open the next. Nothing is remembered across visits.
 */
export function PlanStepsProvider({ steps, resultId, children }: { steps: StepDef[]; resultId: string; children: ReactNode }) {
  const [open, setOpen] = useState<Record<string, boolean>>(() => Object.fromEntries(steps.map((s) => [s.id, !!s.open])));
  const pending = useRef<string | null>(null);
  const fitFor = (id: string) => steps.find((s) => s.id === id)?.fit;
  const api: StepsApi = {
    steps,
    isOpen: (id) => !!open[id],
    toggle: (id) => {
      if (!open[id]) {
        const fit = fitFor(id);
        if (fit) fitOnMap(fit);
      }
      setOpen((o) => ({ ...o, [id]: !o[id] }));
    },
    go: (from, to) => {
      pending.current = to;
      const fit = fitFor(to);
      if (fit) fitOnMap(fit);
      setOpen((o) => ({ ...o, [from]: false, [to]: true }));
    },
    toResult: () => document.getElementById(resultId)?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" }),
  };
  // After the new state is on screen: the next step's header gets the focus and the view.
  useEffect(() => {
    const id = pending.current;
    if (!id) return;
    pending.current = null;
    const header = document.getElementById(`plan-step-${id}`);
    header?.focus({ preventScroll: true });
    header?.closest("section")?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });
  }, [open]);
  return <StepsContext.Provider value={api}>{children}</StepsContext.Provider>;
}

/**
 * One choice of the trip plan: a blue frame with its number, its title, the pick so far and "Zmeniť".
 * Folds open on a tap of the header; several can be open together. Only a choice gets this look:
 * what is not a choice (`StepInfo`) is plain grey text with no frame. The title is the big line; the
 * pick under it is quiet.
 */
export function PlanStep({
  id,
  n,
  title,
  summary,
  warn = false,
  children,
}: {
  id: string;
  n: number;
  title: string;
  /** The current pick, shown on one line. */
  summary: ReactNode;
  /** The pick has a problem (too late a start): the summary carries the warning sign. */
  warn?: boolean;
  children: ReactNode;
}) {
  const api = useContext(StepsContext)!;
  const open = api.isOpen(id);
  const t = useT();
  const bodyId = useId();
  const at = api.steps.findIndex((s) => s.id === id);
  const next = api.steps[at + 1];
  const prev = api.steps[at - 1];
  return (
    <section aria-label={title} className="scroll-mt-3 overflow-hidden rounded-[14px] border-[1.5px] border-[var(--accent)] bg-[var(--card-bg)]">
      <button
        type="button"
        id={`plan-step-${id}`}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => api.toggle(id)}
        className="flex min-h-[56px] w-full items-center gap-2.5 px-3 py-2.5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        <span aria-hidden className="font-data grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] text-[15px] font-extrabold text-[var(--accent)]">
          {n}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[17px] leading-tight font-bold">{title}</span>
          <span className={`flex min-w-0 items-center gap-1.5 text-[13.5px] leading-snug font-semibold ${warn ? "text-[var(--warn)]" : "text-[var(--muted)]"}`}>
            {warn && <UiIcon name="warn" size={14} className="shrink-0" />}
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
          {/* On to the next choice: a secondary button (Uložiť výlet stays the only primary one). */}
          <div className="flex flex-col items-start gap-1 border-t border-[var(--border)] pt-3">
            <button
              type="button"
              onClick={() => (next ? api.go(id, next.id) : api.toResult())}
              className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-[var(--accent)] bg-[var(--card-bg)] px-4 py-2 text-[15px] font-bold text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              {next ? t("Ďalej: {n}. {title}", { n: next.n, title: next.title }) : t("Hotovo: pozrite si svoj deň")}
              <UiIcon name={next ? "chev" : "down"} size={16} />
            </button>
            {prev && (
              <button
                type="button"
                onClick={() => api.go(id, prev.id)}
                className="min-h-10 px-1 text-sm font-semibold text-[var(--muted)] underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              >
                {t("Späť na {n}. krok", { n: prev.n })}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/** A fact that is not a choice (a trip with a single route): title and plain text, no frame, no Zmeniť. */
export function StepInfo({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col px-1">
      <span className="text-[17px] leading-tight font-bold">{title}</span>
      <span className="text-[13.5px] leading-snug font-semibold text-[var(--muted)]">{children}</span>
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
