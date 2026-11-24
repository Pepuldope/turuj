"use client";

import { track } from "@/lib/analytics";
import { routeGpx } from "@/lib/gpx";
import { gpxMarks } from "@/lib/gpxMarks";
import { useTripAccess } from "@/components/TripAccess";
import { UiIcon } from "@/components/UiIcon";
import { useT } from "@/lib/i18n";

/**
 * "Stiahnuť GPX": a place's file holds every route to it, so this downloads only the
 * route on this page, as `<slug>.gpx`. Falls back to the whole file when it can't be cut.
 * The car park (or stop) and where its walk meets the trail are added as waypoints, with a line
 * under the button when the page counts a different walk than the file (C109, lib/gpxMarks.ts).
 */
export function GpxDownload({ gpxUrl, slug, name }: { gpxUrl: string; slug: string; name: string }) {
  const file = gpxUrl.split("#")[0];
  const t = useT();
  const { walking, transit, parking, stop, trailStart, trailJoin, skip, approachMin } = useTripAccess();
  const marks = gpxMarks({ walking, transit, parking, stop, trailStart, trailJoin, skip, approachMin }, t);

  async function download(e: React.MouseEvent<HTMLAnchorElement>) {
    // Decided before the fetch: once the click returns, the browser would already follow the link.
    e.preventDefault();
    track("gpx_download", { trail: slug });
    let gpx: string | null = null;
    try {
      const res = await fetch(file);
      if (res.ok) gpx = routeGpx(await res.text(), decodeURIComponent(new URL(gpxUrl, "http://x").hash.slice(1)), name, marks.points);
    } catch {
      // Offline and not saved: fall back to the whole file.
    }
    const url = gpx ? URL.createObjectURL(new Blob([gpx], { type: "application/gpx+xml" })) : file;
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug}.gpx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    if (gpx) setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  // A real action of the "Uložiť a navigovať" card, a secondary button like the others there.
  const link = (
    <a
      href={file}
      download={`${slug}.gpx`}
      onClick={download}
      className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card-bg)] px-4 py-2.5 text-left hover:border-[var(--accent)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
    >
      <span className="text-[var(--accent)]">
        <UiIcon name="download" size={20} />
      </span>
      <span className="flex min-w-0 flex-col leading-snug">
        <span className="text-sm font-semibold text-[var(--foreground)]">{t("Stiahnuť GPX")}</span>
        <span className="text-[12.5px] text-[var(--muted)]">{t("do hodiniek alebo Mapy.com")}</span>
      </span>
    </a>
  );
  if (!marks.note) return link;
  return (
    <div className="flex flex-col gap-1.5">
      {link}
      <p className="px-1 text-[12.5px] leading-snug text-[var(--muted)]">{marks.note}</p>
    </div>
  );
}
