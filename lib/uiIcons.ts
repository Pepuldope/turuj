// Interface pictograms (24x24, drawn in currentColor), from the "Feel Lab"
// prototype (strategy/12-feel/). Plain SVG markup so React and SVG scenes
// (the sun arc) can share them.

export const UI_ICON = {
  // Windows and wheels are holes in the body, not white shapes: on a dark card a white fill read as a solid block.
  car: '<path d="M5.2 11 6.7 6.4A2 2 0 0 1 8.6 5h6.8a2 2 0 0 1 1.9 1.4l1.5 4.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M5.2 10.4h13.6A2.2 2.2 0 0 1 21 12.6V15a2.2 2.2 0 0 1-2.2 2.2H5.2A2.2 2.2 0 0 1 3 15v-2.4a2.2 2.2 0 0 1 2.2-2.2zM7 12.3a1.5 1.5 0 1 0 0 3.0 1.5 1.5 0 1 0 0-3.0zM17 12.3a1.5 1.5 0 1 0 0 3.0 1.5 1.5 0 1 0 0-3.0z" fill="currentColor" fill-rule="evenodd"/><path d="M5.3 17.2v2.4M18.7 17.2v2.4" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>',
  bus: '<path d="M7.5 3h9a3 3 0 0 1 3 3v9.5a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3zM7.7 6.6h8.6a1 1 0 0 1 1 1v3.2a1 1 0 0 1-1 1H7.7a1 1 0 0 1-1-1V7.6a1 1 0 0 1 1-1zM8.9 4.2h6.2a.7.7 0 0 1 0 1.4H8.9a.7.7 0 0 1 0-1.4zM8.2 13.7a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 1 0 0-2.6zM15.8 13.7a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 1 0 0-2.6z" fill="currentColor" fill-rule="evenodd"/><path d="M7.3 18v2.4M16.7 18v2.4" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M2.6 7.2v3.4M21.4 7.2v3.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  train: '<path d="M8.5 2.5h7A3.5 3.5 0 0 1 19 6v8a3.5 3.5 0 0 1-3.5 3.5h-7A3.5 3.5 0 0 1 5 14V6a3.5 3.5 0 0 1 3.5-3.5zM8.2 5.6h7.6a1 1 0 0 1 1 1v2.6a1 1 0 0 1-1 1H8.2a1 1 0 0 1-1-1V6.6a1 1 0 0 1 1-1zM8.7 12.5a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 1 0 0-2.6zM15.3 12.5a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 1 0 0-2.6z" fill="currentColor" fill-rule="evenodd"/><path d="M8.5 17.5 6.2 21.3M15.5 17.5l2.3 3.8M7.4 19.8h9.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  walker: '<circle cx="13" cy="4" r="2.6" fill="currentColor"/><path d="M12.3 7.6 10 13l2.4 2.3-1.2 5.7M12.3 7.6l2.4 4.9 2.3 1.2M10 13l-2.4 7.6" stroke="currentColor" stroke-width="2.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M18.6 10.4 17 21" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  boot: '<path d="M6 3.5h6v7l6.5 3.2c1 .5 1.5 1.3 1.5 2.3V18H5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M5 20.5h15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15.5" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  kid: '<circle cx="8" cy="5.5" r="2.4" fill="currentColor"/><circle cx="16.5" cy="9" r="1.9" fill="currentColor"/><path d="M8 9.5v6M8 11.5l-3 2.5M8 11.5l3 2.5M8 15.5l-2 5M8 15.5l2 5M16.5 12v4.2M16.5 13.5l-2.2 1.8M16.5 13.5l2.2 1.8M16.5 16.2l-1.4 4.3M16.5 16.2l1.4 4.3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  // The dot is a hole, not a white disc: on a white pin (the blue "Použiť moju polohu" button) a white dot vanished.
  pin: '<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11zM12 7.6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 1 0 0-4.8z" fill="currentColor" fill-rule="evenodd"/>',
  map: '<path d="m3.5 6 5.5-2 6 2 5.5-2v14l-5.5 2-6-2-5.5 2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 4v14M15 6v14" stroke="currentColor" stroke-width="1.6"/>',
  up: '<path d="m4 18 6-8 4 5 6-9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  clock: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7.5V12l3 2" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>',
  chev: '<path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  down: '<path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  // A finished step of the trip plan.
  check: '<path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
  download: '<path d="M12 4v10m0 0-4-4m4 4 4-4M5 19h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  back: '<path d="m15 6-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  dot: '<circle cx="12" cy="12" r="4.2" fill="currentColor"/>',
  search: '<circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="m16 16 4.5 4.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="4.5" cy="6" r="1.5" fill="currentColor"/><circle cx="4.5" cy="12" r="1.5" fill="currentColor"/><circle cx="4.5" cy="18" r="1.5" fill="currentColor"/>',
  expand: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  close: '<path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>',
  // Footer links (2026-10-28).
  peak: '<path d="m8 4 4 8 5-5 5 13H2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  person: '<circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 21a8 8 0 0 1 16 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  book: '<path d="M2.5 5H8a4 4 0 0 1 4 4v11a3 3 0 0 0-3-3H2.5zM21.5 5H16a4 4 0 0 0-4 4v11a3 3 0 0 1 3-3h6.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 11V7a4 4 0 0 1 8 0v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  warn: '<path d="M12 3 2 21h20z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 10v4M12 17.5v.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  // One glyph per footer meaning (2026-11-08).
  help: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9.3 9.4a2.8 2.8 0 0 1 5.4.9c0 1.9-2.7 2.3-2.7 4.1M12 17.4v.4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  access: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="7.6" r="1.4" fill="currentColor"/><path d="M7.2 10.4 12 11.2l4.8-.8M12 11.2v3.2M12 14.4l-2.2 3.6M12 14.4l2.2 3.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  doc: '<path d="M6 3h8l4.5 4.5V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 3v4.5h4.5M8 13h8M8 17h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  barrier: '<path d="M5 21V8M19 21V8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><rect x="2.5" y="4" width="19" height="6" rx="1.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8.5 4 6.5 10M13 4l-2 6M17.5 4l-2 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  star: '<path d="m12 2.5 2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.7-6.2 3.7 1.6-7L2 9.7l7.1-.6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  flag: '<path d="M5 21V4h11l-2 4 2 4H5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M11 18h2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  globe: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  logout: '<path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 8l4 4-4 4M19 12H9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  // The Kedy step's sunrise and sunset marks (Peter picked option 1, 2026-11-12): the sun's half disc is a fill in --sun.
  sunrise: '<path d="M3 18h18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 18a5 5 0 0 1 10 0z" style="fill:var(--sun)" stroke="none"/><path d="M7 18a5 5 0 0 1 10 0" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 6v2M5.6 9.6l1.4 1.4M18.4 9.6 17 11M2.5 14h1.6M20 14h1.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  sunset: '<path d="M3 18h18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.5 18a3.5 3.5 0 0 1 7 0z" style="fill:var(--sun)" stroke="none"/><path d="M8.5 18a3.5 3.5 0 0 1 7 0" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 21h12" opacity=".5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
} as const;

export type UiIconName = keyof typeof UI_ICON;

/**
 * The same icon as a solid shape `w` wider on every side (in icon units), to
 * draw underneath it as an outline of even weight: stroked lines get 2w more
 * width, filled shapes a 2w stroke. A plain CSS stroke can't do this, since it
 * replaces each line's own width instead of adding to it.
 */
export function iconEdge(markup: string, w = 1.2): string {
  return markup.replace(/<(circle|rect|path)\b([^>]*?)\/>/g, (_, tag: string, attrs: string) => {
    const width = /stroke-width="([\d.]+)"/.exec(attrs);
    const rest = attrs
      .replace(/\s(fill|stroke|stroke-width|stroke-linecap|stroke-linejoin)="[^"]*"/g, "")
      .trim();
    const filled = !/fill="none"/.test(attrs);
    const sw = Math.round((width ? Number(width[1]) + 2 * w : 2 * w) * 100) / 100;
    return `<${tag} ${rest} fill="${filled ? "currentColor" : "none"}" stroke="currentColor" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"/>`;
  });
}
