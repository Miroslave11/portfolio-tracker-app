# Krok 0 – Rozsah V1 (MVP)

Stav: **NÁVRH v2 – odpovědi zapracovány, čeká na finální schválení**
Datum: 2026-11-12

## Co je Portfolio Performance (inspirace)

Portfolio Performance (PP) je open-source desktopová aplikace (Java/Eclipse) pro sledování investic. Klíčové koncepty:

- **Cenné papíry** s historií kurzů stahovanou z online zdrojů (Yahoo Finance aj.).
- **Účty:** hotovostní (deposit) a cenné papíry (portfolio). Transakce: nákup, prodej, vklad, výběr, dividenda, poplatek, daň, převod.
- **Výkonnost:** TTWROR (časově vážený výnos, nezávislý na vkladech) a IRR (peněžně vážený, zohledňuje načasování vkladů), absolutní zisk, vše za volitelné období.
- **Přehled aktiv** (statement of assets) k libovolnému datu, **taxonomie** (alokace dle kategorií), rebalancing, spořicí plány, import výpisů z brokerů, dashboardy s widgety.

PP je velmi obecné a složité. Moje aplikace má být **úzce na míru**: dlouhodobý ETF investor, více brokerů, ~1 nákup měsíčně, vlastní cíl v CZK.

## Vstupní data (export z Portfolio Performance)

- Formát = **JSON export z Portfolio Performance** (version 1).
- Typy transakcí: nákup, prodej, vklad, výběr; měna EUR.
- Hotovostní účet a účet cenných papírů z PP se slučují do jednoho účtu brokera.
- Vklady typicky kopírují nákupy 1:1 → hotovost na účtech je ~0, „zainvestováno za měsíc“ lze počítat přímo z nákupů.

Typické nesrovnalosti v datech (řeší se při importu):

| #   | Problém                                                                                                         | Navržené řešení                                                   |
| --- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1   | EUNL.DE nemá ISIN; EUNL.DE a IWDA.AS jsou **tentýž fond** (iShares Core MSCI World, IE00B4L5Y983) na jiné burze | Doplnit ISIN, v alokaci sloučit podle ISIN                        |
| 2   | VUSA.DE, SXR8.DE, SPYL.DE jsou všechny S&P 500                                                                  | Seskupit podle indexu (štítek u ETF)                              |
| 3   | VUSA je **distribuční** ETF, ale chybí dividendy                                                                | Buď je doplníš, nebo je ignorujeme (výkon bude mírně podhodnocen) |
| 4   | Jméno „SXRV.DE “ s mezerou, SPYL název „SPYL.EU“ vs. ticker SPYL.DE, jeden nákup EXUS bez ISIN                  | Normalizace při importu                                           |

## V1 MUSÍ umět

1. **Import historie** z `Všechny_transakce.json` (jednorázově + možnost znovu) s normalizací výše.
2. **Automatické stahování kurzů** – denní historie od 2018 + aktuální kurz při spuštění / tlačítkem (Yahoo Finance), lokální cache, aby appka fungovala i offline.
3. **Hlavní měna EUR**, přepínač na CZK (kurz EUR/CZK z ČNB, denní historie).
4. **Dashboard:** aktuální hodnota, celkem vloženo, zisk (abs. i %), změna za den, graf hodnoty portfolia vs. vložený kapitál v čase.
5. **Výkon za období:** předvolby (1M, 3M, YTD, 1R, 3R, 5R, Max, každý kalendářní rok) + vlastní rozsah od–do. Metriky: TTWROR, IRR (p.a.), absolutní zisk.
6. **Alokace:** podle ETF (sloučeno přes ISIN), podle brokera, podle indexu/regionu (S&P 500 / MSCI World / Nasdaq 100 / World ex-USA). Koláč + tabulka s % a hodnotou.
7. **Měsíční investice:** sloupcový graf zainvestovaných částek po měsících (rozpad dle brokera), průměr, součet za rok.
8. **Seznam obchodů:** tabulka všech transakcí, filtr dle brokera / ETF / typu / období, řazení, u každého nákupu aktuální zisk.
9. **Filtr brokera** globálně (vše / Freedom24 / XTB / Degiro) pro všechny pohledy.
10. **Zápis nových transakcí** (viz návrh níže) + úprava a smazání transakce.
11. **Cíl (CZK):** cílová částka je definovaná v CZK (přepočet aktuálním kurzem ČNB, zobrazí se i v EUR). Progress bar + jednoduchá projekce „kdy cíle dosáhnu“ při zadaném měsíčním vkladu a očekávaném výnosu.
12. **Volitelné vzhledy (motivy):** několik předpřipravených motivů – Tmavý (výchozí), Světlý, Půlnoční modrá, OLED černá, Teplý/sépiový – plus volba akcentní barvy a režim „podle systému Windows“. Volba se pamatuje.
13. Česká lokalizace, moderní dynamický vzhled (animované grafy, přechody), Windows build (instalátor/portable).

## Návrh zápisu nových transakcí (90 % = 1 nákup měsíčně)

Doporučuji pro V1 kombinaci A + B:

- **A) Rychlý formulář „Nový nákup“** – vybereš broker → ETF (naposledy použité nahoře), datum (dnes), počet kusů a celková částka (nebo cena za kus – druhé se dopočítá), volitelně poplatek. Appka předvyplní kurz z daného dne, takže jen zkontroluješ. Vklad hotovosti se vytvoří automaticky (stejně jako v tvých datech).
- **B) „Měsíční nákup“ = šablona/spořicí plán** – definuješ svou standardní měsíční dávku (např. Freedom24: SPYL + EXUS). Každý měsíc klikneš „Zapsat měsíční nákup“, otevře se předvyplněný hromadný formulář s více řádky, doplníš skutečné kusy/částky a uložíš jedním klikem. Dashboard upozorní, pokud za aktuální měsíc ještě nákup zapsaný není.
- **C) (V2) Import výpisu z brokera** – CSV/XLSX z XTB, Degiro, Freedom24. Pohodlné, ale každý broker má jiný formát a formáty se mění → mimo V1.

## Záměrně MIMO rozsah V1 (kandidáti na V2)

- Import výpisů z brokerů (CSV/XLSX/PDF).
- **Daňový časový test 3 roky** (které loty lze prodat bez daně) – velmi užitečné pro CZ, ale až V2.
- Dividendy jako samostatná analýza (kalendář, výnos) – typ transakce DIVIDEND ale V1 podporovat bude.
- Rebalancing a cílová alokace, srovnání s benchmarkem.
- Kalkulačka renty / fáze čerpání (kolik lze měsíčně čerpat z naspořené částky).
- Akcie mimo EUR / jiné měny transakcí (datový model s tím počítá, UI ne).
- Synchronizace do cloudu, více uživatelů, mobilní verze, intradenní kurzy.
- Podepisování kódu a automatické aktualizace aplikace.
- Export zpět do formátu Portfolio Performance.

## Rozhodnutí (2026-11-12)

1. **Hlavní měna: EUR**, přepínač na CZK.
2. **Dividendy VUSA:** nedoplňují se, historie není známá. Výkon VUSA bude mírně podhodnocen (řádově ~1 % ročně z hodnoty pozice VUSA). Typ DIVIDEND V1 přesto podporuje pro budoucí zápis.
3. **Zápis transakcí:** A (rychlý formulář) + B (šablona měsíčního nákupu) ve V1, C (import výpisů) ve V2.
4. **Cíl (CZK)** s projekcí ve V1.
5. **Metriky:** TTWROR + IRR + absolutní zisk – _čeká na potvrzení po vysvětlení_ (viz níže).
6. **Nový požadavek:** více volitelných vzhledů aplikace (bod 12).

## Vysvětlení metrik

- **Absolutní zisk** – kolik eur jsem vydělal: aktuální hodnota − vložené peníze (+ přijaté dividendy).
- **TTWROR (časově vážený výnos)** – jak dobře se vedlo _investicím samotným_, bez ohledu na to, kdy a kolik jsem vložil. Vklady ho nezkreslují. Hodí se pro srovnání s indexem nebo s jiným investorem („moje ETF vydělala +45 % za 3 roky“).
- **IRR (peněžně vážený výnos, % p.a.)** – jaký roční „úrok“ reálně dostaly _moje peníze_, včetně načasování vkladů. Je to stejné číslo, jako kdybych měl spořicí účet, který by mi dal stejný výsledek. Hodí se pro plánování cíle a renty.
- **Příklad:** do ledna vložím 1 000 €, trh do června +20 %, pak v červnu vložím 10 000 € a trh do prosince −10 %. TTWROR ≈ +8 % (trh „celkově“ vyrostl), ale IRR je záporné, protože většina mých peněz zažila jen pokles.
