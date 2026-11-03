import { InfoPage } from "@/components/InfoPage";
import { PlusWant } from "@/components/PlusWant";
import { pageMetadata } from "@/lib/seo";
import { T } from "@/lib/i18n";

export const metadata = pageMetadata({
  title: "Túruj+",
  description: "Túruj+ pre tých, čo chodia von často: víkendový tip, strážca výletu a vlastné výlety za 9,99 € ročne. Offline výlety ostávajú zadarmo.",
  path: "/plus",
});

const FEATURES = [
  {
    title: "Víkendový tip",
    text: "V piatok ráno vám pošleme tri výlety, ktoré tento víkend sedia práve vám: od vášho štartu, s deťmi aj bez, podľa počasia.",
  },
  {
    title: "Strážca výletu",
    text: "Uložený výlet strážime. Keď sa zhorší počasie, pribudne uzávera alebo by ste nestihli návrat za svetla, dáme vám vedieť.",
  },
  {
    title: "Vlastné výlety",
    text: "Poskladajte si vlastnú trasu s vlastným štartom a zastávkami. Čas, návrat za svetla aj uzávery prepočítame ako pri ostatných výletoch.",
  },
];

export default function PlusPage() {
  return (
    <InfoPage
      title={
        <>
          Túruj+{" "}
          <span className="ml-1 rounded-full bg-[var(--warn-bg)] px-2.5 py-1 align-middle text-xs font-semibold text-[var(--warn)]">
            <T>Pripravujeme</T>
          </span>
        </>
      }
      intro="Pre tých, čo chodia von často. Zoznam výletov, plány, parkovanie, uzávery, zdieľanie aj uložené výlety bez signálu ostávajú zadarmo navždy."
    >
      <ul className="!list-none !pl-0 flex flex-col gap-3">
        {FEATURES.map((f) => (
          <li key={f.title} className="!mt-0 rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-3">
            <p className="font-semibold"><T>{f.title}</T></p>
            <p className="text-[var(--muted)]"><T>{f.text}</T></p>
          </li>
        ))}
      </ul>

      <section className="flex flex-col gap-3 rounded-xl bg-[var(--sun-soft)] p-4">
        <p className="text-center">
          <span className="text-3xl font-extrabold"><T>9,99 €</T></span> <span className="font-semibold"><T>ročne</T></span>
        </p>
        <p className="text-center text-[var(--muted)]"><T>Menej ako jeden deň parkovania v Tatrách.</T></p>
        <PlusWant />
      </section>

      <p className="text-xs text-[var(--muted)]">
        <T>Túruj+ zatiaľ len pripravujeme. Poradie výletov sa nedá kúpiť, ani s Túruj+.</T>
      </p>
    </InfoPage>
  );
}
