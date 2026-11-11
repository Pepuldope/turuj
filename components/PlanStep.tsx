"use client";

import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { ComponentProps, ReactNode } from "react";
import { PhoneTripMap } from "@/components/PhoneTripMap";
import { UiIcon } from "@/components/UiIcon";
import { fitOnMap } from "@/lib/mapFocus";
import { hasKeptMap, keptMapKey } from "@/lib/keptMap";
import { pickedAnchor, rememberOpenSteps, stepsKeptFromRoutePick } from "@/lib/planUi";
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
  /** The step was left forward with "Ďalej" (its number shows a tick). */
  isDone: (id: string) => boolean;
}

/** How long a step takes to fold or unfold (the CSS transition on its body uses the same). */
const FOLD_MS = 250;
/** Finished steps, kept across a route pick like the open steps are (a new page, the same plan). */
let keptDone: Record<string, boolean> = {};

const StepsContext = createContext<StepsApi | null>(null);

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The gap kept between what a scroll brings up and the edge above it. */
const SCROLL_GAP = 12;

/**
 * Scrolls `el` to the top of the window, just under the phone's top bar. The bar's real height is read
 * from the page (its safe-area padding for the notch included) and counted as if it were shown: it comes
 * back whenever the page scrolls up, and a gap that is a little too big when it hides is harmless, one
 * too small would leave the card under the bar. Wide screens have no bar over the column.
 */
function scrollUnderBar(el: Element | null | undefined) {
  if (!el) return;
  const behavior: ScrollBehavior = reduced() ? "auto" : "smooth";
  // Wide screens scroll the left column inside its own box (the map stays beside it), with no bar over it.
  let box: HTMLElement | null = el.parentElement;
  while (box && box !== document.body && !(/(auto|scroll)/.test(getComputedStyle(box).overflowY) && box.scrollHeight > box.clientHeight)) box = box.parentElement;
  if (box && box !== document.body) {
    box.scrollTo({ top: box.scrollTop + el.getBoundingClientRect().top - box.getBoundingClientRect().top - SCROLL_GAP, behavior });
    return;
  }
  const phone = window.matchMedia("(max-width: 1023.98px)").matches;
  const bar = phone ? document.querySelector<HTMLElement>("[data-topbar]") : null;
  const top = el.getBoundingClientRect().top + window.scrollY - (bar?.offsetHeight ?? 0) - SCROLL_GAP;
  window.scrollTo({ top: Math.max(0, top), behavior });
}

/**
 * Which steps are open, shared by the steps (they can be far apart in the tree: the route step comes
 * from the server) so "Ďalej" can fold one and open the next. Nothing is remembered across visits.
 */
export function PlanStepsProvider({ steps, resultId, children }: { steps: StepDef[]; resultId: string; children: ReactNode }) {
  // After picking a route (a new page, same plan) the steps stay as they were.
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const kept = stepsKeptFromRoutePick();
    if (!kept) keptDone = {};
    return kept ?? Object.fromEntries(steps.map((s) => [s.id, !!s.open]));
  });
  useEffect(() => rememberOpenSteps(open), [open]);
  const [done, setDone] = useState<Record<string, boolean>>(() => keptDone);
  useEffect(() => {
    keptDone = done;
  }, [done]);
  // The new route's page may be taller or shorter above the plan: put the route step back where it stood in the window,
  // so a pick doesn't move the visitor.
  useLayoutEffect(() => {
    const anchor = pickedAnchor();
    if (anchor === null) return;
    const hold = () => {
      const el = document.getElementById("plan-step-route")?.closest("section");
      if (!el) return;
      const by = el.getBoundingClientRect().top - anchor;
      if (Math.abs(by) < 1) return;
      let box: HTMLElement | null = el.parentElement;
      while (box && box !== document.body && !(/(auto|scroll)/.test(getComputedStyle(box).overflowY) && box.scrollHeight > box.clientHeight)) box = box.parentElement;
      if (box && box !== document.body) box.scrollTop += by;
      else window.scrollBy(0, by);
    };
    hold();
    const later = setTimeout(hold, 400);
    return () => clearTimeout(later);
  }, []);
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
      // Forward ("Ďalej") marks the step left behind as done; "Späť" leaves the ticks as they are.
      if (steps.findIndex((s) => s.id === to) > steps.findIndex((s) => s.id === from)) setDone((d) => ({ ...d, [from]: true }));
      setOpen((o) => ({ ...o, [from]: false, [to]: true }));
    },
    toResult: () => scrollUnderBar(document.getElementById(resultId)),
    isDone: (id) => !!done[id],
  };
  // After the new state is on screen: the next step's header gets the focus, and the view once the
  // step being left has finished folding (scrolling during the fold would land short).
  useEffect(() => {
    const id = pending.current;
    if (!id) return;
    pending.current = null;
    const header = document.getElementById(`plan-step-${id}`);
    header?.focus({ preventScroll: true });
    const scroll = () => scrollUnderBar(header?.closest("section"));
    if (reduced()) return scroll();
    // Two frames after the fold's timer: the folded body is gone from the page by then, so the target's
    // position is final (measured earlier, the card would land too high once the page shrank).
    let frame = 0;
    const later = setTimeout(() => (frame = requestAnimationFrame(() => (frame = requestAnimationFrame(scroll)))), FOLD_MS + 20);
    return () => {
      clearTimeout(later);
      cancelAnimationFrame(frame);
    };
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
  const done = api.isDone(id);
  const t = useT();
  // Peter, 2026-11-11: steps glide open and shut. The body stays in the page while it folds
  // (`mounted`), and `expanded` flips a frame after mounting so the opening is animated too.
  const [mounted, setMounted] = useState(open);
  const [expanded, setExpanded] = useState(open);
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMounted(true);
      const frame = requestAnimationFrame(() => requestAnimationFrame(() => setExpanded(true)));
      return () => cancelAnimationFrame(frame);
    }
    setExpanded(false);
    const later = setTimeout(() => setMounted(false), reduced() ? 0 : FOLD_MS);
    return () => clearTimeout(later);
  }, [open]);
  const bodyId = useId();
  const at = api.steps.findIndex((s) => s.id === id);
  const next = api.steps[at + 1];
  const prev = api.steps[at - 1];
  return (
    <section aria-label={title} className="overflow-hidden rounded-[14px] border-[1.5px] border-[var(--accent)] bg-[var(--card-bg)]">
      <button
        type="button"
        id={`plan-step-${id}`}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => api.toggle(id)}
        className="flex min-h-[56px] w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-[var(--segment-bg)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        {/* Done (left with "Ďalej"): the number becomes a tick on the accent, with a short pop. */}
        <span
          aria-hidden
          className={`font-data grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full text-[15px] font-extrabold transition-colors duration-200 ${
            done ? "step-done bg-[var(--accent)] text-[var(--accent-contrast)]" : "bg-[var(--accent-soft)] text-[var(--accent)]"
          }`}
        >
          {done ? <UiIcon name="check" size={16} /> : n}
        </span>
        {done && <span className="sr-only">{t("hotovo")}</span>}
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
      {mounted && (
        // Height glides with the grid-rows trick (0fr ↔ 1fr), plus a fade; off with reduced motion.
        <div
          className={`grid transition-[grid-template-rows,opacity] duration-[250ms] ease-out motion-reduce:transition-none ${
            expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          }`}
        >
        <div className="min-h-0 overflow-hidden">
        <div id={bodyId} className="flex flex-col gap-2 px-3 pb-2.5">
          {children}
          {/* On to the next choice: the filled accent button (Peter, 2026-11-11), "Späť" stays quiet. */}
          <div className="flex flex-col items-start gap-0.5 pt-0.5">
            <button
              type="button"
              onClick={() => (next ? api.go(id, next.id) : api.toResult())}
              className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[var(--accent)] px-4 py-2 text-[15px] font-bold text-[var(--accent-contrast)] transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              {next ? t("Ďalej: {n}. {title}", { n: next.n, title: next.title }) : t("Hotovo: pozrite si svoj deň")}
              <UiIcon name={next ? "chev" : "down"} size={16} />
            </button>
            {prev && (
              <button
                type="button"
                onClick={() => api.go(id, prev.id)}
                className="min-h-10 cursor-pointer px-1 text-sm font-semibold text-[var(--muted)] underline underline-offset-2 hover:text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              >
                {t("Späť na {n}. krok", { n: prev.n })}
              </button>
            )}
          </div>
        </div>
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
  // A parked map of the page just left is taken over at once, so no placeholder shows in between.
  const [near, setNear] = useState(() => hasKeptMap(keptMapKey(props.placeKey, props.focus)));
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => setNear(entries[entries.length - 1].isIntersecting), { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className="h-[170px] shrink-0 lg:hidden">
      {near ? <PhoneTripMap {...props} compact /> : <div className="h-full rounded-xl border border-[var(--border)] bg-[var(--segment-bg)]" />}
    </div>
  );
}
