"use client";

import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { ComponentProps, ReactNode } from "react";
import { PhoneTripMap } from "@/components/PhoneTripMap";
import { UiIcon } from "@/components/UiIcon";
import { fitOnMap } from "@/lib/mapFocus";
import { hasKeptMap, keptMapKey } from "@/lib/keptMap";
import { landAfterRoutePick, noteStepWhileRouteLoads, pickedAnchor, rememberOpenSteps, stepsKeptFromRoutePick } from "@/lib/planUi";
import { markAutoScroll } from "@/lib/motion";
import { setRouteStepOpen } from "@/lib/routeHover";
import type { MapFit } from "@/lib/mapFocus";
import { useT } from "@/lib/i18n";
import { groupPlanWarnings } from "@/lib/planWarnings";
import type { PlanWarning } from "@/lib/planWarnings";

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
  /** Opens `id` (the others stay as they are), brings its header into view under the top bar and moves focus there. */
  openStep: (id: string) => void;
  /** Scrolls to the plan's result: the sun dial, the times and Uložiť. */
  toResult: (from: string) => void;
  /** The step was left forward with "Ďalej" (its number shows a tick). */
  isDone: (id: string) => boolean;
  /** The step opens or folds at once, without its roll (it is off the screen, see `go`). */
  isStill: (id: string) => boolean;
  /** Keeps the step being scrolled to where it stands while a step off the screen changes size (call after layout). */
  holdAnchor: () => void;
}

/** How long a step takes to fold and to unfold (the `.reveal` rules in app/globals.css use the same). */
const FOLD_MS = 220;
/** Finished steps, kept across a route pick like the open steps are (a new page, the same plan). */
let keptDone: Record<string, boolean> = {};

const StepsContext = createContext<StepsApi | null>(null);

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The gap kept between what a scroll brings up and the edge above it. */
const SCROLL_GAP = 12;
/** How long the glide to the next step takes. */
const GLIDE_MS = 650;

/**
 * Scrolls `el` to the top of the window: just under the phone's top bar when the bar is showing (its real height read
 * from the page, safe-area padding for the notch included), at the very top when it is hidden. The page's own glide
 * leaves the bar as it was (lib/motion.ts), so it lines up either way; counted always, the hidden bar left an empty
 * strip over the step (Peter, 18 Nov). Wide screens have no bar over the column.
 */
function scrollUnderBar(el: Element | null | undefined) {
  if (!el) return;
  const behavior: ScrollBehavior = reduced() ? "auto" : "smooth";
  const { box, top } = underBar(el);
  markAutoScroll(behavior === "smooth" ? 900 : 150);
  if (box) box.scrollTo({ top, behavior });
  else window.scrollTo({ top, behavior });
}

/** What to scroll (a wide screen's column box, or the window when null) and to where, to bring `el` under the bar. */
function underBar(el: Element): { box: HTMLElement | null; top: number } {
  // Wide screens scroll the left column inside its own box (the map stays beside it), with no bar over it.
  let box: HTMLElement | null = el.parentElement;
  while (box && box !== document.body && !(/(auto|scroll)/.test(getComputedStyle(box).overflowY) && box.scrollHeight > box.clientHeight)) box = box.parentElement;
  if (box && box !== document.body) return { box, top: box.scrollTop + el.getBoundingClientRect().top - box.getBoundingClientRect().top - SCROLL_GAP };
  const phone = window.matchMedia("(max-width: 1023.98px)").matches;
  // TopBar sets data-dock: "out" while the bar is slid away.
  const bar = phone && document.documentElement.dataset.dock !== "out" ? document.querySelector<HTMLElement>("[data-topbar]") : null;
  return { box: null, top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - (bar?.offsetHeight ?? 0) - SCROLL_GAP) };
}

/**
 * Glides to `el` like scrollUnderBar, but follows it: the place it ends at is measured again on every
 * frame, minus the fold still to come. "Ďalej" folds the step above while it scrolls, so a target measured
 * once (before or after the fold) is a stale one and the glide overshoots or lands short. It keeps holding the spot until the fold
 * has finished (`holdMs`), and gives way at once to a finger, wheel or key. Returns the stop function.
 */
function glideUnderBar(el: Element, holdMs: number, folding: Element | null, onFrame?: (done: boolean) => void): () => void {
  // The step left behind is above `el` and is still folding away: where `el` will stand is where it stands
  // now minus what is left of that step's body (the body is the section's second child, gone once folded).
  const toFold = () => (folding?.children[1]?.getBoundingClientRect().height ?? 0);
  const where = () => {
    const u = underBar(el);
    return { box: u.box, top: Math.max(0, u.top - toFold()) };
  };
  const start = where();
  const from = start.box ? start.box.scrollTop : window.scrollY;
  // Glides the distance left to the target, not between two fixed spots: a step folding off the screen moves the
  // target and the scroll together (holdAnchor), and the glide must not jump with it.
  const dist0 = start.top - from;
  // Slow, and slower the further it goes (Peter, 17 Nov: "scroll slowly to the next card"): 0.5-0.9 s.
  const ms = Math.min(GLIDE_MS + 300, Math.max(GLIDE_MS - 150, GLIDE_MS - 250 + Math.abs(dist0) * 0.4));
  // Time on the glide's own clock: a frame that comes late (a map starting up) advances it one frame, not the whole
  // delay, so the glide carries on from where it was instead of jumping ahead.
  let clock = 0;
  let last = performance.now();
  const t0 = performance.now();
  let frame = 0;
  const stop = () => {
    cancelAnimationFrame(frame);
    for (const ev of ["wheel", "touchstart", "keydown", "mousedown"]) window.removeEventListener(ev, stop);
  };
  for (const ev of ["wheel", "touchstart", "keydown", "mousedown"]) window.addEventListener(ev, stop, { passive: true });
  const step = (now: number) => {
    const { box, top } = where();
    clock += Math.min(now - last, 34);
    last = now;
    const p = Math.min(1, clock / ms);
    // Slow at both ends: a hard start on top of the fold moving under it read as a jerk (Peter, 17 Nov).
    const eased = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    const at = top - dist0 * (1 - eased);
    markAutoScroll();
    if (box) box.scrollTo({ top: at, behavior: "instant" });
    else window.scrollTo({ top: at, behavior: "instant" });
    const more = clock < ms || now - t0 < holdMs;
    onFrame?.(!more);
    if (more) frame = requestAnimationFrame(step);
    else stop();
  };
  frame = requestAnimationFrame(step);
  return stop;
}

/**
 * Which steps are open, shared by the steps (they can be far apart in the tree: the route step comes
 * from the server) so "Ďalej" can fold one and open the next. Nothing is remembered across visits.
 */
export function PlanStepsProvider({ steps, resultId, children }: { steps: StepDef[]; resultId: string; children: ReactNode }) {
  // A step the visitor headed to after picking a route, while the route's page was still on its way (lib/planUi.ts).
  const [landing] = useState(landAfterRoutePick);
  // After picking a route (a new page, same plan) the steps stay as they were.
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const kept = stepsKeptFromRoutePick();
    if (!kept) keptDone = {};
    const o = kept ?? Object.fromEntries(steps.map((s) => [s.id, !!s.open]));
    return landing ? { ...o, [landing.from]: landing.from === landing.to, [landing.to]: true } : o;
  });
  useEffect(() => rememberOpenSteps(open), [open]);
  // The big map lights up other routes only while step 1 is open (C186), however it was shut.
  const hasRouteStep = steps.some((s) => s.id === "route");
  useEffect(() => setRouteStepOpen(hasRouteStep ? !!open.route : null), [hasRouteStep, open.route]);
  useEffect(() => () => setRouteStepOpen(null), []);
  const [done, setDone] = useState<Record<string, boolean>>(() => keptDone);
  useEffect(() => {
    keptDone = done;
  }, [done]);
  // The new route's page may be taller or shorter above the plan: put the route step back where it stood in the window,
  // so a pick doesn't move the visitor.
  // Not when the visitor already went on to another step: the glide below takes them there instead.
  useLayoutEffect(() => {
    const anchor = landing ? null : pickedAnchor();
    if (anchor === null) return;
    const hold = () => {
      const el = document.getElementById("plan-step-route")?.closest("section");
      if (!el) return;
      const by = el.getBoundingClientRect().top - anchor;
      if (Math.abs(by) < 1) return;
      let box: HTMLElement | null = el.parentElement;
      while (box && box !== document.body && !(/(auto|scroll)/.test(getComputedStyle(box).overflowY) && box.scrollHeight > box.clientHeight)) box = box.parentElement;
      markAutoScroll();
      if (box && box !== document.body) box.scrollTop += by;
      else window.scrollBy(0, by);
    };
    hold();
    const later = setTimeout(hold, 400);
    return () => clearTimeout(later);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Landing after a route pick, the first run of the effect below glides on to the step the visitor headed to.
  const pending = useRef<{ to: string; from: string; forward: boolean } | null>(landing ? { to: landing.to, from: landing.to, forward: false } : null);
  // Steps that open or fold without their roll, because they do it off the screen (Peter, 17 Nov).
  const [still, setStill] = useState<Record<string, boolean>>({});
  // The step header to keep in place while a step off the screen changes size, until `until`.
  const anchor = useRef<{ el: Element; top: number; until: number } | null>(null);
  const anchorEl = (el: Element | null | undefined) => {
    if (el) anchor.current = { el, top: el.getBoundingClientRect().top, until: performance.now() + 600 };
  };
  const anchorOn = (id: string) => {
    const el = document.getElementById(`plan-step-${id}`)?.closest("section");
    if (el) anchor.current = { el, top: el.getBoundingClientRect().top, until: performance.now() + 600 };
  };
  // The glide moves the page on purpose: after each of its frames the held step's spot is measured again, so a hold
  // only undoes what changed in size since that frame. Measured once at the click, a hold that came late (the step
  // left behind folding as the glide ends, within the 600 ms) pulled the page back onto the step being left,
  // and "Späť" ended there with the step asked for open off the screen above (Peter, 18 Nov).
  const rebaseAnchor = () => {
    const a = anchor.current;
    if (a) a.top = a.el.getBoundingClientRect().top;
  };
  // The visitor's own wheel, finger or key takes over: nothing is held after that.
  useEffect(() => {
    const drop = () => (anchor.current = null);
    const evs = ["wheel", "touchstart", "keydown", "mousedown"];
    for (const ev of evs) window.addEventListener(ev, drop, { passive: true, capture: true });
    return () => {
      for (const ev of evs) window.removeEventListener(ev, drop, { capture: true });
    };
  }, []);
  const holdAnchor = () => {
    const a = anchor.current;
    if (!a || performance.now() > a.until) return;
    const by = a.el.getBoundingClientRect().top - a.top;
    if (Math.abs(by) < 0.5) return;
    const { box } = underBar(a.el);
    markAutoScroll();
    if (box) box.scrollTop += by;
    else window.scrollBy({ top: by, behavior: "instant" });
  };
  // The running glide, kept here (not as an effect cleanup) so the next step opening a beat later doesn't cancel it.
  const glide = useRef<(() => void) | null>(null);
  useEffect(() => () => glide.current?.(), []);
  const fitFor = (id: string) => steps.find((s) => s.id === id)?.fit;
  const api: StepsApi = {
    steps,
    isOpen: (id) => !!open[id],
    toggle: (id) => {
      if (!open[id]) {
        const fit = fitFor(id);
        if (fit) fitOnMap(fit);
      }
      setStill((x) => ({ ...x, [id]: false }));
      setOpen((o) => ({ ...o, [id]: !o[id] }));
    },
    // Peter, 17 Nov: folding one step and unfolding the next while the page scrolls made people a bit seasick. Now the
    // next step opens and the page glides slowly to it; the step left behind folds only once it is off the screen,
    // at once and with the scroll held (holdAnchor), so nothing moves in view but the glide itself.
    go: (from, to) => {
      const forward = steps.findIndex((s) => s.id === to) > steps.findIndex((s) => s.id === from);
      noteStepWhileRouteLoads(from, to);
      pending.current = { to, from, forward };
      const fit = fitFor(to);
      if (fit) fitOnMap(fit);
      // Forward ("Ďalej") marks the step left behind as done; "Späť" leaves the ticks as they are.
      if (forward) setDone((d) => ({ ...d, [from]: true }));
      if (reduced()) {
        setOpen((o) => ({ ...o, [from]: false, [to]: true }));
        return;
      }
      if (forward) {
        // Below the view: it rolls out as the page comes down to it.
        setStill((x) => ({ ...x, [to]: false }));
      } else {
        // Its header off the screen above: it opens at once, with the step in view held where it is, then the page
        // glides up. Its header on the screen (the visitor scrolled up a bit): it rolls open where it is, nothing held;
        // holding the step below then pushed the page down and back up (Peter, 17 Nov).
        const head = document.getElementById(`plan-step-${to}`);
        const box = head ? underBar(head).box : null;
        const above = !!head && head.getBoundingClientRect().bottom < (box ? box.getBoundingClientRect().top : 0);
        if (above) anchorOn(from);
        setStill((x) => ({ ...x, [to]: above }));
      }
      setOpen((o) => ({ ...o, [to]: true }));
    },
    openStep: (id) => {
      noteStepWhileRouteLoads(id, id);
      pending.current = { to: id, from: id, forward: false };
      const fit = fitFor(id);
      if (fit) fitOnMap(fit);
      // A new object even when it is open already, so the effect below runs and brings it into view.
      setStill((x) => ({ ...x, [id]: false }));
      setOpen((o) => ({ ...o, [id]: true }));
    },
    // "Hotovo": the last step is ticked like "Ďalej" does for the others (Peter, 17 Nov) and the view glides to the day.
    // Like "Ďalej", the step folds only once it has left the screen above, at once and with the day held where it is.
    // Folded first, it pulled everything under it (the day too) up past the top in a quarter second, and the scroll then
    // came back up for it: "scrolls down rapidly and then back up" (Peter, 18 Nov).
    toResult: (from) => {
      setDone((d) => ({ ...d, [from]: true }));
      const result = document.getElementById(resultId);
      const left = document.getElementById(`plan-step-${from}`)?.closest("section");
      glide.current?.();
      if (!result || !left) {
        setOpen((o) => ({ ...o, [from]: false }));
        return;
      }
      // Reduced motion: a jump to the day, then the fold with the day held. Folded first, the jump was measured with the
      // step still open and the fold then pushed the day off the top (found 18 Nov).
      if (reduced()) {
        scrollUnderBar(result);
        anchorEl(result);
        setStill((x) => ({ ...x, [from]: true }));
        setOpen((o) => ({ ...o, [from]: false }));
        return;
      }
      let folded = false;
      glide.current = glideUnderBar(result, 0, null, (end) => {
        rebaseAnchor();
        if (folded) return;
        const { box } = underBar(left);
        const off = left.getBoundingClientRect().bottom <= (box ? box.getBoundingClientRect().top : 0);
        if (!off && !end) return;
        folded = true;
        anchorEl(result);
        setStill((x) => ({ ...x, [from]: true }));
        setOpen((o) => ({ ...o, [from]: false }));
      });
    },
    isDone: (id) => !!done[id],
    isStill: (id) => !!still[id],
    holdAnchor,
  };
  // After the new state is on screen: the next step's header gets the focus and the view glides to it.
  useEffect(() => {
    const go = pending.current;
    if (!go) return;
    pending.current = null;
    const id = go.to;
    const header = document.getElementById(`plan-step-${id}`);
    header?.focus({ preventScroll: true });
    const section = header?.closest("section");
    if (!section) return;
    glide.current?.();
    if (reduced()) return scrollUnderBar(section);
    // Opened from the warnings recap: only the glide.
    if (go.from === go.to) {
      glide.current = glideUnderBar(section, 0, null, rebaseAnchor);
      return;
    }
    // The step left behind folds once it has left the screen: above it going forward, below it going back.
    const left = document.getElementById(`plan-step-${go.from}`)?.closest("section");
    let folded = false;
    // `quiet`: off the screen, at once with the step in view held. Otherwise it rolls shut as usual.
    const foldLeft = (quiet: boolean) => {
      folded = true;
      if (quiet) anchorOn(id);
      setStill((x) => ({ ...x, [go.from]: quiet }));
      setOpen((o) => ({ ...o, [go.from]: false }));
    };
    const begin = () => {
      // Going back, the step being left was held while the step above opened; that is done by now, and it must not
      // be held while the page glides away from it.
      if (!go.forward) anchor.current = null;
      glide.current = glideUnderBar(section, 0, null, onFrame);
    };
    const onFrame = (done: boolean) => {
      rebaseAnchor();
      if (folded || !left) return;
      const r = left.getBoundingClientRect();
      const { box } = underBar(left);
      const top = box ? box.getBoundingClientRect().top : 0;
      const bottom = box ? box.getBoundingClientRect().bottom : window.innerHeight;
      const off = go.forward ? r.bottom <= top : r.top >= bottom;
      if (off) foldLeft(true);
      // Still in view when the glide ends. Going back it is below the step arrived at, so its roll moves nothing above
      // it: it rolls shut where you can see it (Peter, 17 Nov: on a wide screen it snapped shut in view). Going
      // forward (a short page) it is above, and folds at once with the step in view held.
      else if (done) foldLeft(go.forward);
    };
    if (go.forward) return void begin();
    // Going back, the step above opens first (held in place, holdAnchor): the glide measures its way after that, two
    // frames on, or it starts from a stale spot and the view flicks back for a frame.
    let f2 = 0;
    const f1 = requestAnimationFrame(() => (f2 = requestAnimationFrame(begin)));
    glide.current = () => {
      cancelAnimationFrame(f1);
      cancelAnimationFrame(f2);
    };
  }, [open]);
  return <StepsContext.Provider value={api}>{children}</StepsContext.Provider>;
}

/**
 * The recap of the warnings the steps show, repeated where the plan is read through (people miss them while
 * setting the steps up): one row each with its sign and "Upraviť v kroku n", which opens that step. Nothing at all
 * when there is no warning (no known problem is not good news).
 */
export function PlanWarningsRecap({ warnings }: { warnings: PlanWarning[] }) {
  const api = useContext(StepsContext)!;
  const t = useT();
  if (warnings.length === 0) return null;
  const groups = groupPlanWarnings(warnings, Object.fromEntries(api.steps.map((s) => [s.id, s.n])));
  return (
    <section aria-label={t("Pred odchodom skontrolujte")} className="flex flex-col gap-2">
      <h3 className="text-base font-bold">{t("Pred odchodom skontrolujte")}</h3>
      <ul className="flex flex-col gap-2">
        {groups.map((g) => {
          const step = api.steps.find((s) => s.id === g.step);
          const red = g.tone === "danger";
          return (
            <li
              key={g.step}
              className={`flex flex-col gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold ${red ? "bg-[var(--danger-bg)] text-[var(--danger)]" : "bg-[var(--warn-bg)] text-[var(--warn)]"}`}
            >
              <span className="flex items-start gap-1.5">
                <UiIcon name="warn" size={16} className="mt-0.5 shrink-0" />
                <span className="flex flex-col gap-1">
                  {step && <span className="font-bold">{t("V kroku {n} skontrolujte:", { n: String(step.n) })}</span>}
                  {g.warnings.map((w) => (
                    <span key={w.key}>{w.text}</span>
                  ))}
                </span>
              </span>
              {step && (
                <button
                  type="button"
                  onClick={() => api.openStep(g.step)}
                  className="min-h-10 w-fit cursor-pointer self-start rounded-full bg-[var(--accent)] px-4 text-sm font-bold text-[var(--accent-contrast)] transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                >
                  {t("Upraviť v kroku {n}", { n: String(step.n) })}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
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
  // Reduced motion: opened in the same frame (waiting two frames showed an empty gap, a blink) and faded in instead of
  // rolled out (`data-fade`, app/globals.css), never on the first state (Peter, 17 Nov).
  const [fade, setFade] = useState(false);
  const firstRun = useRef(true);
  // Opening or folding off the screen ("Ďalej", "Späť"): at once, no roll.
  const still = api.isStill(id);
  useEffect(() => {
    const first = firstRun.current;
    firstRun.current = false;
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMounted(true);
      if (reduced() || still) {
        if (!first && !still) setFade(true);
        setExpanded(true);
        return;
      }
      const frame = requestAnimationFrame(() => requestAnimationFrame(() => setExpanded(true)));
      return () => cancelAnimationFrame(frame);
    }
    setExpanded(false);
    const later = setTimeout(() => setMounted(false), reduced() || still ? 0 : FOLD_MS);
    return () => clearTimeout(later);
    // `still` is read as it is when `open` changes; it doesn't start anything by itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  // A step changing size off the screen keeps the step being scrolled to in place, before the frame is drawn.
  useLayoutEffect(() => api.holdAnchor(), [api, open, expanded, mounted]);
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
          <span className={`flex min-w-0 items-start gap-1.5 text-[13.5px] leading-snug font-semibold ${warn ? "text-[var(--warn)]" : "text-[var(--muted)]"}`}>
            {warn && <UiIcon name="warn" size={14} className="mt-0.5 shrink-0" />}
            <FadeOnToggle on={open} className="line-clamp-2 min-w-0">{summary}</FadeOnToggle>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-0.5 text-[13.5px] font-bold text-[var(--accent)]">
          <FadeOnToggle on={open}>{open ? t("Hotovo") : t("Zmeniť")}</FadeOnToggle>
          <span className={`transition-transform ${open ? "rotate-180" : ""}`}>
            <UiIcon name="down" size={16} />
          </span>
        </span>
      </button>
      {mounted && (
        // Rolls out like Reveal: the height glides (grid rows 0fr to 1fr), the content fades in a beat after it starts.
        // Off with reduced motion (the `.reveal` rules in app/globals.css).
        <div className="reveal" data-open={expanded} data-fade={fade || undefined} data-still={still || undefined}>
        <div className="reveal-clip">
        <div className="reveal-body">
        <div id={bodyId} className="flex flex-col gap-2 px-3 pb-2.5">
          {children}
          {/* On to the next choice: the filled accent button (Peter, 2026-11-11), "Späť" stays quiet. */}
          <div className="flex flex-col items-start gap-0.5 pt-0.5">
            <button
              type="button"
              onClick={() => (next ? api.go(id, next.id) : api.toResult(id))}
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
        </div>
      )}
    </section>
  );
}

/**
 * Fades its text in when the step opens or closes and the text is not the same any more (the summary line,
 * the "Hotovo" / "Zmeniť" label): they used to swap in one frame. Not on every change of the text: the summary
 * follows the slider while it is dragged, and that should not flicker. A fade only, so it stays on with reduced motion too.
 */
function FadeOnToggle({ on, className, children }: { on: boolean; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const last = useRef<{ on: boolean; text: string | null }>({ on, text: null });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const text = el.textContent;
    if (last.current.text !== null && last.current.on !== on && last.current.text !== text) {
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "ease-out" });
    }
    last.current = { on, text };
  });
  return (
    <span ref={ref} className={className}>
      {children}
    </span>
  );
}

/** A fact that is not a choice (a trip with a single route): title and plain text, no frame, no Zmeniť. */
export function StepInfo({ title, children, extra }: { title: string; children: ReactNode; /** More content under the line (the kids switch of a one-route trip). */ extra?: ReactNode }) {
  return (
    <div className="flex flex-col px-1">
      <span className="text-[17px] leading-tight font-bold">{title}</span>
      <span className="text-[13.5px] leading-snug font-semibold text-[var(--muted)]">{children}</span>
      {extra && <div className="pt-2.5">{extra}</div>}
    </div>
  );
}

/**
 * The map of one step, on phones only (the big map beside the page does it on wide screens). It is
 * mounted only while near the screen, so a page with three open steps never holds more than a
 * couple of MapLibre maps; the fixed height keeps the page from jumping meanwhile.
 */
export function StepMap({ always = false, joined = false, ...props }: Omit<ComponentProps<typeof PhoneTripMap>, "compact" | "joined"> & { always?: boolean; /** The map is the top of a joined block: no border or rounding of its own. */ joined?: boolean }) {
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
  // On wide screens the day map is a picture only: the big map beside the plan is the one to use, this one just shows
  // your day and the dial's walker (Peter, 17 Nov). `inert`: no clicks, drags, zoom or focus; the wheel scrolls the page.
  const [wide, setWide] = useState(false);
  useEffect(() => {
    if (!always) return;
    const mq = window.matchMedia("(min-width: 64rem)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [always]);
  return (
    // `always`: the day map under Priebeh dňa is shown on wide screens too (static there, above), a little taller.
    <div ref={ref} inert={always && wide} className={always ? "day-map-static h-[200px] shrink-0" : "h-[170px] shrink-0 lg:hidden"}>
      {near ? <PhoneTripMap {...props} compact joined={joined} /> : <div className={`h-full bg-[var(--segment-bg)] ${joined ? "" : "rounded-xl border border-[var(--border)]"}`} />}
    </div>
  );
}
