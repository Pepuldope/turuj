"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { track } from "@/lib/analytics";
import { useInstalled, useInstallPrompt } from "@/lib/installApp";
import { useT } from "@/lib/i18n";
import { UiIcon } from "@/components/UiIcon";
import {
  AndroidAddShot,
  AndroidConfirmShot,
  AndroidMenuShot,
  HomeScreenShot,
  IosAddShot,
  IosConfirmShot,
  IosMoreShot,
  IosShareShot,
} from "@/components/InstallShots";

/** One numbered step: what to do, a short tip, and a drawing of the screen. */
function Step({ id, n, title, children, shot }: { id?: string; n: number; title: string; children?: ReactNode; shot: ReactNode }) {
  return (
    <li id={id} className="scroll-mt-4 flex flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card-bg)] p-4 sm:flex-row sm:items-center sm:gap-5">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-sm font-extrabold text-[var(--accent-contrast)]">
            {n}
          </span>
          <h3 className="text-base leading-snug font-bold">{title}</h3>
        </div>
        {children && <div className="text-sm text-[var(--muted)] [&_b]:text-[var(--foreground)]">{children}</div>}
      </div>
      <div className="flex justify-center sm:w-[200px] sm:shrink-0">{shot}</div>
    </li>
  );
}

function Section({ id, icon, title, intro, children }: { id: string; icon: ReactNode; title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="flex scroll-mt-4 flex-col gap-3">
      <h2 className="flex items-center gap-2 !pt-0 !text-xl !font-extrabold">
        {icon}
        {title}
      </h2>
      {intro && <p className="text-[var(--muted)]">{intro}</p>}
      {children}
    </section>
  );
}

const APPLE = (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="currentColor">
    <path d="M16.4 12.6c0-2.4 2-3.6 2.1-3.7-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.9-3.2-.8-1.6 0-3.1 1-4 2.4-1.7 3-.4 7.4 1.2 9.8.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.1-.8 1.5 0 1.9.8 3.2.8 1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8 0 0-2.5-1-2.5-3.9zM14 5.5c.7-.8 1.1-1.9 1-3-1 0-2.1.7-2.8 1.5-.6.7-1.2 1.8-1 2.9 1 .1 2.1-.6 2.8-1.4z" />
  </svg>
);
const ANDROID = (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="currentColor">
    <path d="M6 10v6a1 1 0 0 0 2 0v-6a1 1 0 0 0-2 0zm10 0v6a1 1 0 0 0 2 0v-6a1 1 0 0 0-2 0zM7 9h10v8a1 1 0 0 1-1 1h-1v2.5a1 1 0 0 1-2 0V18h-2v2.5a1 1 0 0 1-2 0V18H8a1 1 0 0 1-1-1zm.3-1a4.8 4.8 0 0 1 2.4-3.6L9 3.2a.3.3 0 0 1 .5-.3l.8 1.2a5 5 0 0 1 3.4 0l.8-1.2a.3.3 0 0 1 .5.3l-.7 1.2A4.8 4.8 0 0 1 16.7 8zM10 6.2a.6.6 0 1 0 0 1.2.6.6 0 0 0 0-1.2zm4 0a.6.6 0 1 0 0 1.2.6.6 0 0 0 0-1.2z" />
  </svg>
);

/** /aplikacia: iPhone steps first, then Android, then what the home-screen app does. */
export function InstallGuide() {
  const t = useT();
  const installed = useInstalled();
  const { install } = useInstallPrompt();
  const [done, setDone] = useState(false);

  async function installAndroid() {
    if (!install) return;
    if (await install()) {
      setDone(true);
      track("app_installed");
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {installed ? (
        <p role="status" className="rounded-[var(--radius-card)] bg-[var(--ok-bg)] p-4 font-semibold text-[var(--ok)]">
          {t("Túruj už máte na ploche a práve ho používate ako appku. Nič ďalšie netreba.")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2 !list-none !pl-0">
          {[
            [t("Vlastná ikona na ploche, otvorí sa bez lišty prehliadača"), "expand"],
            [t("Uložené výlety otvoríte aj bez signálu, napríklad hore na kopci"), "map"],
            [t("Zadarmo a bez App Store či Google Play, zaberie skoro nič"), "dot"],
          ].map(([text, icon]) => (
            <li key={text} className="!mt-0 flex items-start gap-2.5">
              <span className="mt-0.5 text-[var(--accent)]"><UiIcon name={icon as "map"} size={18} /></span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
      )}

      {!installed && (
        <nav aria-label={t("Návody")} className="grid grid-cols-2 gap-2">
          <a href="#iphone" className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] font-bold !text-[var(--accent-contrast)] !no-underline">
            {APPLE}
            {t("Návod pre iPhone")}
          </a>
          <a href="#android" className="flex h-12 items-center justify-center gap-2 rounded-xl border-2 border-[var(--accent)] bg-[var(--card-bg)] font-bold !no-underline">
            {ANDROID}
            {t("Návod pre Android")}
          </a>
        </nav>
      )}

      <Section id="iphone" icon={APPLE} title={t("iPhone")} intro={t("Trvá to pol minúty. Návod je pre Safari, ktorý má každý iPhone.")}>
        <ol className="flex flex-col gap-3 !list-none !pl-0">
          <Step n={1} title={t("Otvorte turuj.sk v Safari")} shot={<IosShareShot tap="address" />}>
            <p>{t("Ste už v Safari? Tento krok preskočte. Ak ste túto stránku otvorili v inej appke (Messenger, Instagram), najprv ťuknite na tri bodky a vyberte Otvoriť v Safari.")}</p>
          </Step>
          <Step n={2} title={t("Ťuknite na Zdieľať")} shot={<IosShareShot />}>
            <p>{t("Je to štvorček so šípkou hore, v spodnej lište Safari, v strede.")}</p>
            <p className="mt-2 rounded-lg bg-[var(--sun-soft)] px-3 py-2 text-[var(--foreground)]">
              {t("Nevidíte dole Zdieľať, len adresu a tri bodky?")} <a href="#krok-3" className="font-semibold">{t("Preskočte na krok 3.")}</a>
            </p>
          </Step>
          <Step id="krok-3" n={3} title={t("Nová Safari? Najprv tri bodky, potom Zdieľať")} shot={<IosMoreShot />}>
            <p>{t("Ťuknite na tri bodky vedľa adresy (1) a potom na Zdieľať (2). Ak ste Zdieľať našli už v kroku 2, tento krok preskočte.")}</p>
          </Step>
          <Step n={4} title={t("Posuňte ponuku nižšie a vyberte Pridať na plochu")} shot={<IosAddShot />}>
            <p>{t("Ponuka sa otvorí odspodu. Posuňte ju prstom hore, kým neuvidíte Pridať na plochu so štvorčekom a plusom.")}</p>
          </Step>
          <Step n={5} title={t("Ťuknite Pridať vpravo hore")} shot={<IosConfirmShot />}>
            <p>{t("Názov nechajte Túruj. Ak vidíte prepínač Otvoriť ako webovú appku, nechajte ho zapnutý.")}</p>
          </Step>
          <Step n={6} title={t("Hotovo, otvárajte Túruj z plochy")} shot={<HomeScreenShot />}>
            <p>{t("Ikona pribudne na plochu, zvyčajne na poslednú stranu. Odteraz otvárajte Túruj cez ňu, nie cez Safari.")}</p>
          </Step>
        </ol>
        <p className="text-[var(--muted)]">
          {t("Chrome na iPhone: ťuknite na Zdieľať vpravo v adresnom riadku a pokračujte od kroku 4.")}
        </p>
      </Section>

      <Section id="android" icon={ANDROID} title={t("Android")} intro={t("V Chrome to ide jedným ťuknutím, inak tromi.")}>
        {!installed && install && !done && (
          <button
            type="button"
            onClick={installAndroid}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] text-base font-bold text-[var(--accent-contrast)] sm:w-fit sm:px-6"
          >
            <UiIcon name="down" size={18} />
            {t("Nainštalovať Túruj")}
          </button>
        )}
        {done && <p role="status" className="font-semibold text-[var(--ok)]">{t("Hotovo, Túruj je na ploche.")}</p>}
        <ol className="flex flex-col gap-3 !list-none !pl-0">
          <Step n={1} title={t("V Chrome ťuknite na tri bodky vpravo hore")} shot={<AndroidMenuShot />}>
            <p>{t("Ak tlačidlo Nainštalovať Túruj vyššie vidíte, stačí ťuknúť naň a môžete skočiť na krok 3.")}</p>
          </Step>
          <Step n={2} title={t("Vyberte Pridať na plochu")} shot={<AndroidAddShot />}>
            <p>{t("Niektoré telefóny tu píšu Inštalovať aplikáciu. Je to to isté.")}</p>
          </Step>
          <Step n={3} title={t("Potvrďte Inštalovať")} shot={<AndroidConfirmShot />}>
            <p>{t("Ak sa telefón spýta, či ikonu pridať na plochu, ťuknite Pridať.")}</p>
          </Step>
          <Step n={4} title={t("Hotovo, otvárajte Túruj z plochy")} shot={<HomeScreenShot />}>
            <p>{t("Ikonu nájdete na ploche alebo medzi všetkými aplikáciami.")}</p>
          </Step>
        </ol>
        <p className="text-[var(--muted)]">
          {t("Samsung Internet: ťuknite na tri čiarky dole vpravo, potom Pridať stránku do a vyberte Plocha.")}
        </p>
      </Section>

      <Section id="co-vie" icon={<UiIcon name="boot" size={22} />} title={t("Čo appka vie")}>
        <ul className="flex flex-col gap-2 !list-none !pl-0">
          <li className="!mt-0"><b>{t("Už teraz:")}</b> {t("otvorí sa celá obrazovka ako appka, uložené výlety (plán, mapa aj trasa) fungujú bez signálu, na trase vidíte, kde práve ste, pripomenieme vám návrat pred západom slnka a výlet zdieľate jedným ťuknutím.")}</li>
          <li><b>{t("Pripravujeme:")}</b> {t("pripomienku večer pred výletom, uloženie trasy ako GPX a denník výletov.")}</li>
        </ul>
      </Section>
    </div>
  );
}
