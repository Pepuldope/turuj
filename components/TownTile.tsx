import { IntentLink } from "@/lib/i18n";
import { UiIcon } from "@/components/UiIcon";
import { formatDurationShort } from "@/lib/format";
import { kindSvg } from "@/lib/kindIcons";
import { GOAL_COLOUR } from "@/lib/palette";
import type { TownTile as Tile } from "@/lib/townTrips";
import { langPath, tr } from "@/lib/lang";
import type { Lang } from "@/lib/lang";

/** A town page tile: the place's photo (or its kind's colour and a hill), name, drive and walk. */
export function TownTile({ tile, lang = "sk", townId }: { tile: Tile; lang?: Lang; /** The town page this tile is on: the trip page then starts from it (?z=) unless a start is already chosen. */ townId?: string }) {
  const colour = GOAL_COLOUR[tile.kind] ?? GOAL_COLOUR.ine;
  return (
    <IntentLink href={langPath(lang, `/trasa/${tile.slug}${townId ? `?z=${townId}` : ""}`)} className="flex w-[150px] flex-none snap-start flex-col gap-1.5 text-inherit no-underline">
      <span
        className="relative block aspect-square overflow-hidden rounded-2xl"
        style={{ background: `linear-gradient(170deg, ${colour}, ${colour}dd)` }}
      >
        {tile.photo ? (
          // Plain img: Commons already serves a thumbnail of the right size.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={tile.photo.url}
            alt={tile.name}
            loading="lazy"
            decoding="async"
            // No cookies and no referrer to Wikimedia (it would otherwise set its own tracking cookies;
            // Commons allows any origin, so the image still loads).
            crossOrigin="anonymous"
            referrerPolicy="no-referrer"
            width={tile.photo.w}
            height={tile.photo.h}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <svg viewBox="0 0 150 150" preserveAspectRatio="none" aria-hidden="true" className="absolute inset-0 h-full w-full">
            <path d="M0 150 L0 92 L28 74 L52 86 L80 58 L104 78 L128 66 L150 80 L150 150Z" fill="#fff" opacity=".16" />
            <path d="M0 150 L0 112 L34 96 L62 108 L92 84 L120 102 L150 94 L150 150Z" fill="#fff" opacity=".34" />
          </svg>
        )}
        <span
          className="absolute top-2 left-2 grid h-[30px] w-[30px] place-items-center rounded-[9px] text-white"
          style={{ background: tile.photo ? colour : "rgba(255,255,255,.22)" }}
          dangerouslySetInnerHTML={{ __html: kindSvg(tile.kind in GOAL_COLOUR ? tile.kind : "ine", 20) }}
        />
        {tile.kids && (
          <span className="absolute top-2.5 right-2 rounded-full bg-white/90 px-2 text-xs font-bold text-[#17663a]">{tr(lang, "pre deti")}</span>
        )}
        {tile.closedSeason && (
          // Seasonal park closure (TANAP ridges): visible before anyone picks a closed summit from Google.
          <span className="absolute right-1 bottom-1.5 left-1 flex items-center justify-center gap-0.5 overflow-hidden rounded-lg bg-[var(--danger-bg)] px-1 py-0.5 text-[11px] font-bold whitespace-nowrap text-[var(--danger)]">
            <UiIcon name="warn" size={11} />
            <span className="min-w-0 truncate">{tr(lang, "zatvorené {when}", { when: tile.closedSeason })}</span>
          </span>
        )}
      </span>
      <span className="text-[15px] leading-tight font-bold">{tile.name}</span>
      <span className="flex flex-wrap gap-x-2 text-[13px] text-[var(--muted)]">
        <span>{tr(lang, "{t} autom", { t: formatDurationShort(tile.carMin) })}</span>
        <span>{tr(lang, "{t} pešo", { t: formatDurationShort(tile.walkMin) })}</span>
      </span>
    </IntentLink>
  );
}
