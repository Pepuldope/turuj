/** True when the visitor asked for less motion. Read when it is needed, so a change in settings is picked up. */
export const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** For scrollTo / scrollIntoView: scrolls glide, except with reduced motion, where they jump (Peter, 17 Nov). */
export const smoothScroll = (): ScrollBehavior => (reducedMotion() ? "auto" : "smooth");

/**
 * The page scrolling itself (a step's glide, a step held in place while another folds), not the visitor. The phone's
 * top bar reads scrolling right after a finger drag as the visitor's own and hid or showed itself under a glide, and
 * the page around it moved with it (Peter, 18 Nov). Each automatic scroll marks a short window; the scroll event it
 * fires comes within a frame or two.
 */
let autoUntil = 0;
export const markAutoScroll = (ms = 150) => {
  autoUntil = Math.max(autoUntil, performance.now() + ms);
};
export const autoScrolling = () => performance.now() < autoUntil;
