/** True when the visitor asked for less motion. Read when it is needed, so a change in settings is picked up. */
export const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** For scrollTo / scrollIntoView: scrolls glide, except with reduced motion, where they jump (Peter, 17 Nov). */
export const smoothScroll = (): ScrollBehavior => (reducedMotion() ? "auto" : "smooth");
