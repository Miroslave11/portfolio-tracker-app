# Přehled funkcí

Co aplikace umí, **jak to počítá** a kde to v kódu najdeš. Návod k ovládání je v
[uživatelském návodu](06-uzivatelsky-navod.md), architektura v
[technické dokumentaci](08-technicka-dokumentace.md).

Značky **P1–P28** jsou čísla vývojových „přírůstků“ (viz [historie](#historie-vývoje-přírůstky-p1p28)).
Každý výpočet je v `src/core/` jako **čistá funkce** (bez Electronu, bez diskového ani síťového přístupu),
takže jde snadno testovat.

## Obsah

- [Mapa funkcí](#mapa-funkcí)
- [Data a import](#data-a-import)
- [Kurzy a měny](#kurzy-a-měny)
- [Hodnota portfolia](#hodnota-portfolia)
- [Výkon: TTWROR a IRR](#výkon-ttwror-a-irr)
- [Riziko a srovnání s indexem](#riziko-a-srovnání-s-indexem)
- [Alokace a cílová alokace](#alokace-a-cílová-alokace)
- [Daně](#daně)
- [Cíl, Monte Carlo a čerpání](#cíl-monte-carlo-a-čerpání)
- [Inflace](#inflace)
- [Shrnutí portfolia a AI](#shrnutí-portfolia-a-ai)
- [Export a zálohy](#export-a-zálohy)
- [Ostatní funkce](#ostatní-funkce)
- [Historie vývoje (přírůstky P1–P28)](#historie-vývoje-přírůstky-p1p28)

## Mapa funkcí

```
                            +-----------------------------+
                            |         TRANSAKCE           |
                            | (import PP / ruční zápis)   |
                            +--------------+--------------+
                                           |
              +----------------------------+-----------------------------+
              |                            |                             |
              v                            v                             v
     +----------------+          +-------------------+         +-------------------+
     | Pozice, hodnota|          |  Investice po     |         |  FIFO loty a      |
     | v čase         |          |  měsících, plán   |         |  časový test      |
     +--------+-------+          +---------+---------+         +---------+---------+
              |                            |                             |
   kurzy (Yahoo) + ČNB + Eurostat          |                             v
              |                            |                      Daně (informativně)
              v                            v
     +----------------+          +-------------------+
     | Výkon: TTWROR, |          | Měsíční nákup,    |
     | IRR, riziko,   |          | cílová alokace    |
     | benchmark      |          | (dokupování)      |
     +--------+-------+          +-------------------+
              |
              v
     +----------------+     +------------------+     +------------------+
     | Cíl: projekce, |     | Shrnutí (články) |---->| Texty od AI +    |
     | Monte Carlo,   |     | za měsíc ... rok |     | PDF článku       |
     | čerpání        |     +------------------+     +------------------+
     +----------------+
```

---

## Data a import

| Funkce                             | Popis                                                                                                                                                                                                                                             | Kód                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **Datový model**                   | Účet (broker), cenný papír (kotace ETF), transakce (nákup, prodej, vklad, výběr, dividenda, poplatek). Vše validuje schéma `zod`.                                                                                                                 | `src/shared/model.ts`                                     |
| **Import z Portfolio Performance** | Čte JSON export (`version: 1`), převede typy, sloučí účty a ukáže **náhled** s upozorněními. Nic neukládá, dokud uživatel nepotvrdí.                                                                                                              | `src/core/import-pp.ts`, `src/main/portfolio-store.ts`    |
| **Normalizace při importu**        | Hotovostní a cenný účet brokera se sloučí do jednoho účtu; odstraní se mezery v názvech; chybějící ISIN se doplní z katalogu; stejný fond na dvou burzách se pozná podle ISIN; ticker se bere z dat, ne z názvu; ETF se zařadí do skupiny indexu. | `src/core/import-pp.ts`, `src/core/securities-catalog.ts` |
| **Ruční zápis**                    | Formulář pro nákup/prodej/vklad/výběr/dividendu, z dvou polí (kusy, cena, částka) se dopočítá třetí; automaticky vzniká **vyrovnávací vklad** (vazba `linkedId`).                                                                                 | `src/core/transaction-edit.ts`, `src/core/trade-math.ts`  |
| **Měsíční nákup**                  | Šablona pravidelného nákupu, hromadný zápis, připomenutí od zvoleného dne v měsíci.                                                                                                                                                               | `src/core/monthly-plan.ts`, `MonthlyDialog.tsx`           |
| **Zálohy**                         | Před každou změnou se zkopíruje `portfolio.json` do `backups/` (posledních 30). Zápisy jsou **atomické** (dočasný soubor, pak přejmenování).                                                                                                      | `src/main/portfolio-store.ts`, `src/main/json-file.ts`    |

Typy transakcí z Portfolio Performance, které aplikace nezná, se **přeskočí a nahlásí** v náhledu
(`skippedTypes`).

---

## Kurzy a měny

| Zdroj                                     | Co                                                                | Jak často                                                                   | Kód                                                     |
| ----------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------- |
| **Yahoo Finance** (neoficiální chart API) | Denní zavírací kurzy ETF (podle `yahooTicker`), historie dividend | při spuštění a každou hodinu; přepočítává se posledních 7 dní kvůli opravám | `src/core/prices/yahoo.ts`, `src/main/price-service.ts` |
| **ČNB**                                   | Denní kurz EUR/CZK (roční textové soubory)                        | stejně                                                                      | `src/core/prices/cnb.ts`                                |
| **Eurostat** (HICP)                       | Měsíční index spotřebitelských cen: eurozóna a Česko              | nejvýš jednou za 12 hodin                                                   | `src/core/prices/hicp.ts`                               |

Vše se ukládá do `prices.json` jako **odvozená data** (poškozený soubor se zahodí a stáhne znovu). Bez
internetu se používají poslední uložené kurzy. Chybu spojení aplikace rozliší od chyby serveru a při
HTTP 429 a 5xx zkusí požadavek znovu.

```
 Hodnota v CZK v daný den = hodnota v EUR  x  kurz ČNB platný v ten den
                            (kurz zpětně: poslední zveřejněný <= den)
```

---

## Hodnota portfolia

Modul `src/core/portfolio-calc.ts` vytvoří **denní řadu** z transakcí a kurzů:

```
 den:           1      2      3      4      5      6
 kusy ETF:      0     10     10     12     12     12      <- podle nákupů/prodejů
 kurz:          -     100    102    101    105    104     <- poslední kurz <= den
 hodnota ETF:   0    1000   1020   1212   1260   1248
 + hotovost:    0       0      0      0      0      0     <- vklady - nákupy (obvykle ~0)
 vloženo:     1000   1000   1000   1200   1200   1200     <- vklady - výběry (kumulativně)
```

- **Hodnota = kusy x kurz + hotovost.** Kurz se bere „poslední známý ≤ den“. Pokud pro ETF kurz není, ocení
  se **cenou posledního obchodu** a výsledek je označen jako odhad.
- **Pozice** (kusy, průměrná pořizovací cena, nerealizovaný zisk) a **souhrn** (hodnota, vloženo, zisk,
  změna za den) se odvozují ze stejné řady.
- Filtr brokera omezí výpočet na vybrané účty.

---

## Výkon: TTWROR a IRR

Modul `src/core/performance.ts`.

### TTWROR (časově vážený výnos)

Spojuje denní výnosy, **vklady a výběry se odečtou** (berou se na konci dne):

```
              hodnota(den) - tok(den)
 r(den) = ---------------------------- - 1          index = (1 + r1) x (1 + r2) x ... x (1 + rn)
              hodnota(předchozí den)                 TTWROR = index - 1
```

Příklad: portfolio vyroste o 10 % a pak po vkladu o 5 %: `1,10 x 1,05 - 1 = 15,5 %`, ať je vklad malý nebo
velký. Odpovídá metodě Portfolio Performance. Začíná-li období prvním vkladem nebo dříve, počítá se od nuly.

### IRR (peněžně vážený výnos, % ročně)

Metoda **XIRR**: roční úroková sazba, při které je čistá současná hodnota všech toků (vklady záporně,
výběry a konečná hodnota kladně) rovna nule. Bere v úvahu, **kdy** a **kolik** se vložilo.

### Další výstupy

- **Absolutní zisk** = konec - začátek - čisté vklady.
- **Po letech** (`performanceByYear`): zisk, TTWROR a IRR pro každý kalendářní rok.
- **Období**: 1M, 3M, YTD, 1R, 3R, 5R, Max, kalendářní rok a vlastní rozsah (`resolvePeriod`).

---

## Riziko a srovnání s indexem

### Riziko (`src/core/risk.ts`)

Počítá se z křivky výkonu (bez vlivu vkladů): největší propad (od vrcholu ke dnu), doba zotavení,
**roční kolísavost** (směrodatná odchylka **měsíčních** výnosů x √12; při málo datech se nezobrazí),
nejhorší a nejlepší měsíc a rok, tabulka největších propadů.

```
 výkon
   ^        vrchol
   |          /\          /\
   |         /  \        /  \_____ návrat na vrchol = konec propadu
   |        /    \      /
   |       /      \    /
   |      /        \  /        <- hloubka propadu = (dno / vrchol) - 1
   |     /          \/ dno
   +------------------------------------------> čas
```

### Benchmark (`src/core/benchmark.ts`)

„Co kdybys každý vklad hned koupil v jednom indexovém ETF?“ Pro každý den vezme skutečný vklad (+) nebo
výběr (-) a za stejnou částku nakoupí/prodá kusy benchmarku kurzem toho dne. Dokud benchmark nemá kurz,
leží peníze jako hotovost. Výsledek se porovná s tvým portfoliem (hodnota, TTWROR, IRR, rozdíl).

---

## Alokace a cílová alokace

`src/core/allocation.ts`, `src/core/rebalance.ts`

- **Alokace** po indexech (skupina indexu), konkrétních ETF (ISIN) a brokerech. Kotace téhož fondu se
  slučují podle ISIN.
- **Cílová alokace + dokupování** (rebalancing jen nákupem): měsíční nákup se rozdělí mezi indexy
  **pod cílem** metodou „vyrovnávání hladiny“. Nic se neprodává, aby nevznikala daň.

Princip: každý index má poměr `hodnota / cílová hodnota`. Nejvíc podvážené indexy (nejnižší poměr) se
dokupují první, dokud nedosáhnou úrovně dalšího indexu; pak se nákup dělí mezi oba, atd. Index nad cílem
nedostane nic.

```
 poměr hodnota/cíl                     (ilustrace, ne skutečná čísla)
   ^
 1.1 |                      [C] nad cílem -> nákup 0
 1.0 |- - - - - - - - - - - - - - - - - - - - - - - - -  <- hladina po nákupu
 0.9 |            [B]  ##### dokoupí se do hladiny
 0.8 | [A]  ############### dokoupí se nejvíc (nejvíc pod cílem)
     +---------------------------------------------------->
        (součet nákupů = přesně měsíční nákup, zaokrouhleno na celá eura)
```

Aplikace ukáže také **za kolik měsíců pravidelného dokupování se alokace srovná** (`monthsToTarget`).

---

## Daně

**Informativní** přehled pro české daňové prostředí (časový test 3 roky u cenných papírů). Nenahrazuje
poradce ani přiznání.

### FIFO loty (`src/core/lots.ts`)

Každý **nákup** je „lot“. Každý **prodej** spotřebuje nejstarší loty téhož fondu (**FIFO**). Fond se určuje
podle **ISIN napříč všemi brokery** (daňová evidence je společná). Ve stejný den se nákupy počítají před
prodeji. Zisk prodeje = příjem − pořizovací cena spotřebovaných kusů (poplatky jsou součástí částky).

```
 nákupy (loty):                           prodej 15 ks:
   1.  10 ks  (nejstarší)  ------->        spotřebuje 10 ks z lotu 1
   2.   8 ks               ------->        spotřebuje  5 ks z lotu 2   (zbývá 3 ks)
   3.   5 ks
```

### Časový test (`src/core/time-test.ts`, `lots.ts`)

Prodej je osvobozen, když doba držení **přesáhne 3 roky**: první volný den je **den po třetím výročí**
nákupu (u 29. 2. se výročí bere 28. 2.). Aplikace ukáže:

```
 čas ->   nákup            +3 roky           volný k prodeji
          |------------------|-----------------|-------------------->
          den 0              výročí            den po výročí
                                               (od něj se kusy "uvolní")
```

- Kolik hodnoty je dnes **volné** a kolik čeká, rozpis po fondech a po nákupech, graf uvolňování po letech.
- Ve formuláři prodeje **varování**, pokud FIFO spotřebuje kusy držené kratší dobu než 3 roky.
- **Realizovaný zisk po letech** (příjmy osvobozené a příjmy „k posouzení“).
- Koruny: příjem kurzem ČNB ke dni prodeje, náklad kurzem ke dni nákupu.

---

## Cíl, Monte Carlo a čerpání

### Projekce k cíli (`src/core/goal-projection.ts`)

Konstantní předpoklady: měsíční výnos `(1 + roční)^(1/12) − 1`, vklad se přičítá **na konci měsíce**.
Horizont nejvýš 600 měsíců (50 let), dál se cíl považuje za nedosažitelný. Scénáře ±3 procentní body výnosu.

```
 hodnota
   ^                                     ..... optimistický (+3 p. b.)
   |                              ....../
   |                      ....../    ___ základní předpoklady
   |              ....../____/
   |       ....../___/             cíl ------------------------- <- průsečík = odhad data
   |   ../___/                       ..... pesimistický (-3 p. b.)
   +------------------------------------------------------------> čas
```

### Monte Carlo (`src/core/monte-carlo.ts`, běží ve Web Workeru)

5 000 náhodných vývojů. Měsíční růstový faktor má **log-normální** rozdělení `G = exp(N(m, s²))`, kde
`s = roční kolísavost / √12` a `m` je zvoleno tak, aby střední hodnota `E[G]` odpovídala deterministické
projekci (průměr scénářů = základní projekce; při nulové kolísavosti splývají). Generátor má pevné
**semínko**, takže stejné vstupy dají stejný výsledek. Výstup: percentily 10/25/50/75/90, rok dosažení
cíle s 80% jistotou, **šance dosažení cíle do konce daného roku**. Výchozí kolísavost se bere z historie
portfolia.

```
 hodnota                         pásmo 10-90 %
   ^                               ..::::::::::
   |                      ..:::::::::::::::::: <- horní okraj (90 %)
   |            ..::::::::::####################   medián (50 %) = ####
   |      ..::::#################
   |   .:::::::##########:::::::: <- dolní okraj (10 %)
   +------------------------------------------> čas
```

### Čerpání (`src/core/withdrawal.ts`)

Kolik lze měsíčně vybírat z kapitálu a jak dlouho vydrží. Kapitál se každý měsíc zhodnotí a na konci
měsíce se vybere částka; po celý rok je stejná a na začátku dalšího roku se zvýší o **inflaci**. Daně se
neberou v úvahu. Uzavřený vzorec rostoucí anuity dává nejvyšší čerpání pro daný počet let; „navždy“ je
čerpání, při kterém reálná hodnota kapitálu neklesá.

Varianta **Jen dividendy** (`src/core/dividends.ts`): kapitál se převede do dividendového ETF; z historie
výplat (Yahoo) se spočítá dividendový výnos za 12 měsíců, růst dividend za 5 a 10 let a skutečný celkový
výnos fondu; ukáže se příjem po letech a **férové srovnání** s prodejem podílů při stejném celkovém výnosu.

---

## Inflace

`src/core/inflation.ts`

Přepínač **Po inflaci** přepočte částky z minulosti na **dnešní ceny**: koeficient je
`index(poslední zveřejněný měsíc) / index(měsíc dne)`. Měsíce po posledním zveřejněném mají koeficient 1,
dny před začátkem řady používají první dostupný měsíc. Na obrazovce Cíl se pak počítá s reálným výnosem
`(1 + nominální) / (1 + inflace) − 1` a s nastavitelnou budoucí inflací (výchozí 2,5 %).

---

## Shrnutí portfolia a AI

### Články (`src/core/summary-*.ts`)

| Pojem                           | Význam                                                                                                                                                                             |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Období**                      | `RRRR-MM` (měsíc), `RRRR-Q1..Q4` (kvartál), `RRRR-H1/H2` (pololetí), `RRRR` (rok).                                                                                                 |
| **Fakta** (`MonthArticleFacts`) | Spočítaná čísla období: hodnoty, vklady, výkon, ETF a jejich příspěvky, nákupy vs. plán, srovnání s trhem, riziko, cíl, časový test, kurz EUR/CZK. Obsahují i denní řadu pro graf. |
| **Článek**                      | `id` (např. `month-2026-10`), typ, období, čas vytvoření, **uložená fakta** a volitelně AI texty.                                                                                  |
| **Šablonový text**              | Z faktů sestavené `articleHighlights`, `articleCommentary`, `articleOutlook` (V kostce, Komentář, Výhled).                                                                         |
| **Rozsah**                      | Které sekce se zobrazí (Stručný / Standardní / Detailní + vlastní výběr); platí při zobrazení, takže i pro starší články.                                                          |

Fakta se při vytvoření **zmrazí**: článek se sám nemění, aktuální data do něj dostaneš „Vytvořit znovu“.
Články vznikají automaticky po skončení období, jakmile jsou stažené kurzy k jeho konci (dohnání).

### Texty od AI (`src/main/ai-*.ts`, `src/core/summary-ai.ts`)

```
 fakta článku
     |  (věty: "Hodnota portfolia na konci 1 575 EUR ...")
     v
 prompt pro část (V kostce / Komentář / Výhled) + délka + styl
     |
     v
 model:  Ollama (127.0.0.1, streamování)    nebo    Claude Code (claude -p, bez nástrojů)
     |
     v
 kontrola: každé číslo v textu musí být ve faktech
     |            |
   sedí        nesedí --> 1 opravný pokus (upozornění, která čísla)
     |                         |
     v                         v
  uložit část            stále nesedí --> část zahodit, zůstane šablona
```

Kontrola tvaru: počet bodů/odstavců podle části, žádné rady („doporučuji…“). Při nedostupnosti modelu
(neběží Ollama, nepřihlášený Claude Code, vyčerpaný limit) zůstává celý článek na šabloně se srozumitelnou
zprávou.

### PDF článku (`src/core/summary-pdf.ts`)

Z článku se sestaví **samostatné HTML** (A4, bez skriptů a vnějších zdrojů, jen vložené obrázky), grafy
(průběh a rozklad změny) se vykreslí bez okna jako **SVG**, a skrytá okna Electronu uloží HTML jako PDF.
Veškerý text (včetně AI) se escapuje.

---

## Export a zálohy

| Co                     | Formát                                       | Kód                                                            |
| ---------------------- | -------------------------------------------- | -------------------------------------------------------------- |
| Tabulka obrazovky      | **CSV** (`;`, desetinná čárka, UTF-8 s BOM)  | `src/core/csv.ts`, `export-tables.ts`                          |
| Všechna data           | **Excel** (`exceljs`; čísla zůstávají čísly) | `src/main/export-service.ts`                                   |
| Měsíční report, článek | **PDF** (skryté okno `printToPDF`)           | `src/core/report-html.ts`, `summary-pdf.ts`, `src/main/pdf.ts` |
| Záloha                 | kopie `portfolio.json`                       | `src/main/export-handler.ts`                                   |

Cestu k souboru vždy volí uživatel v dialogu uložení; renderer žádnou cestu neposílá.

---

## Ostatní funkce

| Funkce                      | Popis                                                                                     | Kód                                               |
| --------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------- |
| **Paleta příkazů** (Ctrl+K) | Akce, přechod na obrazovky, přepnutí motivu a měny, hledání v transakcích.                | `src/core/command-palette.ts`                     |
| **Zkratky**                 | Ctrl+K, Ctrl+N (nový nákup), Ctrl+M (měsíční nákup).                                      | `src/core/shortcuts.ts`                           |
| **Motivy**                  | 5 motivů a 6 akcentních barev, řízení podle motivu Windows.                               | `src/core/theme.ts`, `useApplyTheme.ts`           |
| **Automatické aktualizace** | Hledání vydání na GitHubu (`electron-updater`), stažení na pozadí, instalace po restartu. | `src/main/updater.ts`                             |
| **Poloha okna**             | Okno se otevře na displeji s kurzorem myši.                                               | `src/main/window-placement.ts`                    |
| **Nastavení**               | Šest částí s podmenu.                                                                     | `src/core/settings-tabs.ts`, `SettingsScreen.tsx` |

---

## Historie vývoje (přírůstky P1–P28)

Aplikace vznikla po **přírůstcích** (číslované kroky: implementace, testy, kontrola, commit). Plány jsou
v [docs/](.) (00–05). Vydání:

| Vydání    | Obsah                                                                                                                              | Přírůstky |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------- |
| **1.0.0** | Rozložení a motivy, data a import, kurzy, Přehled, Výkon, Alokace, Investice, Obchody, zápis transakcí, měsíční nákup, Cíl, balení | P1–P12    |
| **1.1.0** | Daně (FIFO, časový test), riziko, benchmark                                                                                        | P13–P16   |
| **1.2.0** | Inflace, Monte Carlo, čerpání (i jen z dividend)                                                                                   | P17–P19   |
| **1.4.0** | Cílová alokace, export, paleta příkazů, Shrnutí portfolia (měsíc až rok), texty od AI (Ollama, Claude Code), PDF článku            | P20–P28   |
| **1.5.0** | Automatické aktualizace, jen instalátor                                                                                            | —         |
| **1.5.1** | Nastavení rozdělené do částí                                                                                                       | —         |
| **1.5.2** | Srozumitelná instalace aktualizace (okno „Instaluji…“, hláška po aktualizaci)                                                      | —         |

Podrobný seznam změn je v [CHANGELOG.md](../CHANGELOG.md).
