/**
 * The compact map credits start as the little "i" and open only on a tap; the credit stays one tap away.
 * MapLibre opens the box by itself at first and again whenever new map data brings its credits (tiles
 * arriving), so a watcher folds it back each time, until the visitor taps the "i" themselves.
 * Used by the trip maps (it covered pins and popups on the small step maps) and the home map (Peter, 15 Nov, C169).
 */
export function foldAttribution(container: HTMLElement, map: { once: (type: "remove", fn: () => void) => unknown }): void {
  const attrib = container.querySelector(".maplibregl-ctrl-attrib");
  if (!attrib) return;
  let tapped = false;
  const close = () => {
    if (tapped) return;
    // Only touch what is actually set: classList.remove rewrites the class attribute even when the class
    // isn't there, which would wake the watcher below again and loop forever (it froze the page).
    if (attrib.classList.contains("maplibregl-compact-show")) attrib.classList.remove("maplibregl-compact-show");
    if (attrib.hasAttribute("open")) attrib.removeAttribute("open");
  };
  attrib.querySelector(".maplibregl-ctrl-attrib-button")?.addEventListener("click", () => {
    tapped = true;
  });
  const watch = new MutationObserver(close);
  watch.observe(attrib, { attributes: true, attributeFilter: ["class", "open"] });
  map.once("remove", () => watch.disconnect());
  close();
}
