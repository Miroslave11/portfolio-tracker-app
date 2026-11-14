# Plán rozšíření (přírůstky P13–P23)

Stav: **k odsouhlasení** (2026-11-13). Navazuje na V1 (P1–P12).
Postup je stejný jako u V1: po schválení se dělá **jeden přírůstek po druhém** – implementace → testy → přesný návod, co zkontrolovat → čekání na potvrzení → commit.

Vybrané funkce: 1, 2, 5, 6, 7, 8, 9, 10, 12, 14, 17 ze [seznamu nápadů](03-napady-v1.1.md).

## Doporučení k vydání

**Varianta A (doporučeno):** nejdřív vydat **v1.0** (stávající appka P1–P12 po závěrečném průchodu a změně verze), rozšíření pak přidávat po skupinách jako menší vydání:

| Vydání   | Obsah                                                   | Přírůstky |
| -------- | ------------------------------------------------------- | --------- |
| **v1.0** | Stávající aplikace + závěrečný průchod                  | P1–P12    |
| v1.1     | Daně (realizovaný zisk, časový test), riziko, benchmark | P13–P16   |
| v1.2     | Inflace, Monte Carlo, čerpání                           | P17–P19   |
| v1.3     | Rebalancing, export, paleta příkazů                     | P20–P22   |
| v1.4     | Lokální AI (měsíční shrnutí)                            | P23       |

**Varianta B:** všech 11 funkcí dopsat před vydáním a vydat rovnou „velké“ v1.0. Je to cca 2× delší čekání na první vydání a víc nových věcí najednou k odladění.

## Přírůstky

### P13 – Daně I: FIFO loty a realizovaný zisk _(funkce 2)_

- **Kde:** nová položka menu **Daně**, záložka _Realizovaný zisk_.
- **Co:** u každého prodeje spotřebuje nejstarší nákupy téhož fondu (**FIFO podle ISIN napříč brokery**, EUNL.DE a IWDA.AS jsou jeden fond). Zisk = příjem − pořizovací cena. Tabulka po letech, detail prodejů s rozbalením použitých nákupů, přepínač EUR/Kč (denní kurz ČNB ke dni prodeje).
- **Jádro:** `core/lots.ts` (lot = nákup, FIFO spotřeba, stejný den: nákupy před prodeji), poplatky se berou jako součást částky.
- **Testy:** FIFO na ručních příkladech (částečná spotřeba lotu, prodej přes víc lotů, více brokerů, ISIN sloučení), součet zisku = příjmy − náklady; kontrola na reálném exportu (jen lokálně).
- **Tvůj test:** porovnat zisk z prodeje s Portfolio Performance.

### P14 – Daně II: časový test 3 roky _(funkce 1)_

- **Kde:** záložka _Časový test 3 roky_ na obrazovce Daně.
- **Co:** které zbývající kusy jsou už **volné** (od dne po 3. výročí nákupu), kolik hodnoty se uvolní v dalších letech (graf), nejbližší uvolnění, rozpis po ETF a po nákupech, u každého nákupu pruh „za kolik měsíců“. Při zápisu prodeje ve formuláři upozornění „prodej X ks poruší časový test“ (neblokuje).
- **Jádro:** staví na lotech z P13; `core/time-test.ts`.
- **Testy:** hranice (přesně 3 roky, přestupný rok), po prodeji se spotřebují nejstarší, součty volné + čekající = hodnota pozic.
- **Tvůj test:** zkontrolovat datum uvolnění u pár konkrétních nákupů.

### P15 – Riziko _(funkce 8)_

- **Kde:** nová karta na obrazovce **Výkon** (pod grafem).
- **Co:** největší propad, doba zotavení, roční volatilita, nejhorší měsíc/rok, graf propadu od vrcholu, tabulka největších propadů. Vše z denního výkonu očištěného o vklady, za zvolené období.
- **Jádro:** `core/risk.ts` nad křivkou z `computePerformance`.
- **Testy:** ruční řady (známý propad a zotavení), volatilita proti nezávislému výpočtu.

### P16 – Srovnání s benchmarkem _(funkce 5)_

- **Kde:** karta na obrazovce **Výkon**.
- **Co:** „kdybys každý vklad dal do jednoho ETF“: stejné částky ve stejné dny do vybraného fondu (výchozí MSCI World – EUNL.DE; lze vybrat jiný ETF z portfolia nebo vlastní Yahoo ticker). Graf, rozdíl hodnoty a výnosu (TTWROR, IRR).
- **Jádro:** `core/benchmark.ts` (hypotetické nákupy, výběry odečtou kusy), využívá existující stahování kurzů.
- **Testy:** shoda s ručním příkladem; když benchmark = vlastní jediný ETF, vyjde stejné jako skutečnost.

### P17 – Hodnoty po inflaci _(funkce 9)_

- **Kde:** přepínač **Nominálně | Reálně** v horní liště (vedle EUR/Kč); promítne se do Přehledu, Výkonu, Cíle a Čerpání.
- **Co:** přepočet na dnešní ceny. Inflace se stahuje automaticky z **Eurostatu (HICP; eurozóna pro EUR, ČR pro Kč)** a ukládá do cache jako kurzy; do budoucna lze zadat vlastní inflaci (např. 2,5 %).
- **Jádro:** `core/inflation.ts`, `main/inflation-service.ts` (offline = poslední cache).
- **Testy:** přepočet na ručním příkladu, parsování odpovědi Eurostatu na uložené ukázce, chování bez připojení.

### P18 – Monte Carlo projekce _(funkce 6)_

- **Kde:** nová karta na obrazovce **Cíl**.
- **Co:** 5 000 simulací vývoje s kolísáním trhu: pásma 10–90 % a 25–75 %, medián, **pravděpodobnost dosažení cíle do daného roku**, rok s 80% jistotou. Předpoklady (vklad, výnos, kolísavost) sdílí s Cílem; výchozí kolísavost z tvé historie. Počítá se na pozadí (Web Worker), nezasekne okno.
- **Jádro:** `core/monte-carlo.ts` (seedované, opakovatelné).
- **Testy:** nulová kolísavost = deterministická projekce z P11; střední hodnota proti vzorci; pravděpodobnosti jsou monotónní.

### P19 – Kalkulačka čerpání _(funkce 10)_

- **Kde:** druhá karta na obrazovce **Cíl**.
- **Co:** kolik lze měsíčně čerpat z cíle (nebo dnešní hodnoty, nebo vlastní částky) – pravidlo 4 %, doba, po kterou kapitál vydrží, tabulka „čerpání podle délky“. Čerpání roste o inflaci.
- **Jádro:** `core/withdrawal.ts`.
- **Testy:** uzavřené vzorce (anuita), hranice (nulový výnos), „navždy“ = reálný výnos.

### P19b – Čerpání jen z dividend _(doplněno 13. 11. 2026)_

- **Kde:** přepínač **Odprodej / Jen dividendy** v Kalkulačce čerpání (obrazovka **Cíl**).
- **Co:** celý kapitál převedený do dividendového ETF (výchozí **SCHD**, jde zadat jiný Yahoo ticker, např. UCITS alternativu); čerpají se jen čisté dividendy, kapitál se neprodává. KPI (čistá dividenda měsíčně v 1. roce, za 10 let nominálně i v dnešních cenách, srovnání s odprodejem „navždy“ **při stejném celkovém výnosu** dividenda + růst, aby bylo férové), graf měsíčního příjmu v čase (dividendy reálně/nominálně vs odprodej), tabulka po letech (dividenda, v dnešních cenách, hodnota kapitálu). Posuvníky: dividendový výnos, růst dividend, daň z dividend (15 %), inflace (společná).
- **Data:** historie výplat dividend z Yahoo (chart API `events=div`, měsíční interval od 2010), obnova 1× denně, uložení v `prices.json`. Z ní výnos za posledních 12 měsíců a průměrný růst dividend za 5 a 10 let (celé roky) jako výchozí hodnoty.
- **Bez:** daně z přesunu portfolia (rozhodnutí uživatele), kurzu USD/CZK.
- **Jádro:** `core/dividends.ts` (statistiky z výplat, projekce příjmu).
- **Testy:** výnos za 12 měsíců a CAGR na známých výplatách, neúplný rok se nepočítá, projekce = vzorec, nulový růst = konstantní příjem.

### P20 – Rebalancing _(funkce 7)_

- **Kde:** záložka _Cílová alokace_ na obrazovce **Alokace**.
- **Co:** zadáš cílové podíly podle indexu (součet 100 %); appka ukáže odchylky a **jak rozdělit měsíční nákup** mezi podhodnocené indexy (jen dokupování, bez prodeje – kvůli dani a časovému testu), tlačítko „Předvyplnit měsíční nákup“.
- **Jádro:** `core/rebalance.ts`, cíle v nastavení.
- **Testy:** příklady rozdělení (deficit větší/menší než vklad), nikdy záporný nákup, součet = vklad.

### P21 – Export _(funkce 14)_

- **Kde:** tlačítko **Export** u tabulek (Obchody, Investice, Daně…).
- **Co:** **CSV** (aktuální výběr, oddělovač „;“, kódování pro Excel), **Excel (.xlsx)** (listy Transakce, Měsíční investice, Pozice, Výkon po letech; čísla jako čísla), **PDF měsíční report** (volba obsahu, tisk přímo v appce), zálohování dat do vybrané složky. Cestu k souboru volíš v dialogu uložení.
- **Nová závislost:** knihovna pro Excel (navrhuji `exceljs`, MIT); PDF přes vestavěný tisk Electronu.
- **Testy:** CSV (české znaky, uvozovky, čísla), XLSX se po načtení shoduje s daty, PDF se vytvoří.

### P22 – Paleta příkazů Ctrl+K _(funkce 17)_

- **Co:** `Ctrl+K` otevře vyhledávací okno: akce (nový nákup, měsíční nákup, export, aktualizace kurzů, přepnutí motivu a měny), přechod na obrazovky, hledání v transakcích. Navíc zkratky `Ctrl+N`, `Ctrl+M`.
- **Testy:** vyhledávání bez diakritiky, pořadí výsledků, spuštění akcí.

### P23 – Měsíční shrnutí s lokální AI _(funkce 12)_

- **Kde:** karta na **Přehledu** + Nastavení → Lokální AI.
- **Co:** shrnutí měsíce (kolik jsi investoval, změna hodnoty, nejlepší/nejslabší ETF, postup k cíli). **Čísla vždy počítá kód.** Bez AI vznikne strohé shrnutí ze šablon (výchozí); s lokálním modelem (**Ollama**, jen `localhost`) se text pouze přeformuluje a každé číslo se ověří – nesedí-li, text se zahodí.
- **Požadavek:** nainstalovaná Ollama a stažený model (volitelné; appka funguje i bez).
- **Testy:** sestavení faktů, ověření čísel (podvržené číslo → zamítnuto), chování při nedostupné Ollamě, časový limit.

## Rozhodnutí, která potřebuji

1. **Vydání:** varianta A (nejdřív v1.0, pak rozšíření po skupinách), nebo B (všechno do v1.0)?
2. **Daně (P13–P14):** přehled je **informativní**, bez výpočtu výše daně (jen zisk a stav časového testu). Stačí?
3. **Inflace (P17):** automatické stahování z Eurostatu (veřejná data) – souhlasíš? Bez připojení se použije poslední stažená hodnota nebo ruční inflace.
4. **Export (P21):** přidat knihovnu pro Excel (`exceljs`)? Alternativou je jen CSV a PDF.
5. **AI (P23):** je v pořádku, že bez Ollamy dostaneš strohé shrnutí a AI je jen volitelné vylepšení?
6. **Pořadí:** souhlasíš s pořadím P13 → P23 výše, nebo chceš něco předsunout (např. paleta příkazů je malá a rychlá)?

## Co se v tomto plánu nedělá

Import výpisů z brokerů, dividendy, zápis větou a chat s AI, podepisování a automatické aktualizace appky (zůstávají v [seznamu nápadů](03-napady-v1.1.md)).
