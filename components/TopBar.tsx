"use client";

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { deleteMyAccount, googleHref, signOut, signedIn, useAccount } from "@/lib/account";
import type { MyAccount } from "@/lib/account";
import { LangLink, useLang, useT } from "@/lib/i18n";
import { langOfPath, langPath, skPath } from "@/lib/lang";
import { useSavedTrips } from "@/lib/savedTrips";
import { UiIcon } from "@/components/UiIcon";
import { EASE_IN, EASE_OUT, dockMoved, pop } from "@/lib/dockFlip";
import type { UiIconName } from "@/lib/uiIcons";

// The account button and the menu (Peter, 2026-10-29). Phone: a bar along the top that slides
// away while scrolling down and comes back on the way up. Computer: a small card in the top
// right corner, over the map.

/** The menu's links, in order. Peter adds more here. */
const MENU: { href: string; label: string; icon: UiIconName }[] = [
  { href: "/ulozene", label: "Moje výlety", icon: "list" },
  { href: "/vylety-z", label: "Výlety z miest", icon: "peak" },
  { href: "/aplikacia", label: "Získať appku", icon: "phone" },
  { href: "/napiste-nam", label: "Napíšte nám", icon: "chat" },
  { href: "/nahlasit-chybu", label: "Nahlásiť chybu", icon: "flag" },
  { href: "/o-nas", label: "O nás", icon: "person" },
];

/** The phone bar's height, without the notch. */
const BAR_PX = 52;

type Panel = "menu" | "account" | null;

export function TopBar() {
  const t = useT();
  const path = usePathname() ?? "/";
  // Kept with the page it was opened on: a new page closes it.
  const [opened, setOpened] = useState<{ kind: Panel; path: string }>({ kind: null, path });
  const panel = opened.path === path ? opened.kind : null;
  const setPanel = (p: Panel | ((cur: Panel) => Panel)) => setOpened((o) => ({ kind: typeof p === "function" ? p(o.path === path ? o.kind : null) : p, path }));
  const [shown, setShown] = useState(true);
  const shownRef = useRef(true);
  const [solid, setSolid] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeCode, setNoticeCode] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const { account } = useAccount();

  // Phone: hide on the way down, show on the way up and near the top.
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      // Scrolling down from the top, the bar goes straight away: it never turns into the white bar
      // first only to slide off a moment later (Peter, 2026-11-03). It only turns white while shown,
      // and keeps its look while sliding away.
      let next: boolean | null = null;
      if (y <= 8) next = true;
      else if (y > last && (last <= 60 || y - last > 6)) next = false;
      else if (last - y > 6) next = true;
      if (next !== null) setShown(next);
      if (next ?? shownRef.current) setSolid(y > 8);
      if (next !== null) shownRef.current = next;
      last = y;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const visible = shown || panel !== null;
  // Coming back into view, the bar's row pops a little as it slides in (not on the first paint).
  const rowRef = useRef<HTMLDivElement>(null);
  const wasVisible = useRef(visible);
  useEffect(() => {
    if (visible && !wasVisible.current) pop(rowRef.current);
    wasVisible.current = visible;
  }, [visible]);

  // Things stuck to the top of the page (the home page's search row) move down under the bar,
  // in the same frame as the bar itself.
  useLayoutEffect(() => {
    const phone = window.matchMedia("(max-width: 1023.98px)");
    const apply = () => {
      const root = document.documentElement;
      // Everything at the top moves with the bar's easing: a little overshoot coming in, plain going away.
      root.dataset.dock = visible ? "in" : "out";
      root.style.setProperty("--dock-ease", visible ? EASE_IN : EASE_OUT);
      document.documentElement.style.setProperty("--topbar", phone.matches && visible ? `calc(${BAR_PX}px + env(safe-area-inset-top))` : "0px");
      dockMoved();
    };
    apply();
    phone.addEventListener("change", apply);
    return () => phone.removeEventListener("change", apply);
  }, [visible]);

  // Back from Google with a problem: open the account panel and say what happened.
  useEffect(() => {
    const u = new URL(location.href);
    const why = u.searchParams.get("prihlasenie");
    if (!why) return;
    u.searchParams.delete("prihlasenie");
    history.replaceState(history.state, "", u.pathname + u.search + u.hash);
    if (why === "zrusene") return;
    const id = setTimeout(() => {
      setNotice(why === "off" ? "Prihlásenie cez Google ešte nie je zapnuté. Skúste email." : "Prihlásenie cez Google sa nepodarilo. Skúste znova alebo cez email.");
      setNoticeCode(why.startsWith("chyba-") ? why.slice(6).replace(/[^a-z0-9-]/g, "").slice(0, 40) : null);
      setOpened({ kind: "account", path: location.pathname });
    });
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!panel) return;
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpened((o) => ({ ...o, kind: null }));
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpened((o) => ({ ...o, kind: null }));
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [panel]);

  const toggle = (p: Exclude<Panel, null>) => setPanel((cur) => (cur === p ? null : p));
  const initial = account ? (account.name ?? account.email).trim().charAt(0).toUpperCase() : null;

  return (
    <div
      ref={boxRef}
      style={{ transitionTimingFunction: visible ? EASE_IN : EASE_OUT }}
      // Back at the top the bar turns see-through at once, not over 280 ms: iOS reads the colour for the
      // strip behind the clock while the page scrolls, and caught it still white (Peter, 2026-11-05).
      className={`fixed inset-x-0 top-0 z-40 pt-[env(safe-area-inset-top)] ${solid || panel ? "transition-[translate,transform,background-color,box-shadow]" : "transition-[translate,transform]"} duration-[280ms] motion-reduce:transition-none lg:inset-x-auto lg:top-3 lg:right-3 lg:translate-y-0 lg:bg-transparent lg:p-0 lg:shadow-none ${
        visible ? "translate-y-0" : "-translate-y-full"
      } ${
        solid || panel
          ? "bg-[var(--card-bg)] shadow-[0_1px_0_var(--border),0_6px_16px_rgba(20,35,59,.08)]"
          : // See-through over the page's own header: taps go to what is under it (the "Všetky výlety" link,
            // Peter 2026-10-30), only the buttons take them.
            "pointer-events-none bg-transparent"
      }`}
    >
      {/* Overhead above the bar in its own colour: coming in, the bar overshoots a little and this
          fills the top of the screen instead of leaving a gap (Peter, 2026-11-03). */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 bottom-full h-16 lg:hidden ${solid || panel ? "bg-[var(--card-bg)] transition-colors duration-200" : "bg-transparent"}`}
      />
      <div ref={rowRef} className={`flex h-[52px] items-center justify-between gap-2 px-3 lg:h-auto lg:justify-end lg:gap-1 lg:rounded-full lg:bg-[var(--card-bg)] lg:p-1 lg:shadow-[var(--shadow-float)]`}>
        {/* The name only once the page's own header (which shows it) has scrolled away. */}
        <LangLink href="/" aria-label="Túruj" className={`block lg:hidden ${solid || panel ? "" : "invisible"}`}>
          <picture>
            <source srcSet="/brand/turuj-wordmark-on-dark.svg" media="(prefers-color-scheme: dark)" />
            <img src="/brand/turuj-wordmark.svg" alt="Túruj" width={56} height={24} className="h-6 w-auto" />
          </picture>
        </LangLink>
        <span className="pointer-events-auto flex items-center gap-2 lg:gap-1">
          <button
            type="button"
            onClick={() => toggle("account")}
            aria-expanded={panel === "account"}
            aria-label={account ? t("Účet") : t("Prihlásiť sa")}
            className={`grid h-10 w-10 place-items-center rounded-full border text-[15px] font-bold lg:h-9 lg:w-9 lg:border-0 ${
              initial ? "border-transparent bg-[var(--accent)] text-[var(--accent-contrast)]" : "border-[var(--border)] bg-[var(--card-bg)] hover:bg-[var(--segment-bg)]"
            }`}
          >
            {initial ?? <UiIcon name="person" size={20} />}
          </button>
          <button
            type="button"
            onClick={() => toggle("menu")}
            aria-expanded={panel === "menu"}
            aria-label={t("Menu")}
            className="grid h-10 w-10 place-items-center rounded-full border border-[var(--border)] bg-[var(--card-bg)] hover:bg-[var(--segment-bg)] lg:h-9 lg:w-9 lg:border-0"
          >
            <UiIcon name={panel === "menu" ? "close" : "menu"} size={20} />
          </button>
        </span>
      </div>
      {panel && (
        <div className="absolute inset-x-3 top-[calc(100%+6px)] max-h-[calc(100dvh-80px)] overflow-y-auto rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card-bg)] p-2 shadow-[var(--shadow-float)] lg:inset-x-auto lg:right-0 lg:w-80">
          {panel === "menu" ? <MenuList /> : <AccountPanel notice={notice} code={noticeCode} onDone={() => setNotice(null)} />}
        </div>
      )}
    </div>
  );
}

function MenuList() {
  const t = useT();
  const lang = useLang();
  const path = usePathname() ?? "/";
  const { trips } = useSavedTrips();
  const other = langOfPath(path) === "en" ? skPath(path) : langPath("en", path);
  const row = "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-medium hover:bg-[var(--segment-bg)]";
  return (
    <nav aria-label={t("Menu")} className="flex flex-col">
      {MENU.map((m) => (
        <LangLink key={m.href} href={m.href} className={row}>
          <span className="text-[var(--muted)]">
            <UiIcon name={m.icon} size={19} />
          </span>
          <span className="flex-1">{t(m.label)}</span>
          {m.href === "/ulozene" && trips.length > 0 && (
            <span className="rounded-full bg-[var(--accent)] px-2 text-xs font-bold text-[var(--accent-contrast)]">{trips.length}</span>
          )}
        </LangLink>
      ))}
      <a href={other} hrefLang={lang === "en" ? "sk" : "en"} lang={lang === "en" ? "sk" : "en"} className={`${row} mt-1 border-t border-[var(--border)] pt-3`}>
        <span className="text-[var(--muted)]">
          <UiIcon name="globe" size={19} />
        </span>
        <span className="flex-1">{lang === "en" ? "Slovensky" : "English"}</span>
      </a>
    </nav>
  );
}

const ERRORS: Record<string, string> = {
  email: "Skontrolujte email, niečo v ňom chýba.",
  wait: "Kód sme poslali pred chvíľou. Nový o minútu.",
  wrong: "Kód nesedí. Skúste ho prepísať ešte raz.",
  expired: "Tento kód už neplatí. Pošlite si nový.",
  off: "Prihlásenie teraz nefunguje. Skúste to neskôr.",
  mail: "Email sa nepodarilo poslať. Skúste to neskôr.",
  pw: "Heslo musí mať aspoň 8 znakov.",
  wrongpw: "Email alebo heslo nesedí.",
  locked: "Priveľa pokusov. Skúste o 15 minút alebo si nastavte nové heslo.",
  nopw: "Tento účet ešte nemá heslo. Nastavte si ho cez „Zabudli ste heslo?“ alebo sa prihláste cez Google.",
};

/** login and signup are the two tabs; reset ("Zabudli ste heslo?") and code (sign in by email code) hang off login. */
type Mode = "login" | "signup" | "reset" | "code";

function AccountPanel({ notice, code: why, onDone }: { notice: string | null; code: string | null; onDone: () => void }) {
  const t = useT();
  const lang = useLang();
  const { account } = useAccount();
  const [mode, setMode] = useState<Mode>("login");
  const [verify, setVerify] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (account) {
    return (
      <div className="flex flex-col gap-1 p-1">
        <div className="px-2 pt-1 pb-2">
          <p className="font-bold">{account.name ?? t("Prihlásený účet")}</p>
          <p className="truncate text-sm text-[var(--muted)]">{account.email}</p>
        </div>
        <LangLink href="/ulozene" className="flex items-center gap-3 rounded-lg px-2 py-2.5 text-[15px] font-medium hover:bg-[var(--segment-bg)]">
          <span className="text-[var(--muted)]"><UiIcon name="list" size={19} /></span>
          {t("Moje výlety")}
        </LangLink>
        <button type="button" onClick={() => void signOut()} className="flex items-center gap-3 rounded-lg px-2 py-2.5 text-left text-[15px] font-medium hover:bg-[var(--segment-bg)]">
          <span className="text-[var(--muted)]"><UiIcon name="logout" size={19} /></span>
          {t("Odhlásiť sa")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            if (!window.confirm(t("Naozaj zmazať účet? Zmažeme meno, email aj heslo a nedá sa to vrátiť. Uložené výlety ostanú v tomto prehliadači."))) return;
            setBusy(true);
            const ok = await deleteMyAccount();
            setBusy(false);
            if (!ok) setError(t("Účet sa teraz nepodarilo zmazať. Skúste neskôr alebo napíšte na info@turuj.sk."));
          }}
          className="mt-1 px-2 py-1.5 text-left text-xs font-medium text-[var(--muted)] underline hover:text-[var(--danger)]"
        >
          {t("Zmazať účet")}
        </button>
        {error && <p className="px-2 text-xs font-semibold text-[var(--danger)]">{error}</p>}
      </div>
    );
  }

  const go = (m: Mode) => {
    setMode(m);
    setVerify(false);
    setError(null);
    setCode("");
  };

  async function post(url: string, body: object): Promise<{ ok: boolean; json: Record<string, unknown> }> {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { ok: r.ok, json: await r.json().catch(() => ({})) };
  }

  async function run(job: () => Promise<void>) {
    setBusy(true);
    setError(null);
    onDone();
    try {
      await job();
    } catch {
      setError(ERRORS.off);
    }
    setBusy(false);
  }

  const fail = (json: Record<string, unknown>) => setError(ERRORS[String(json.error)] ?? ERRORS.off);

  const sendCode = () =>
    run(async () => {
      const { ok, json } = await post("/api/auth/email", { email, lang });
      if (ok) {
        setVerify(true);
        setCode("");
      } else fail(json);
    });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (mode === "login") {
      return void run(async () => {
        const { ok, json } = await post("/api/auth/password", { email, password });
        if (ok && json.account) signedIn(json.account as MyAccount);
        else fail(json);
      });
    }
    // Sign-up and a new password are checked here first, so the email isn't sent for nothing.
    if ((mode === "signup" || (mode === "reset" && verify)) && password.length < 8) return setError(ERRORS.pw);
    if (!verify) return void sendCode();
    void run(async () => {
      const body = mode === "signup" ? { email, code, password, name } : mode === "reset" ? { email, code, password } : { email, code };
      const { ok, json } = await post("/api/auth/code", body);
      if (ok && json.account) signedIn(json.account as MyAccount);
      else fail(json);
    });
  }

  const input = "w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-[16px] outline-none focus:border-[var(--accent)]";
  const main = "w-full rounded-full bg-[var(--accent)] px-4 py-2.5 text-[15px] font-bold text-[var(--accent-contrast)] disabled:opacity-60";
  const link = "text-sm font-semibold text-[var(--accent)]";
  const codeOk = code.replace(/\D/g, "").length === 6;

  const pwField = (id: string, label: string, auto: string) => (
    <div className="relative">
      <label className="sr-only" htmlFor={id}>{t(label)}</label>
      <input
        id={id}
        type={showPw ? "text" : "password"}
        required
        minLength={auto === "new-password" ? 8 : undefined}
        autoComplete={auto}
        placeholder={t(label)}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className={`${input} pr-20`}
      />
      <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute top-1/2 right-3 -translate-y-1/2 text-xs font-bold text-[var(--accent)]">
        {showPw ? t("Skryť") : t("Ukázať")}
      </button>
    </div>
  );

  const emailField = (
    <>
      <label className="sr-only" htmlFor="login-email">{t("Email")}</label>
      <input id="login-email" type="email" required autoComplete="email" inputMode="email" placeholder={t("Email")} value={email} onChange={(e) => setEmail(e.target.value)} className={input} readOnly={verify} />
    </>
  );

  const codeField = (
    <>
      <p className="text-sm">{t("Poslali sme 6-miestny kód na {email}. Pozrite aj spam.", { email })}</p>
      <label className="sr-only" htmlFor="login-code">{t("Kód z emailu")}</label>
      <input
        id="login-code"
        autoFocus
        required
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]{6,7}"
        maxLength={7}
        placeholder="123456"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        className={`${input} text-center text-[22px] font-bold tracking-[0.3em]`}
      />
    </>
  );

  const label =
    mode === "login"
      ? t("Prihlásiť sa")
      : mode === "signup"
        ? verify ? t("Vytvoriť účet") : t("Pokračovať")
        : mode === "reset"
          ? verify ? t("Uložiť heslo a prihlásiť sa") : t("Poslať kód")
          : verify ? t("Prihlásiť sa") : t("Poslať kód");

  return (
    <div className="flex flex-col gap-3 p-2">
      {mode === "login" || mode === "signup" ? (
        <div role="tablist" className="grid grid-cols-2 rounded-full bg-[var(--segment-bg)] p-1 text-sm font-bold">
          {(["login", "signup"] as const).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => go(m)} className={`rounded-full px-3 py-2 ${mode === m ? "bg-[var(--card-bg)] shadow-sm" : "text-[var(--muted)]"}`}>
              {m === "login" ? t("Prihlásiť sa") : t("Vytvoriť účet")}
            </button>
          ))}
        </div>
      ) : (
        <div>
          <button type="button" onClick={() => go("login")} className={link}>← {t("Späť na prihlásenie")}</button>
          <p className="pt-2 text-[17px] font-bold">{mode === "reset" ? t("Nové heslo") : t("Prihlásenie kódom na email")}</p>
          <p className="text-sm text-[var(--muted)]">
            {mode === "reset" ? t("Pošleme vám kód na email a potom si nastavíte nové heslo.") : t("Pošleme vám 6-miestny kód, heslo netreba.")}
          </p>
        </div>
      )}
      {mode === "signup" && !verify && <p className="text-sm text-[var(--muted)]">{t("Účet je zadarmo. Email si overíme jedným kódom.")}</p>}
      {(notice || error) && <p className="rounded-lg bg-[var(--warn-bg)] px-3 py-2 text-sm font-semibold text-[var(--warn)]">{t((error ?? notice)!)}{!error && why && <span className="font-normal opacity-75"> ({why})</span>}</p>}

      <form onSubmit={submit} className="flex flex-col gap-2">
        {mode === "signup" && !verify && (
          <>
            <label className="sr-only" htmlFor="login-name">{t("Meno")}</label>
            <input id="login-name" autoComplete="name" placeholder={t("Meno")} value={name} onChange={(e) => setName(e.target.value)} className={input} maxLength={80} />
          </>
        )}
        {!verify && emailField}
        {mode === "login" && pwField("login-pw", "Heslo", "current-password")}
        {mode === "signup" && !verify && (
          <>
            {pwField("login-pw", "Heslo", "new-password")}
            <p className="px-1 text-xs text-[var(--muted)]">{t("Aspoň 8 znakov.")}</p>
          </>
        )}
        {verify && codeField}
        {mode === "reset" && verify && pwField("login-pw", "Nové heslo", "new-password")}
        <button type="submit" disabled={busy || (verify && !codeOk)} className={main}>
          {busy ? t("Chvíľku…") : label}
        </button>
        {verify ? (
          <div className="flex justify-between gap-2">
            <button type="button" className={link} onClick={() => (setVerify(false), setError(null))}>{t("Iný email")}</button>
            <button type="button" className={link} disabled={busy} onClick={() => void sendCode()}>{t("Poslať znova")}</button>
          </div>
        ) : (
          mode === "login" && (
            <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
              <button type="button" className={link} onClick={() => go("reset")}>{t("Zabudli ste heslo?")}</button>
              <button type="button" className={link} onClick={() => go("code")}>{t("Prihlásiť sa kódom")}</button>
            </div>
          )
        )}
      </form>

      {(mode === "login" || mode === "signup") && !verify && (
        <>
          <div className="flex items-center gap-3 text-xs font-semibold text-[var(--muted)]">
            <span className="h-px flex-1 bg-[var(--border)]" />
            {t("alebo")}
            <span className="h-px flex-1 bg-[var(--border)]" />
          </div>
          <a
            href="/api/auth/google"
            onClick={(e) => (e.currentTarget.href = googleHref())}
            className="flex items-center justify-center gap-2.5 rounded-full border border-[var(--border)] bg-white px-4 py-2.5 text-[15px] font-bold text-[#1f1f1f] hover:border-[var(--accent)]"
          >
            <GoogleG />
            {t("Pokračovať cez Google")}
          </a>
          <p className="px-1 text-center text-xs text-[var(--muted)]">
            {t("Prihlásením súhlasíte s")} <LangLink href="/podmienky" className="underline">{t("podmienkami")}</LangLink>.{" "}
            {t("Ako chránime údaje:")} <LangLink href="/sukromie" className="underline">{t("Súkromie")}</LangLink>.
          </p>
        </>
      )}
    </div>
  );
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
