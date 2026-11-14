# Uživatelský návod

Tento návod popisuje, jak se Portfolio Tracker používá. Je psaný pro člověka, který aplikaci vidí poprvé
nebo se k ní vrací po delší době. Jak je aplikace postavená uvnitř, popisuje
[technická dokumentace](08-technicka-dokumentace.md), přehled všech funkcí je v
[přehledu funkcí](07-prehled-funkci.md).

## Obsah

1. [K čemu aplikace slouží](#1-k-čemu-aplikace-slouží)
2. [Instalace a první spuštění](#2-instalace-a-první-spuštění)
3. [První kroky: naplnění daty](#3-první-kroky-naplnění-daty)
4. [Okno aplikace](#4-okno-aplikace)
5. [Obrazovky](#5-obrazovky)
6. [Zápis obchodů a měsíční nákup](#6-zápis-obchodů-a-měsíční-nákup)
7. [Shrnutí portfolia a texty od AI](#7-shrnutí-portfolia-a-texty-od-ai)
8. [Cíl, projekce a čerpání](#8-cíl-projekce-a-čerpání)
9. [Export a zálohy](#9-export-a-zálohy)
10. [Nastavení](#10-nastavení)
11. [Aktualizace aplikace](#11-aktualizace-aplikace)
12. [Klávesové zkratky](#12-klávesové-zkratky)
13. [Řešení problémů](#13-řešení-problémů)
14. [Co aplikace neumí a upozornění](#14-co-aplikace-neumí-a-upozornění)

---

## 1. K čemu aplikace slouží

Portfolio Tracker je **desktopová aplikace pro Windows** pro člověka, který dlouhodobě investuje do ETF
(třeba každý měsíc jednou) u jednoho nebo více brokerů. Odpovídá na otázky:

- Kolik mám teď v portfoliu a kolik jsem do něj vložil?
- Jaký je skutečný výkon (nezkreslený tím, že jsem průběžně vkládal)?
- Kolik jsem měsíčně investoval, a drželo se to plánu?
- Jak je portfolio rozložené a jak daleko jsem od cíle?
- Co bych při prodeji musel řešit kvůli tříletému časovému testu?

Všechny údaje zůstávají **jen na tvém počítači**. Aplikace z internetu stahuje pouze veřejné kurzy
(Yahoo Finance, ČNB, Eurostat) a hledá novou verzi aplikace na GitHubu. Na žádný server neodesílá tvoje
transakce. Jedinou výjimkou je volitelné psaní textů pomocí AI přes Claude (viz [kapitola 7](#7-shrnutí-portfolia-a-texty-od-ai)).

```
   tvoje transakce          kurzy z internetu            aplikace spočítá
 (export z Portfolio  +   (Yahoo, ČNB, Eurostat)   =   hodnotu, výkon, alokaci,
  Performance nebo                                     daně, cíl, shrnutí ...
  ruční zápis)
```

> **Nejde o finanční ani daňové poradenství.** Výpočty jsou informativní a zjednodušené.

## 2. Instalace a první spuštění

1. Na stránce **Releases** repozitáře stáhni `portfolio-tracker-<verze>-setup.exe` (nejnovější vydání).
2. Spusť instalátor. Instaluje se jen pro aktuálního uživatele (bez práv správce) do
   `%LOCALAPPDATA%\Programs\portfolio-tracker`, můžeš zvolit jinou složku.
3. Aplikace **není digitálně podepsaná**, takže Windows (SmartScreen) při prvním spuštění může zobrazit
   „Windows ochránil váš počítač“. Klikni na **Další informace → Přesto spustit**.
4. Pokud používáš antivirus (např. Avast) a instalátor se nespustí s hláškou o přístupu, podívej se do
   [řešení problémů](#13-řešení-problémů).

Při prvním spuštění je aplikace prázdná. Data se ukládají do složky
`%APPDATA%\portfolio-tracker` (tvoje transakce, stažené kurzy, nastavení, uložená shrnutí a zálohy).
Instalace, aktualizace ani odinstalace tuto složku nemažou.

## 3. První kroky: naplnění daty

Aplikace potřebuje transakce. Dvě cesty:

```
                  +------------------------------+
                  |   Prázdná aplikace           |
                  +--------------+---------------+
                                 |
              +------------------+------------------+
              |                                     |
   A) Import z Portfolio Performance      B) Ruční zápis obchodů
      (celá historie najednou)               (Obchody -> Nový nákup)
              |                                     |
              v                                     v
      Náhled importu: co se našlo,          Formulář: broker, ETF, datum,
      co se upravilo, varování              kusy a částka (třetí se dopočítá)
              |                                     |
      Potvrdit -> data se uloží             Uložit -> data + automatický vklad
              \                                     /
               +----------------+-----------------+
                                v
                  Aplikace stáhne kurzy a spočítá vše
```

**A) Import.** Na prázdném Přehledu (nebo na obrazovce Obchody) klikni na **Importovat** a vyber JSON
export z [Portfolio Performance](https://www.portfolio-performance.info/) (Soubor → Export → JSON).
Aplikace nejdřív ukáže **náhled**: počet transakcí podle typu, účty, nalezená ETF, součet vkladů a
nákupů a seznam upozornění (např. ETF bez ISIN). Teprve po potvrzení se data uloží. Pokud už nějaká
data máš, import je **nahradí** (předtím se zazálohují).

**Vyzkoušení bez vlastních dat.** V repozitáři je vymyšlený soubor
`examples/ukazka-portfolio-performance.json` (3 účty, 4 ETF, nákupy 2023–2026, jeden prodej). Importuj ho
stejným tlačítkem. Ceny se dopočítají z aktuálních kurzů, které aplikace stáhne.

**B) Ruční zápis.** Viz [kapitola 6](#6-zápis-obchodů-a-měsíční-nákup).

Po importu aplikace sama stáhne kurzy (viz [ETF a kurzy](#etf-a-kurzy)); při prvním stažení to může
trvat několik sekund.

## 4. Okno aplikace

```
+-------------+--------------------------------------------------------------+
| Portfolio   | [ Pruh: "Nová verze X je stažená - Restartovat..." ]         |
| Tracker     |  (zobrazí se jen při aktualizaci)                            |
|             +--------------------------------------------------------------+
| > Přehled   | Titulek obrazovky   [Vše|Freedom24|XTB|Degiro] [EUR|CZK]     |
|   Shrnutí   |                     [Po inflaci]  [Ctrl+K]                   |
|   Výkon     +--------------------------------------------------------------+
|   Alokace   |                                                              |
|   Investice |                                                              |
|   Obchody   |                  obsah vybrané obrazovky                     |
|   Daně      |                                                              |
|   ETF a     |                                                              |
|   kurzy     |                                                              |
|   Cíl       |                                                              |
|   Nastavení |                                                              |
+-------------+--------------------------------------------------------------+
```

Horní lišta platí pro většinu obrazovek:

| Ovládací prvek                     | Co dělá                                                                                                                            |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Vše / Freedom24 / XTB / Degiro** | Filtr brokera: všechny pohledy se spočítají jen z vybraného brokera. (Obrazovka Cíl a Shrnutí počítají vždy z celého portfolia.)   |
| **EUR / CZK**                      | Měna zobrazení. Koruny se počítají kurzem ČNB platným v daný den (u hodnoty portfolia v čase) nebo dnešním kurzem.                 |
| **Po inflaci**                     | Přepočte hodnoty na dnešní ceny podle inflace (Eurostat HICP; eurozóna pro EUR, Česko pro Kč). Funguje na Přehledu, Výkonu a Cíli. |
| **Ctrl+K**                         | Paleta příkazů: rychlé akce, přechod na obrazovky, hledání v transakcích.                                                          |

## 5. Obrazovky

### Přehled

Hlavní obrazovka. Nahoře čtyři karty: **Hodnota portfolia**, **Vloženo**, **Zisk** a **Změna za den**
(bez vlivu vkladů). Pod nimi:

- **graf hodnoty portfolia v čase** proti vloženému kapitálu (přepínač období: 1R, 3R, 5R, Max),
- **Pozice**: tabulka ETF (kusy, hodnota, podíl, nerealizovaný zisk),
- **Poslední obchody**,
- **upozornění na měsíční nákup**, pokud jsi v tomto měsíci ještě nic nenakoupil (od dne nastaveného v šabloně).

Když u ETF chybí stažený kurz, ocení se cenou posledního obchodu (aplikace to u takových hodnot
označuje jako odhad).

### Shrnutí

Uložené „články“ o vývoji portfolia za měsíc, kvartál, pololetí a rok. Podrobně v
[kapitole 7](#7-shrnutí-portfolia-a-texty-od-ai).

### Výkon

Jak si portfolio skutečně vedlo, **bez vlivu vkladů**.

- **TTWROR** (časově vážený výnos): „jak by dopadla koruna, kterou jsem vložil hned na začátku“. Nezávisí na
  tom, kdy a kolik jsi vkládal.
- **IRR** (peněžně vážený výnos, % ročně): „jakým úrokem se zhodnotily moje peníze“ včetně načasování
  vkladů. Je to jako spořicí účet, který by dopadl stejně jako tvoje portfolio.
- **Absolutní zisk** = konec − začátek − čisté vklady.
- Graf kumulativního výkonu, tabulka po letech, karta **Jak to číst**.
- **Riziko** (karta pod grafem): největší propad, doba zotavení, roční kolísavost, nejhorší měsíc a rok,
  graf propadu od vrcholu, tabulka největších propadů.
- **Srovnání s benchmarkem**: „co kdybys každý vklad dal do jednoho indexového ETF“. Výchozí je MSCI World
  (EUNL.DE), jde zvolit ETF z portfolia nebo vlastní Yahoo ticker.

Období se volí tlačítky (1M, 3M, YTD, 1R, 3R, 5R, Max), kalendářním rokem nebo vlastním rozsahem dat.

### Alokace

Rozložení portfolia: **koláč podle indexu**, podle konkrétních ETF (ISIN) nebo podle brokera. ETF, která
sledují stejný index (např. tři různá ETF na S&P 500), se sloučí do jedné skupiny. Skupinu indexu a barvu
ETF můžeš upravit.

**Cílová alokace:** zadáš cílové podíly podle indexu (např. 60 % MSCI World, 40 % S&P 500). Aplikace ukáže
odchylky a **rozdělí tvůj měsíční nákup jen dokupováním**: nejvíc podvážené indexy se doplňují první, nic
se neprodává (prodej by mohl znamenat daň). Součástí je odhad, za kolik měsíců se alokace srovná.

### Investice

Kolik jsi kdy nakupoval: **sloupcový graf po měsících rozdělený podle brokera**, roční součty, průměr a
medián za 12 měsíců, tabulka.

### Obchody

Tabulka všech transakcí s hledáním, filtry (typ, ETF, období) a řazením. U nákupu se ukazuje aktuální zisk
a dá se přepnout na koruny. Transakci lze **upravit** nebo **smazat**. Odtud se také otevírají zápisové
formuláře ([kapitola 6](#6-zápis-obchodů-a-měsíční-nákup)) a import.

### Daně

**Informativní** přehled podle českých pravidel pro ETF (časový test 3 roky). Podrobnosti jsou v části
[Daně v přehledu funkcí](07-prehled-funkci.md#daně).

- **Realizovaný zisk:** u každého prodeje se spotřebují nejstarší nákupy téhož fondu (**FIFO**, fond se
  pozná podle ISIN napříč brokery). Tabulka po letech, příjmy z prodejů, příjmy „k posouzení“ (nepokryté
  časovým testem) a detail prodejů s rozbalením použitých nákupů.
- **Časový test 3 roky:** které kusy jsou už **volné k prodeji bez daně** (od dne po třetím výročí
  nákupu), kolik hodnoty se uvolní v dalších letech (graf), nejbližší uvolnění, rozpis po fondech a po
  jednotlivých nákupech.
- Ve formuláři prodeje se objeví **upozornění**, když by prodej podle FIFO zahrnul kusy držené kratší dobu
  než 3 roky (uložení neblokuje).

### ETF a kurzy

Seznam ETF v portfoliu a **stav kurzů**: kdy se naposledy stáhly, zda je co aktualizovat, kurz EUR/CZK
(ČNB). Tlačítkem „Aktualizovat kurzy“ se stažení spustí ručně. Automatické stahování probíhá při spuštění
a pak každou hodinu (lze vypnout v Nastavení → Obecné). Bez internetu se použijí naposledy stažené kurzy.

### Cíl

Viz [kapitola 8](#8-cíl-projekce-a-čerpání).

### Nastavení

Viz [kapitola 10](#10-nastavení).

## 6. Zápis obchodů a měsíční nákup

### Nový obchod (Ctrl+N)

Obrazovka Obchody → **Nový nákup** (nebo prodej, vklad, výběr). Vybereš **brokera → ETF** (naposledy
použité je nahoře), **datum** (výchozí je dnes), a ze tří polí **kusy / cena za kus / celková částka** stačí
zadat dvě, třetí se dopočítá. Kurz k danému datu se předvyplní z uložených kurzů.

**Automatický vklad:** u nákupu se zároveň vytvoří odpovídající **vklad** na účet brokera (stejné datum a
částka), takže hotovost na účtu zůstává ~0 (stejně jako v Portfolio Performance po importu). Při smazání nákupu
se smaže i jeho automatický vklad.

Před každým zápisem, úpravou, smazáním i importem se data **zazálohují** (viz
[zálohy](#9-export-a-zálohy)).

### Měsíční nákup (Ctrl+M)

Pokud nakupuješ pravidelně, nastav si **šablonu** (Nastavení → Šablony): které ETF u kterého brokera a
typicky kolik kusů nebo za jakou částku, plus den v měsíci, od kterého má aplikace připomínat chybějící
nákup. Pak stačí v měsíci jedním formulářem **zapsat celý měsíční nákup naráz** (kusy a částky můžeš
upravit). Šablonu lze předvyplnit i z cílové alokace (kapitola Alokace).

## 7. Shrnutí portfolia a texty od AI

**Shrnutí** jsou ucelené „články“ o vývoji portfolia za jedno období. Typy: **měsíc, kvartál, pololetí, rok**.

```
  skončí období (např. říjen)
          |
          v
  aplikace při spuštění zjistí, že chybí článek a že jsou stažené kurzy k jeho konci
          |
          v
  spočítá "fakta" (hodnota, vklady, výkon, ETF, nákupy, srovnání s trhem, riziko, cíl ...)
          |
          v
  uloží článek tak, jak byl vytvořen  ----->  summaries.json
          |
          +--> (volitelně) AI dopíše texty V kostce / Komentář / Výhled
```

- Článek se **uloží tak, jak vznikl**, a pak se sám nemění. Aktuální data do něj dostaneš tlačítkem
  **Vytvořit znovu**.
- Starší období se dohonit tlačítkem **Vytvořit zpětně** (od první transakce).
- Obsah článku (sekce) se nastavuje v **Nastavení → Umělá inteligence → Shrnutí portfolia** (rozsah
  _Stručný / Standardní / Detailní_ a zaškrtávání jednotlivých sekcí; zvlášť pro měsíc, kvartál, pololetí a
  rok). Změna rozsahu platí hned i pro starší články.
- Tlačítko **PDF** uloží článek jako A4 se stejnými sekcemi a grafy.
- Zobrazení: **Článek** (vlevo seznam po letech) nebo **Seznam** (jako blog, s filtrem typu).

### Texty od AI (volitelné)

Bez AI se texty sestaví ze **šablon**: je to strohé, ale vždy funguje. S AI se může „V kostce“, „Komentář“ a
„Výhled“ napsat plynuleji. Zapíná se v **Nastavení → Umělá inteligence**:

| Poskytovatel            | Jak funguje                                                                                            | Soukromí                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| **Ollama (lokálně)**    | Model běží na tvém počítači (Ollama, ollama.com). Aplikace komunikuje jen s `127.0.0.1`.               | Nic neopouští počítač.                       |
| **Claude (předplatné)** | Aplikace spustí nainstalovaný **Claude Code** (`claude -p`) a využije tvoje předplatné, bez API klíče. | **Fakta o portfoliu se odešlou Anthropicu.** |

**Pravidlo důvěry:** _čísla vždy počítá aplikace, AI jen píše text._ Každé číslo v textu od AI se
zkontroluje proti spočítaným faktům. Pokud nějaké nesedí, model dostane jeden opravný pokus; pak se
dotyčná část **zahodí** a zůstane šablona. Kolik částí AI napsala a které zamítla, je vidět v hlavičce
článku. Nastavit lze, **co AI píše**, **délku komentáře** (krátký / střední / dlouhý) a **styl**
(věcný / přátelský).

Texty píše AI při vytvoření nového článku automaticky, u starších jde o tlačítko **Napsat AI**. Přes Claude
trvá psaní desítky sekund, lokální model na pomalejším počítači i několik minut.

## 8. Cíl, projekce a čerpání

Obrazovka **Cíl** odpovídá na „kdy se dostanu na svoji cílovou částku?“.

- **Nastavení cíle:** cílová částka v Kč, měsíční vklad v EUR, očekávaný roční výnos (a případně inflace
  a kolísavost). Hodnoty se ukládají do nastavení.
- **Postup k cíli:** aktuální hodnota v Kč (kurzem ČNB), procenta cíle, kolik chybí.
- **Projekce:** graf budoucí hodnoty při zadaných předpokladech a **odhad data dosažení**. Scénáře
  výnosu ±3 procentní body ukazují citlivost na předpoklady.
- **Monte Carlo:** 5 000 simulovaných vývojů s náhodným kolísáním trhu. Pásma 10–90 % a 25–75 %, medián,
  rok, kdy jsi v cíli s 80% jistotou, a šance na dosažení cíle podle roku. Počítá se na pozadí.
- **Kalkulačka čerpání:** kolik lze měsíčně čerpat z cíle, z dnešní hodnoty nebo z vlastní částky (pravidlo
  4 %, jak dlouho kapitál vydrží, čerpání podle délky 20–50 let i „navždy“). Čerpání se každý rok zvyšuje o
  inflaci. Varianta **Jen dividendy** počítá s přesunem do dividendového ETF (výchozí SCHD) a čerpáním jen
  čistých dividend; historie výplat se stahuje z Yahoo.

Všechny výpočty jsou **orientační zjednodušené modely** (konstantní předpoklady, bez daní u projekce).

## 9. Export a zálohy

**Export** (tlačítko **Export** na obrazovkách Investice, Obchody a Daně):

| Co                           | Formát                                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| Tabulka z aktuální obrazovky | **CSV** (oddělovač „;“, česká čísla a diakritika pro Excel)                                  |
| Všechna data                 | **Excel** (listy Transakce, Měsíční investice, Pozice, Výkon po letech, Realizované prodeje) |
| Měsíční report               | **PDF** (A4: souhrn, investice, pozice, výkon)                                               |
| Záloha dat                   | kopie `portfolio.json` do zvolené složky                                                     |

**Automatické zálohy:** před každým zápisem, úpravou, smazáním i importem se uloží kopie `portfolio.json` do
`%APPDATA%\portfolio-tracker\backups\` (drží se **posledních 30**). Zálohu vrátíš tak, že ji zkopíruješ jako
`portfolio.json` do složky s daty (aplikace musí být zavřená). Složky otevřeš v **Nastavení → Data a
zálohy**.

## 10. Nastavení

Nastavení má vlevo podmenu a vpravo vždy jednu část:

```
+----------------------+---------------------------------------------+
| Vzhled               |  (obsah vybrané části)                      |
| Obecné               |                                             |
| Šablony              |                                             |
| Umělá inteligence    |                                             |
| Data a zálohy        |                                             |
| Aplikace             |                                             |
+----------------------+---------------------------------------------+
```

| Část                  | Obsah                                                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vzhled**            | Motiv (Tmavý, Světlý, Půlnoční modrá, OLED černá, Teplý), akcentní barva (Indigo, Smaragd, Nebeská, Jantar, Růže a další), řízení podle motivu Windows. |
| **Obecné**            | Výchozí měna zobrazení, automatické stahování kurzů.                                                                                                    |
| **Šablony**           | Šablona měsíčního nákupu (ETF, broker, kusy/částka, den připomenutí).                                                                                   |
| **Umělá inteligence** | Poskytovatel AI (Ollama / Claude), modely, co AI píše, délka a styl; pod tím nastavení **Shrnutí portfolia** (rozsah sekcí a automatické vytváření).    |
| **Data a zálohy**     | Otevření složky s daty a se zálohami, informace o zálohování.                                                                                           |
| **Aplikace**          | Verze, aktualizace (přepínač, ruční kontrola), odkaz na GitHub.                                                                                         |

## 11. Aktualizace aplikace

Nainstalovaná aplikace při spuštění a pak **každé 4 hodiny** hledá novější vydání na GitHubu. Nalezené
vydání **stáhne na pozadí**, a pak ukáže pruh **„Restartovat a nainstalovat“**.

```
   hledá (při startu / co 4 h / ručně)
        |
        +--> nic nového ----------------------> "Máš nejnovější verzi."
        |
        +--> nová verze --> stahuje na pozadí --> pruh "Restartovat a nainstalovat"
                                                         |
                                  klik (nebo zavření aplikace)
                                                         |
                                                         v
                               okno "Instaluji verzi X..." (aplikace se zavře)
                                                         |
                                                         v
                               okno instalátoru s průběhem -> "Dokončit"
                                                         |
                                                         v
                               aplikace se spustí, zpráva "Aktualizováno na X"
```

- Ruční kontrola je v **Nastavení → Aplikace** (funguje i při vypnutém automatickém hledání).
- Při aktualizaci se **data nemění**.
- Při vývoji (`npm run dev`) a v přenosné verzi se aktualizace nehledají.
- Aktualizace se ověřují **kontrolním součtem** z vydání, ale aplikace není digitálně podepsaná.

## 12. Klávesové zkratky

| Zkratka    | Akce                                                                            |
| ---------- | ------------------------------------------------------------------------------- |
| **Ctrl+K** | Paleta příkazů (akce, přechod na obrazovku, motiv, měna, hledání v transakcích) |
| **Ctrl+N** | Nový nákup                                                                      |
| **Ctrl+M** | Měsíční nákup                                                                   |
| **Esc**    | Zavřít okno, nabídku nebo paletu                                                |

## 13. Řešení problémů

| Problém                                                                                      | Příčina a řešení                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Instalátor se nespustí, Windows hlásí „nemá přístup k určenému zařízení, cestě nebo souboru“ | Nejspíš ho blokuje antivirus (např. Avast, nepodepsaný soubor) nebo příznak „stažený z internetu“. Pravým tlačítkem na soubor → Vlastnosti → **Odblokovat**; v antiviru soubor obnov z karantény a přidej výjimku. |
| SmartScreen „Windows ochránil váš počítač“                                                   | Aplikace není podepsaná. **Další informace → Přesto spustit.**                                                                                                                                                     |
| Hodnota u ETF je označená jako odhad                                                         | Chybí stažený kurz; použila se cena posledního obchodu. Na obrazovce ETF a kurzy stáhni kurzy.                                                                                                                     |
| Kurzy se nestahují                                                                           | Žádný internet, proxy nebo Yahoo omezil počet dotazů (HTTP 429). Aplikace zkusí znovu; mezitím používá uložené kurzy.                                                                                              |
| Po importu chybí hodnota v Kč                                                                | Chybí kurz ČNB; stáhni kurzy v ETF a kurzy.                                                                                                                                                                        |
| Soubor `portfolio.json` je poškozený                                                         | Aplikace ho potichu nepřepíše a napíše chybu. Zkopíruj poslední dobrou zálohu z `backups\` jako `portfolio.json`.                                                                                                  |
| AI píše „Ollama neběží“                                                                      | Spusť aplikaci Ollama a ověř, že je stažený zvolený model (`ollama pull <model>`).                                                                                                                                 |
| AI přes Claude píše „nepřihlášený“                                                           | V terminálu spusť `claude auth login` a přihlas se předplatným. Přihlášení přes API klíč aplikace odmítne (platilo by se z API).                                                                                   |
| Okno aplikace se otevírá na „špatném“ monitoru                                               | Okno se otevře na displeji, kde je při spuštění kurzor myši.                                                                                                                                                       |
| Aktualizace nefunguje                                                                        | Podívej se do Nastavení → Aplikace, kde je pod tlačítkem text chyby. Při blokování antivirem přidej výjimku pro `%LOCALAPPDATA%\Programs\portfolio-tracker` a `%LOCALAPPDATA%\portfolio-tracker-updater`.          |

## 14. Co aplikace neumí a upozornění

- **Je to osobní nástroj**, ne poradce. Daňové i investiční výpočty jsou informativní.
- **Jen Windows.** Instalátor se sestavuje pro Windows (x64).
- **Hodnoty počítá v EUR** (měna kurzů ETF z evropských burz); koruny jsou přepočet kurzem ČNB.
- **Broker v horním filtru** je zatím pevně Freedom24, XTB, Degiro (viz
  [známá omezení](08-technicka-dokumentace.md#14-známá-omezení-a-technický-dluh)). Transakce od jiných
  brokerů se naimportují, ale v horním filtru se vybírají jen pod „Vše“.
- **Neumí import výpisů přímo z brokerů** (CSV/XLSX z XTB, Degiro, Freedom24). Jediný vstup je JSON z
  Portfolio Performance nebo ruční zápis.
- **Kurzy jsou z neoficiálního rozhraní Yahoo Finance**, které se může kdykoli změnit.
- **Aplikace není digitálně podepsaná.**
