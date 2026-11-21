import Link from "next/link";
import { AppScreens } from "@/components/AppScreens";
import { InfoPage } from "@/components/InfoPage";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Ako Túruj funguje",
  description:
    "Ako s Túruj naplánujete jednodňový výlet do hôr za 5 minút: výber túry, parkovanie, autobus či vlak, čas chôdze a kedy najneskôr vyraziť.",
  path: "/ako-to-funguje",
});

// The home page is a tool with little text; this page says in words what it does (SEO checkers, Peter 2026-10-30).
export default function HowItWorksPage() {
  return (
    <InfoPage
      title="Ako Túruj funguje"
      intro="Túruj je plánovač jednodňových výletov do hôr a prírody na Slovensku. Za päť minút zistíte, kam ísť, ako sa tam dostanete a kedy najneskôr vyraziť."
    >
      <AppScreens />

      <h2>1. Vyberte, odkiaľ vyrážate a kedy</h2>
      <p>
        Na úvodnej stránke zadajte mesto alebo miesto, odkiaľ pôjdete, a vyberte deň: dnes, zajtra alebo iný. Túruj
        zoradí tisíce výletov podľa toho, ako ďaleko sú a koľko trvajú. Výlety, ktoré by ste v ten deň nestihli za
        svetla, zostanú v zozname, len sivé, aby ste o nich vedeli.
      </p>

      <h2>2. Nájdite výlet, ktorý vám sedí</h2>
      <p>
        Hľadajte podľa cieľa: vrchol, hrad, vodopád, pleso, jaskyňa, roklina, vyhliadka alebo horská chata. Zapnite
        „Idete s deťmi?“ a uvidíte ľahšie trasy a dlhšie časy chôdze. Na mape vidíte všetky výlety naraz, farba čiary
        ukazuje, ako je miesto známe. Ak bývate v jednom z väčších miest, nájdete aj stránku{" "}
        <Link href="/vylety-z">výletov okolo vášho mesta</Link>.
      </p>

      <h2>3. Všetko o túre na jednom mieste</h2>
      <p>Každý výlet má vlastnú stránku. Nájdete na nej:</p>
      <ul>
        <li>dĺžku, stúpanie a čas chôdze tam aj späť, aj pre pomalšie tempo s deťmi,</li>
        <li>kde zaparkovať, či je parkovisko platené a koľko je od neho na štart,</li>
        <li>najbližšiu zastávku autobusu alebo stanicu vlaku a cestu od nej pešo,</li>
        <li>čas cesty autom z vášho mesta a kedy najneskôr vyraziť, aby ste sa vrátili za svetla,</li>
        <li>počasie na deň výletu, sezónne uzávery chodníkov v TANAP-e a vstupné, ak ho poznáme,</li>
        <li>chaty, pramene a vyhliadky po ceste a ďalšie trasy na to isté miesto.</li>
      </ul>

      <h2>4. Uložte si plán a vyrazte</h2>
      <p>
        Tlačidlom „Uložiť výlet“ si plán uložíte do mobilu aj s mapou, takže ho otvoríte aj bez signálu v horách.
        Plán pošlete partii jedným odkazom. Navigáciu na parkovisko otvoríte v Google Mapách alebo Mapy.com a
        trasu si môžete stiahnuť ako súbor GPX.
      </p>

      <h2>Odkiaľ sú údaje</h2>
      <p>
        Trasy, značky, parkoviská a zastávky berieme z OpenStreetMap a každý týždeň ich obnovujeme. Fotky miest sú z
        Wikimedia Commons, výšky z digitálneho modelu terénu a časy chôdze počítame podľa normy, z ktorej vychádzajú aj
        turistické smerovníky. Podrobnosti sú na stránkach <Link href="/o-nas">O nás</Link> a{" "}
        <Link href="/zdroje">Zdroje</Link>.
      </p>

      <h2>Čo Túruj stojí</h2>
      <p>
        Nič. Túruj je zadarmo, bez registrácie a bez reklám a poradie výletov si nikto nemôže kúpiť. Časy sú odhad pre
        bežného turistu, počasie a stav chodníka si pred odchodom vždy overte. Našli ste chybu?{" "}
        <Link href="/nahlasit-chybu">Dajte nám vedieť</Link>.
      </p>
    </InfoPage>
  );
}
