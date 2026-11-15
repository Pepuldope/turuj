"use client";

import type { ReactNode } from "react";
import { useT } from "@/lib/i18n";

/*
 * Drawn phone screens for the install steps on /aplikacia. Phone UI keeps its own light colours
 * (it's a picture of a phone), the button to tap gets a sun ring. Labels follow the phone's
 * language, so the English page shows "Share", "Add to Home Screen".
 */

const INK = "#14233b";
const GREY = "#8a94a3";
const LINE = "#e3e7ee";
const BLUE = "#0a7aff";
const SUN = "#ffb81c";

/** A crop of a phone: bezel, screen, and whatever the step needs inside. */
function Phone({ children, label, top = false }: { children: ReactNode; label: string; top?: boolean }) {
  return (
    <svg viewBox="0 0 240 260" role="img" aria-label={label} className="h-auto w-full max-w-[240px]">
      {/* Bezel open at the far edge, so it reads as a crop of the top or bottom of the phone. */}
      <path
        d={top ? "M6 260V26a20 20 0 0 1 20-20h188a20 20 0 0 1 20 20v234" : "M6 0v234a20 20 0 0 0 20 20h188a20 20 0 0 0 20-20V0"}
        fill="#f6f7f9"
        stroke={INK}
        strokeWidth="6"
      />
      {children}
    </svg>
  );
}

/** Sun ring around the thing to tap. */
function Tap({ x, y, w, h, r = 10 }: { x: number; y: number; w: number; h: number; r?: number }) {
  return (
    <g>
      <rect x={x - 4} y={y - 4} width={w + 8} height={h + 8} rx={r + 4} fill="none" stroke={SUN} strokeWidth="3.5" />
    </g>
  );
}

function Txt({ x, y, children, size = 11, weight = 400, fill = INK, anchor = "start" as "start" | "middle" | "end" }: {
  x: number; y: number; children: ReactNode; size?: number; weight?: number; fill?: string; anchor?: "start" | "middle" | "end";
}) {
  return (
    <text x={x} y={y} fontSize={size} fontWeight={weight} fill={fill} textAnchor={anchor} fontFamily="system-ui, -apple-system, sans-serif">
      {children}
    </text>
  );
}

/** Our page as it looks behind the browser UI. */
function PageBehind({ y = 20, h = 150 }: { y?: number; h?: number }) {
  const t = useT();
  return (
    <g>
      <rect x="9" y={y} width="222" height={h} fill="#dcebf8" />
      <path d={`M9 ${y + h * 0.82} 70 ${y + h * 0.6} 110 ${y + h * 0.72} 160 ${y + h * 0.5} 231 ${y + h * 0.78}V${y + h}H9z`} fill="#b9d3a8" />
      <Txt x={22} y={y + 30} size={15} weight={800}>Túruj</Txt>
      <Txt x={22} y={y + 54} size={13} weight={700}>{t("Kam na výlet?")}</Txt>
    </g>
  );
}

const IOS_SHARE = "M0 7V-6M-4-2l4-4 4 4M-7 1v8h14V1";

/** Safari's bottom bar, with the address (step "open in Safari") or the Share button ringed. */
export function IosShareShot({ tap = "share" }: { tap?: "share" | "address" }) {
  const t = useT();
  return (
    <Phone label={tap === "share" ? t("Spodná lišta Safari s tlačidlom Zdieľať") : t("Safari s adresou turuj.sk")}>
      <PageBehind y={0} h={160} />
      <rect x="9" y="160" width="222" height="91" fill="#f6f7f9" />
      <rect x="22" y="170" width="196" height="30" rx="10" fill="#fff" stroke={LINE} />
      <Txt x={120} y={190} anchor="middle" size={12} weight={600}>turuj.sk</Txt>
      {/* ‹  ›  share  book  tabs */}
      <g stroke={BLUE} strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M34 218l-6 7 6 7" />
        <path d="M74 218l6 7-6 7" opacity=".35" />
        <path d={IOS_SHARE} transform="translate(120 225)" />
        <path d="M154 220h6a6 6 0 0 1 6 6v10a4 4 0 0 0-4-4h-8zM178 220h-6a6 6 0 0 0-6 6v10a4 4 0 0 1 4-4h8z" />
        <rect x="200" y="218" width="12" height="12" rx="2" /><path d="M204 214h11a2 2 0 0 1 2 2v11" />
      </g>
      {tap === "share" ? <Tap x={106} y={210} w={28} h={30} /> : <Tap x={22} y={170} w={196} h={30} />}
    </Phone>
  );
}

/** Step (new Safari): the ⋯ button, then Share. */
export function IosMoreShot() {
  const t = useT();
  return (
    <Phone label={t("Nová Safari: tlačidlo s tromi bodkami a potom Zdieľať")}>
      <PageBehind y={0} h={120} />
      <rect x="9" y="120" width="222" height="131" fill="#f6f7f9" />
      <rect x="120" y="128" width="104" height="70" rx="12" fill="#fff" stroke={LINE} />
      <g stroke={BLUE} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d={IOS_SHARE} transform="translate(138 147) scale(.8)" />
      </g>
      <Txt x={152} y={151} size={11} weight={600}>{t("Zdieľať")}</Txt>
      <line x1="128" y1="163" x2="216" y2="163" stroke={LINE} />
      <Txt x={134} y={184} size={11} fill={GREY}>{t("Pridať záložku")}</Txt>
      <Tap x={126} y={134} w={92} h={24} r={8} />
      <rect x="22" y="212" width="160" height="30" rx="15" fill="#fff" stroke={LINE} />
      <Txt x={102} y={232} anchor="middle" size={12} weight={600}>turuj.sk</Txt>
      <circle cx="207" cy="227" r="15" fill="#fff" stroke={LINE} />
      <g fill={INK}><circle cx="200" cy="227" r="1.8" /><circle cx="207" cy="227" r="1.8" /><circle cx="214" cy="227" r="1.8" /></g>
      <Tap x={192} y={212} w={30} h={30} r={15} />
      <Txt x={207} y={204} anchor="middle" size={9} weight={700} fill={GREY}>1</Txt>
      <Txt x={130} y={124} size={9} weight={700} fill={GREY}>2</Txt>
    </Phone>
  );
}

/** Step: the share sheet, scrolled down to "Pridať na plochu". */
export function IosAddShot() {
  const t = useT();
  const rows = [t("Kopírovať"), t("Pridať do zoznamu na čítanie"), t("Pridať záložku"), t("Pridať do obľúbených")];
  return (
    <Phone label={t("Ponuka Zdieľať, položka Pridať na plochu")}>
      <rect x="9" y="0" width="222" height="251" fill="#eef0f4" />
      <rect x="18" y="8" width="204" height="150" rx="12" fill="#fff" />
      {rows.map((r, i) => (
        <g key={r}>
          <Txt x={30} y={32 + i * 34} size={11.5}>{r}</Txt>
          {i < rows.length - 1 && <line x1="30" y1={43 + i * 34} x2="210" y2={43 + i * 34} stroke={LINE} />}
        </g>
      ))}
      <rect x="18" y="168" width="204" height="40" rx="12" fill="#fff" />
      <Txt x={30} y={193} size={12} weight={700}>{t("Pridať na plochu")}</Txt>
      <g stroke={INK} strokeWidth="1.8" fill="none" strokeLinecap="round">
        <rect x="192" y="179" width="18" height="18" rx="4" /><path d="M201 183v10M196 188h10" />
      </g>
      <Tap x={18} y={168} w={204} h={40} r={12} />
      <path d="M226 60v50m-4-6 4 6 4-6" stroke={GREY} strokeWidth="2" fill="none" strokeLinecap="round" />
    </Phone>
  );
}

/** Step: the "Pridať na plochu" screen with the Túruj icon and the Pridať button. */
export function IosConfirmShot() {
  const t = useT();
  return (
    <Phone label={t("Obrazovka Pridať na plochu s tlačidlom Pridať")} top>
      <rect x="9" y="9" width="222" height="251" fill="#eef0f4" />
      <Txt x={22} y={42} size={12} fill={BLUE}>{t("Zrušiť")}</Txt>
      <Txt x={120} y={42} size={12} weight={700} anchor="middle">{t("Pridať na plochu")}</Txt>
      <Txt x={198} y={42} size={12} weight={700} fill={BLUE} anchor="middle">{t("Pridať")}</Txt>
      <Tap x={177} y={28} w={42} h={20} r={6} />
      <rect x="18" y="62" width="204" height="74" rx="12" fill="#fff" />
      <image href="/icons/icon.svg" x="28" y="72" width="54" height="54" />
      <Txt x={94} y={92} size={13} weight={600}>Túruj</Txt>
      <line x1="94" y1="102" x2="212" y2="102" stroke={LINE} />
      <Txt x={94} y={122} size={11} fill={GREY}>turuj.sk</Txt>
      <rect x="18" y="148" width="204" height="40" rx="12" fill="#fff" />
      <Txt x={30} y={172} size={11}>{t("Otvoriť ako webovú appku")}</Txt>
      <rect x="180" y="158" width="32" height="20" rx="10" fill="#34c759" />
      <circle cx="202" cy="168" r="8" fill="#fff" />
    </Phone>
  );
}

/** Step: the icon on the home screen. */
export function HomeScreenShot() {
  const t = useT();
  const apps = ["#5ac8fa", "#ff9500", "#34c759", "#af52de", "#ff3b30", "#ffcc00", "#007aff"];
  return (
    <Phone label={t("Ikona Túruj na ploche telefónu")} top>
      <rect x="9" y="9" width="222" height="251" fill="#7aa7d6" />
      <rect x="9" y="160" width="222" height="100" fill="#5f8fc2" />
      {apps.map((c, i) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        return <rect key={c} x={24 + col * 52} y={34 + row * 66} width="40" height="40" rx="10" fill={c} opacity=".85" />;
      })}
      <image href="/icons/icon.svg" x={180} y={100} width="40" height="40" />
      <Txt x={200} y={154} size={9.5} weight={700} fill="#fff" anchor="middle">Túruj</Txt>
      <Tap x={180} y={100} w={40} h={40} r={10} />
    </Phone>
  );
}

/** Step: Chrome's ⋮ menu on Android. */
export function AndroidMenuShot() {
  const t = useT();
  return (
    <Phone label={t("Chrome: ponuka s tromi bodkami vpravo hore")} top>
      <rect x="9" y="9" width="222" height="40" fill="#fff" />
      <rect x="20" y="17" width="170" height="24" rx="12" fill="#eef0f4" />
      <Txt x={34} y={33} size={11} weight={600}>turuj.sk</Txt>
      <g fill={INK}><circle cx="212" cy="22" r="2" /><circle cx="212" cy="29" r="2" /><circle cx="212" cy="36" r="2" /></g>
      <Tap x={202} y={16} w={20} h={26} r={6} />
      <PageBehind y={49} h={211} />
    </Phone>
  );
}

/** Step: "Pridať na plochu" in Chrome's menu. */
export function AndroidAddShot() {
  const t = useT();
  const rows = [t("Nová karta"), t("História"), t("Stiahnuté súbory"), t("Záložky"), t("Zdieľať…")];
  return (
    <Phone label={t("Chrome: položka Pridať na plochu v ponuke")} top>
      <PageBehind y={9} h={251} />
      <rect x="70" y="16" width="156" height="236" rx="10" fill="#fff" stroke={LINE} />
      {rows.map((r, i) => (
        <Txt key={r} x={84} y={42 + i * 34} size={11.5}>{r}</Txt>
      ))}
      <Txt x={84} y={42 + rows.length * 34} size={11.5} weight={700}>{t("Pridať na plochu")}</Txt>
      <Tap x={76} y={24 + rows.length * 34} w={144} h={26} r={6} />
    </Phone>
  );
}

/** Step: Chrome's install dialog. */
export function AndroidConfirmShot() {
  const t = useT();
  return (
    <Phone label={t("Chrome: okno Inštalovať s tlačidlom Inštalovať")}>
      <PageBehind y={0} h={251} />
      <rect x="9" y="0" width="222" height="251" fill="#000" opacity=".35" />
      <rect x="24" y="60" width="192" height="130" rx="18" fill="#fff" />
      <Txt x={40} y={88} size={13} weight={700}>{t("Inštalovať aplikáciu?")}</Txt>
      <image href="/icons/icon.svg" x="40" y="100" width="36" height="36" />
      <Txt x={86} y={116} size={12} weight={600}>Túruj</Txt>
      <Txt x={86} y={131} size={10} fill={GREY}>turuj.sk</Txt>
      <Txt x={128} y={172} size={11.5} weight={600} fill="#1a73e8" anchor="end">{t("Zrušiť")}</Txt>
      <Txt x={200} y={172} size={11.5} weight={700} fill="#1a73e8" anchor="end">{t("Inštalovať")}</Txt>
      <Tap x={142} y={158} w={62} h={20} r={6} />
    </Phone>
  );
}
