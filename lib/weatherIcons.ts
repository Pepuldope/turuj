// Weather symbols for the day strip (24x24). A grey cloud with what falls from
// it in colour; `mono` draws everything in currentColor for the picked (blue) day.
import type { BadSky, SkyKind } from "@/lib/weather";

const CLOUD = "M6.5 14.5h11a4 4 0 0 0 .4-8A5.6 5.6 0 0 0 7.1 8 3.3 3.3 0 0 0 6.5 14.5z";

export const BAD_SKY_LABEL: Record<BadSky, string> = {
  rain: "dážď",
  sleet: "dážď so snehom",
  snow: "sneženie",
  fog: "hmla",
  thunder: "búrky",
};

export function badSkySvg(kind: BadSky, mono: boolean): string {
  const cloud = mono ? "currentColor" : "#8a9ab1";
  const drop = mono ? "currentColor" : "#1769d1";
  const snow = mono ? "currentColor" : "#5b8fd6";
  const bolt = mono ? "currentColor" : "#f0a500";
  const drops = (xs: number[]) => xs.map((x) => `M${x} 17.2l-1 2.8`).join("");
  const flakes = (xs: number[]) => xs.map((x) => `<circle cx="${x}" cy="19" r="1.3" fill="${snow}"/>`).join("");
  switch (kind) {
    case "rain":
      return `<path d="${CLOUD}" fill="${cloud}"/><path d="${drops([8.5, 12.5, 16.5])}" stroke="${drop}" stroke-width="2" stroke-linecap="round"/>`;
    case "sleet":
      return `<path d="${CLOUD}" fill="${cloud}"/><path d="${drops([8.5, 16.5])}" stroke="${drop}" stroke-width="2" stroke-linecap="round"/>${flakes([12.5])}`;
    case "snow":
      return `<path d="${CLOUD}" fill="${cloud}"/>${flakes([8, 12.5, 17])}`;
    case "fog":
      return `<path d="M4 8.5h16M3 12.5h18M5 16.5h14" stroke="${cloud}" stroke-width="2.2" stroke-linecap="round"/>`;
    case "thunder":
      return `<path d="${CLOUD}" fill="${cloud}"/><path d="M12.8 13.2 10 18h3l-1.4 4.2 4.2-5.6h-3l1.3-3.4z" fill="${bolt}"/>`;
  }
}

const SUN_RAYS = "M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6";

/** One hour's weather glyph for the hour strip: monochrome (currentColor), same cloud as the day strip's. */
export function hourSkySvg(kind: SkyKind): string {
  const c = "currentColor";
  switch (kind) {
    case "clear":
      return `<circle cx="12" cy="12" r="4.2" fill="${c}"/><path d="${SUN_RAYS}" stroke="${c}" stroke-width="2" stroke-linecap="round"/>`;
    case "fair":
    case "partly":
      // The sun peeking out above a smaller cloud.
      return `<circle cx="9" cy="9" r="3.4" fill="${c}"/><path d="M9 2.8v1.4M2.8 9h1.4M4.6 4.6l1 1M13.4 4.6l-1 1" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/><path d="M8.5 20h9a3.5 3.5 0 0 0 .3-7A4.8 4.8 0 0 0 9.4 13.6 3.2 3.2 0 0 0 8.5 20z" fill="${c}" stroke="var(--card-bg)" stroke-width="1.4"/>`;
    case "cloudy":
      return `<path d="${CLOUD}" fill="${c}"/>`;
    case "fog":
      return badSkySvg("fog", true);
    case "lightrain":
    case "rain":
    case "heavyrain":
      return badSkySvg("rain", true);
    case "sleet":
      return badSkySvg("sleet", true);
    case "lightsnow":
    case "snow":
    case "heavysnow":
      return badSkySvg("snow", true);
    case "thunder":
      return badSkySvg("thunder", true);
  }
}
