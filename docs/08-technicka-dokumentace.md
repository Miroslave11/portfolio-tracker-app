# Technická dokumentace

Jak je Portfolio Tracker postavený: technologie, struktura kódu, toky dat, bezpečnostní rozhodnutí,
testy a to, co by ses měl dozvědět dřív, než do kódu poprvé sáhneš. Je psaná pro vývojáře, který projekt
nezná nebo se k němu vrací po delší době.

Související dokumenty: [uživatelský návod](06-uzivatelsky-navod.md),
[přehled funkcí a vzorců](07-prehled-funkci.md), [vývoj a vydání](09-vyvoj-a-vydani.md).

## Obsah

1. [Přehled a technologie](#1-přehled-a-technologie)
2. [Struktura repozitáře](#2-struktura-repozitáře)
3. [Architektura procesů](#3-architektura-procesů)
4. [Vrstvy kódu a pravidlo závislostí](#4-vrstvy-kódu-a-pravidlo-závislostí)
5. [Datový model a soubory na disku](#5-datový-model-a-soubory-na-disku)
6. [Start aplikace](#6-start-aplikace)
7. [Import transakcí](#7-import-transakcí)
8. [Stahování kurzů](#8-stahování-kurzů)
9. [Od transakcí k obrazovce: výpočetní řetězec](#9-od-transakcí-k-obrazovce-výpočetní-řetězec)
10. [Shrnutí, AI a PDF](#10-shrnutí-ai-a-pdf)
11. [IPC a bezpečnost](#11-ipc-a-bezpečnost)
12. [Aktualizace a vydání](#12-aktualizace-a-vydání)
13. [Testování](#13-testování)
14. [Známá omezení a technický dluh](#14-známá-omezení-a-technický-dluh)
15. [Jak přidat novou věc](#15-jak-přidat-novou-věc)
16. [Slovník](#16-slovník)

---

## 1. Přehled a technologie

Desktopová aplikace pro Windows (Electron), která z transakcí a stažených kurzů počítá hodnotu, výkon,
alokaci, daně, cíl a „články“ o vývoji portfolia. **Všechna data jsou lokální soubory JSON.** Žádný vlastní
server ani databáze neexistuje.

| Oblast      | Technologie                                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------------ |
| Shell       | **Electron 44** (Chromium + Node), sestavení **electron-vite 6** (Vite 8)                                          |
| UI          | **React 19**, **TypeScript 5.9**, **Tailwind CSS 4**, stav v **zustand 5**, ikony `lucide-react`, animace `motion` |
| Grafy       | **Apache ECharts 6** (v okně Canvas, pro PDF SVG bez okna)                                                         |
| Validace    | **zod 4** (datový model, nastavení, IPC)                                                                           |
| Export      | **exceljs** (Excel), skryté okno Electronu `printToPDF` (PDF)                                                      |
| Aktualizace | **electron-updater** + GitHub Releases                                                                             |
| Balení      | **electron-builder** (NSIS instalátor pro Windows x64)                                                             |
| Kvalita     | **Vitest 5** (~540 testů), ESLint 9, Prettier 3, TypeScript `strict`                                               |
| CI          | GitHub Actions (Windows runner, Node 24)                                                                           |

Jazyk kódu je angličtina v identifikátorech a **čeština v komentářích a textech** uživatelského rozhraní.

## 2. Struktura repozitáře

```
portfolio-tracker/
|-- src/
|   |-- core/            <- ČISTÉ funkce: výpočty a logika (bez Electronu, disku a sítě)
|   |   |-- prices/      <- parsování odpovědí Yahoo, ČNB, Eurostat (bez stahování)
|   |   `-- *.test.ts    <- testy hned vedle kódu
|   |-- shared/          <- typy a zod schémata sdílené main <-> renderer (model, nastavení, IPC)
|   |-- main/            <- hlavní proces Electronu: disk, síť, okna, AI, PDF, aktualizace
|   |-- preload/         <- most mezi main a rendererem (contextBridge)
|   `-- renderer/        <- React aplikace (obrazovky, komponenty, zustand store)
|       `-- src/
|           |-- screens/      <- jedna obrazovka = jeden soubor (Přehled, Výkon, ...)
|           |-- components/   <- karty, dialogy, grafy, nastavení
|           `-- store.ts      <- globální stav (zustand)
|-- docs/                <- dokumentace a historické plány (00-05)
|-- examples/            <- vymyšlený ukázkový export pro vyzkoušení
|-- scripts/             <- release-notes.mjs, generate-example.mjs
|-- build/, resources/   <- ikony
|-- .github/workflows/   <- ci.yml (kontroly), release.yml (vydání)
|-- electron-builder.yml <- balení a publikace aktualizací
|-- electron.vite.config.ts
`-- spustit.bat          <- spuštění vývojového režimu s vlastními daty
```

Kdo co smí importovat (viz [další kapitola](#4-vrstvy-kódu-a-pravidlo-závislostí)):
`core` a `shared` smí odkudkoli, `main` a `renderer` se navzájem neimportují.

## 3. Architektura procesů

Electron má dva druhy procesů. Aplikace je rozděluje podle toho, **kdo smí sahat na disk a síť**.

```
+---------------------------------------------------------------------------------+
|                                  OPERAČNÍ SYSTÉM                                |
|   %APPDATA%\portfolio-tracker\  (portfolio.json, prices.json, ...)             |
|   síť: Yahoo, ČNB, Eurostat, GitHub  |  procesy: ollama (127.0.0.1), claude.exe |
+------------------------------^--------------------------------------------------+
                               | soubory, HTTP, spuštění programů
+------------------------------+--------------------------------------------------+
|  HLAVNÍ PROCES (Node)  src/main/                                                |
|  - načtení a uložení dat (validace zod)       - okna, dialogy, tisk do PDF      |
|  - stahování kurzů (net.fetch)                - AI: Ollama / Claude Code        |
|  - automatické aktualizace                    - export (CSV, Excel, PDF, záloha)|
+------------------------------^--------------------------------------------------+
                               | IPC (ipcMain.handle / ipcRenderer.invoke)
+------------------------------+--------------------------------------------------+
|  PRELOAD  src/preload/  =  window.api  (contextBridge, jen vyjmenované funkce)  |
+------------------------------^--------------------------------------------------+
                               | window.api.getPortfolio(), ...
+------------------------------+--------------------------------------------------+
|  RENDERER (Chromium, sandbox)  src/renderer/                                    |
|  - React obrazovky, zustand store                                               |
|  - VŠECHNY VÝPOČTY (importuje src/core/)                                        |
|  - Web Worker pro Monte Carlo                                                   |
|  nemá přístup k disku, síti (mimo CSP 'self') ani k Node.js                     |
+---------------------------------------------------------------------------------+
```

Důležité rozhodnutí: **výpočty běží v rendereru**, ne v hlavním procesu. Hlavní proces data jen načítá,
ukládá a stahuje; počítá se z `portfolio` + `prices` + `settings`, které renderer drží ve store. Díky tomu
je celé jádro čisté a testovatelné bez Electronu a přepočet po změně filtru nebo měny je okamžitý.

Okno se vytváří v `src/main/index.ts` (`createWindow`): `contextIsolation: true`, `nodeIntegration: false`,
`sandbox: true`. Otevírá se na displeji s kurzorem myši (`window-placement.ts`).

## 4. Vrstvy kódu a pravidlo závislostí

```
                +---------------------------+
                |        shared/            |   typy + zod schémata:
                |  model, settings, ipc,    |   to, co přechází přes IPC
                |  prices, summary, ai ...  |
                +------^------------^-------+
                       |            |
            +----------+--+      +--+----------------+
            |   core/     |      |                   |
            |  čisté      |<-----+  main/            |   renderer/
            |  výpočty    |<--------(importuje core) |   (importuje core)
            +-------------+      +-------------------+
                                  main  X  renderer       <- nesmí se importovat navzájem
```

- **`core/`**: žádné `fs`, `electron`, `fetch`, `window`. Vstup = data, výstup = data. Čas a síť se předávají
  jako parametr (`now`, `fetcher`), aby šlo testovat. Příklady: `portfolio-calc.ts`, `performance.ts`,
  `lots.ts`, `monte-carlo.ts`, `summary-month.ts`.
- **`shared/`**: kontrakty. Každý objekt, který putuje přes IPC nebo se ukládá do souboru, má **zod
  schéma** (`model.ts`, `settings.ts`, `prices.ts`, `summary.ts`, `export.ts`, `ai.ts`, `update.ts`).
- **`main/`**: vedlejší efekty. I zde se kód dělí tak, aby šel testovat: například stahování kurzů bere
  `fetcher` jako parametr, updater bere `UpdaterLike`, AI bere `TextGenerator`.
- **`renderer/`**: UI. Obrazovka složí data ze store, zavolá funkce z `core/` a vykreslí.

## 5. Datový model a soubory na disku

### Model (`src/shared/model.ts`)

```
 Portfolio { version: 1 }
   |
   |-- accounts[]       Account      { id, name (broker), currency, color }
   |
   |-- securities[]     Security     { id, isin?, name, yahooTicker, currency,
   |                                   indexGroup, distributing, color }
   |                                  (jedna kotace ETF; stejný ISIN může mít víc kotací)
   |
   `-- transactions[]   Transaction  { id, accountId, date, type, amount (>0), currency,
                                       securityId?, shares?, fee?, tax?, note?, linkedId? }

   type = BUY | SELL | DEPOSIT | WITHDRAWAL | DIVIDEND | FEE
   amount je vždy kladné; směr peněz určuje typ.
   BUY/SELL vyžadují securityId a shares. linkedId = vazba nákup <-> automatický vklad.
```

`portfolioSchema` navíc hlídá **referenční integritu** (unikátní ID transakcí, každá transakce má existující
účet a cenný papír).

### Soubory (`%APPDATA%\portfolio-tracker\`, nebo `PT_DATA_DIR`)

```
 %APPDATA%\portfolio-tracker\
 |-- portfolio.json      <- ZDROJ PRAVDY: účty, ETF, transakce          (main/portfolio-store.ts)
 |-- backups\            <- portfolio-<čas>.json, posledních 30          (před každým zápisem)
 |-- settings.json       <- nastavení (zod .catch = výchozí hodnoty)     (main/settings-store.ts)
 |-- prices.json         <- kurzy ETF, kurz EUR/CZK, inflace, dividendy  (ODVOZENÁ data, jdou smazat)
 |-- summaries.json      <- uložené články Shrnutí                       (main/summary-store.ts)
 `-- (cache Chromia: Cache, GPUCache, Local Storage ... generuje Electron)
```

| Soubor           | Co je to       | Při poškození                                                                 |
| ---------------- | -------------- | ----------------------------------------------------------------------------- |
| `portfolio.json` | data uživatele | **Nepřepíše se.** Aplikace napíše chybu, zálohy jsou v `backups\`.            |
| `settings.json`  | nastavení      | Chybná pole se tiše nahradí výchozími (`.catch()`).                           |
| `prices.json`    | stažené kurzy  | Zahodí se a stáhne znovu.                                                     |
| `summaries.json` | články         | Soubor se zkopíruje do `summaries.json.bad-…` a začne se s prázdným seznamem. |

**Zápis je atomický** (`main/json-file.ts`): data se zapíšou do `soubor.tmp` a pak se přejmenují, takže pád
uprostřed zápisu nepoškodí původní soubor. Všechny zápisy se v hlavním procesu řadí do front (`settingsQueue`,
`portfolioQueue`, `summariesQueue`), aby se rychlé změny nepřepsaly.

**Verzování formátu:** `version: 1` je jen značka. Žádný systém migrací není. Přidáváš-li pole, dej mu
`.default()` nebo `.catch()`, aby šly načíst starší soubory (viz `settings.ts`, `summary.ts`).

## 6. Start aplikace

```
 spuštění .exe
      |
      v
 main: app.setPath('userData', PT_DATA_DIR || %APPDATA%\portfolio-tracker)
      |
      v
 main: whenReady -> setupUpdates() -> registerIpc() -> createWindow() -> updates.start()
      |
      v
 okno načte renderer  ----->  bootstrap() v renderer/src/main.tsx
                                   |
                                   |  Promise.allSettled([ getSettings, getPortfolio,
                                   |                       getPrices,   getSummaries ])
                                   v
                              zustand store se naplní PŘED prvním vykreslením
                              (aby neproblikl motiv)  ->  <App/>
                                   |
                                   +--> useAutoRefreshPrices   (při startu a každou hodinu)
                                   +--> useAutoSummaries       (dohnání chybějících článků)
                                   +--> useUpdateState         (stav aktualizací z main)
                                   +--> useVersionNotice       ("Aktualizováno na verzi X")
                                   `--> klávesové zkratky, motiv
```

Stav aplikace je jeden zustand store `useApp` v `renderer/src/store.ts`: obrazovka, filtr brokera, data
(`portfolio`, `prices`, `summaries`, `settings`), dialogy, hlášky, stav aktualizací.

## 7. Import transakcí

```
 [Importovat] (renderer)
      |  window.api.previewImport()
      v
 main: dialog pro výběr souboru (cestu vybírá VŽDY main; renderer žádnou neposílá)
      |
      v
 readImportFile()  ->  limit 20 MB  ->  JSON.parse
      |
      v
 core/import-pp.ts  importPortfolioPerformance(json)
      |   - zod zkontroluje obálku (version, transactions[])
      |   - namapuje typy (PURCHASE->BUY, SALE->SELL, DEPOSIT, REMOVAL->WITHDRAWAL, ...)
      |   - sloučí hotovostní + cenný účet jednoho brokera
      |   - normalizuje názvy, doplní ISIN a skupinu indexu z katalogu
      |   - seřadí podle data, přidělí ID t00001, t00002, ...
      |   - vyrobí ImportReport (počty, poznámky, VAROVÁNÍ, CHYBY)
      v
 main: uloží portfolio do paměti jako "čekající náhled" {previewId, portfolio}
      |  vrátí rendereru JEN report + previewId
      v
 renderer: ImportDialog ukáže náhled
      |  uživatel potvrdí  ->  window.api.commitImport(previewId)
      v
 main: ověří previewId -> backupPortfolio() -> savePortfolio() (atomicky)
      v
 renderer: nové portfolio do store -> spustí se stažení kurzů
```

Chyby v importu **zablokují potvrzení** (`canCommit: false`); varování (např. ETF bez ISIN) ne.

## 8. Stahování kurzů

```
 renderer: refreshPrices()              <- při startu, po změně dat, každou hodinu, ručně
      |  window.api.updatePrices()
      v
 main/price-service.ts  updatePrices(dataDir, portfolio, { fetcher, extraTickers, inflation,
      |                                                      dividendTicker })
      |
      |  pro každé ETF (a benchmark):  Yahoo chart  (od coveredFrom, nebo od prvního obchodu - 10 dní;
      |                                              přepočítá se vždy posledních 7 dní)
      |  EUR/CZK:                      ČNB roční soubory
      |  inflace (max 1x/12 h):        Eurostat HICP (EA a CZ)
      |  dividendy (max 1x/24 h):      Yahoo events (jen pro kalkulačku čerpání)
      |
      |  chyba 429 / 5xx  -> opakování s pauzou;  chyba spojení -> NetworkError (hlášení v UI)
      |  odpovědi se parsují v core/prices/*.ts (čisté funkce, testované na uložených ukázkách)
      |  mergePoints(): nové body mají přednost, vše seřazeno podle data
      v
 prices.json (atomický zápis)  ->  vrací se { cache, report: [položka -> ok/chyba] }
      v
 renderer: store.prices = cache  ->  všechno se přepočítá
```

Síť jde přes **`net.fetch` z Electronu** (síťová vrstva Chromia). Na rozdíl od holého Node používá
systémové proxy a úložiště certifikátů Windows, takže funguje za firemním proxy i s antivirem, který
kontroluje HTTPS (viz `electronFetcher` v `main/index.ts`).

## 9. Od transakcí k obrazovce: výpočetní řetězec

Všechny obrazovky vycházejí ze tří vstupů a čistých funkcí:

```
   portfolio        prices          settings (měna, filtr, cíl, benchmark, ...)
  (transakce)   (kurzy, ČNB,
                  inflace)
      |               |                     |
      +-------+-------+---------------------+
              v
   useCalc()  ->  core/portfolio-calc.ts  calculatePortfolio()
              |     denní řada { hodnota, vloženo, hodnota v Kč } + pozice + souhrn
              |     (filtr brokera = jen vybrané účty)
              v
   [po inflaci?]  core/inflation.ts  makeDeflator + deflateCalc   -> hodnoty v dnešních cenách
              |
              +--> core/performance.ts   TTWROR, IRR, zisk, po letech
              |        +--> core/risk.ts          propady, kolísavost
              |        `--> core/benchmark.ts     hypotetický nákup jednoho ETF
              +--> core/allocation.ts / rebalance.ts   alokace a dokupování
              +--> core/investments.ts, monthly-plan.ts nákupy po měsících, plán
              +--> core/lots.ts, time-test.ts          FIFO, časový test (daně)
              +--> core/goal-projection.ts, monte-carlo.ts, withdrawal.ts, dividends.ts
              `--> core/summary-*.ts                    fakta článků
              v
   obrazovka (React)  složí karty a grafy (ECharts) z výsledků
```

`useCalc` je memoizovaný (`useMemo`): přepočítá se jen při změně dat, kurzů, filtru nebo režimu „po inflaci“.
Monte Carlo (~0,1 s) běží ve **Web Workeru** (`monteCarlo.worker.ts`), aby nezasekl okno při posouvání
posuvníků. Pokud se Worker nespustí, počítá se přímo.

## 10. Shrnutí, AI a PDF

```
 FAKTA                                   ČLÁNEK                            ZOBRAZENÍ
 core/summary-month.ts                   shared/summary.ts                 renderer
 buildMonthArticleFacts()                SummaryArticle                    SummaryArticleView
 buildPeriodFacts()   ------------>      { id, kind, period,   -------->   (články, seznam)
 (z portfolia, kurzů, nastavení)           createdAt,
                                           facts (ZMRAZENÁ),               savePdf()
                                           ai? { model, createdAt,           |
                                                 highlights?, commentary?,   v
                                                 outlook?, rejected[] } }  core/summary-pdf.ts
                                           |                                + summaryCharts.ts (SVG)
                                           v                                  |
                                    main/summary-store.ts                     v
                                    summaries.json                     main: htmlToPdf() -> .pdf
```

- **Období** se generují v `core/summary-period.ts` (měsíc, kvartál, pololetí, rok) a **dohánějí** se
  v `renderer/src/summaries.ts` (`useAutoSummaries`) při spuštění: pro každé skončené období, ke kterému jsou
  kurzy, a které ještě chybí, se vytvoří článek. Při chybě uložení se v dané relaci nezkouší znovu.
- **Šablonový text** (`articleHighlights`, `articleCommentary`, `articleOutlook`) vždy existuje; AI texty se
  ukládají **navíc** do `article.ai` a po částech.

### Psaní textů AI (`main/ai-article.ts`)

```
 renderer: writeAiTexts(article)
      |  window.api.aiWriteArticle({ kind, facts: [věty] })     <- jen věty-fakta, žádná surová data
      v
 main: ověří požadavek (zod) a nastavení; AI musí být zapnutá; části, délka, styl jsou z nastavení
      |
      v  pro každou zapnutou část (V kostce / Komentář / Výhled):
 prompt = buildPartPrompt(část, typ období, délka, styl, fakta, badNumbers)    core/summary-ai.ts
      |
      v
 TextGenerator = makeGenerator(ai)           main/ai-provider.ts
      |
      +--- 'ollama'     ->  generateText()   main/ollama.ts
      |                     POST http://127.0.0.1:11434/api/generate (stream: true, think: false)
      |                     časové limity: start 240 s, ticho 90 s, celkem podle části/délky
      |
      `--- 'claudecode' ->  claudeGenerate() main/claude-code.ts
                            spustí:  claude -p --output-format json --tools "" --strict-mcp-config
                                     --disable-slash-commands --no-session-persistence
                                     --setting-sources project --model <m> --effort low
                            prompt jde přes stdin; v prázdné složce v %TEMP%; bez ANTHROPIC_* proměnných
      v
 parsePartOutput()  ->  checkPartOutput():  tvar (počet bodů/odstavců), žádné rady,
      |                                     KAŽDÉ ČÍSLO MUSÍ BÝT VE FAKTECH (unknownNumbers)
      +-- ok -----------------> část uložit
      +-- špatná čísla -------> 1 opravný pokus (do promptu se vloží seznam sporných čísel)
      `-- stále špatně -------> část zamítnout ("rejected"), zůstane šablona
 model nedostupný (neběží, nepřihlášen, limit) -> celý článek zůstane na šabloně + zpráva
```

Princip: **čísla počítá kód, model jen formuluje**, a výsledek se mechanicky ověří. Toto pravidlo je hlavní
důvod, proč je AI v aplikaci bezpečná i při „halucinujícím“ modelu.

### PDF článku

`core/summary-pdf.ts` (`buildArticleHtml`) vyrobí HTML se stejnými sekcemi jako obrazovka (podle rozsahu);
`renderer/src/summaryCharts.ts` vykreslí dva grafy **bez okna** přes ECharts SSR (`renderToSVGString`) do
`data:` URI. HTML jde přes IPC (`exportSave`, `kind: 'pdf'`) do `main/pdf.ts`, kde ho skryté okno
(`javascript: false`, bez navigace a bez nových oken) převede na PDF (`printToPDF`, A4).

## 11. IPC a bezpečnost

### IPC kanály (`src/shared/ipc.ts`)

Rozhraní `window.api` (typ `PortfolioApi`) je jediný most mezi rendererem a hlavním procesem. Preload
(`src/preload/index.ts`) ho implementuje voláním `ipcRenderer.invoke(kanál, data)`.

| Skupina     | Kanály (`IPC.*`)                                                                                                                   |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Aplikace    | `appVersion`, `openFolder`                                                                                                         |
| Nastavení   | `settingsGet`, `settingsUpdate`                                                                                                    |
| Portfolio   | `portfolioGet`, `importPreview`, `importCommit`, `securityMetaUpdate`, `transactionsAdd`, `transactionUpdate`, `transactionDelete` |
| Kurzy       | `pricesGet`, `pricesUpdate`                                                                                                        |
| Export      | `exportSave`                                                                                                                       |
| AI          | `aiStatus`, `aiArticle` (a nepoužívaný `aiRewrite`, viz [dluh](#14-známá-omezení-a-technický-dluh))                                |
| Shrnutí     | `summariesGet`, `summariesSave`                                                                                                    |
| Aktualizace | `updateGet`, `updateCheck`, `updateInstall` + událost `updateEvent` (main -> renderer)                                             |

**Pravidlo:** renderer posílá **`unknown`** a hlavní proces vše validuje **zod** schématem
(`settingsPatchSchema`, `transactionDraftSchema`, `exportRequestSchema`, `summarySaveRequestSchema`,
`aiArticleRequestSchema` ...). Renderer nikdy neurčuje cestu k souboru ani program ke spuštění.

### Bezpečnostní rozhodnutí

| Oblast      | Opatření                                                                                                                                                                                                                                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Okno        | `contextIsolation`, `sandbox`, vypnutý `nodeIntegration`; CSP v `index.html` (`default-src 'self'`, skripty jen vlastní); odkazy ven jen `https://` přes systémový prohlížeč                                                                                                                                             |
| Soubory     | Cestu k importu a exportu vybírá **vždy uživatel v dialogu v hlavním procesu**. Proměnné `PT_IMPORT_FILE` a `PT_EXPORT_DIR` platí jen ve vývojovém (nesestaveném) běhu.                                                                                                                                                  |
| PDF         | HTML se vykresluje v okně **bez JavaScriptu**, bez navigace a bez nových oken; vlastní CSP bez vnějších zdrojů; všechen text se escapuje (`esc`). Povolené jsou jen obrázky `data:image/...`.                                                                                                                            |
| Ollama      | Komunikuje se **jen s `127.0.0.1`**; jakákoli jiná adresa se nepoužije (`isLocalhostUrl`).                                                                                                                                                                                                                               |
| Claude Code | Program se hledá jen jako soubor se jménem `claude(.exe)`; spouští se **bez nástrojů, bez MCP, bez uživatelských nastavení**, v prázdné složce a **bez proměnných `ANTHROPIC_*`**; přihlášení přes API klíč se odmítne (aby se nic neplatilo z API). Fakta o portfoliu se ale odesílají Anthropicu, což je v UI napsané. |
| Aktualizace | Stahuje se z GitHub Releases přes HTTPS, ověřuje se `sha512` z `latest.yml`. **Aplikace není podepsaná**, takže autenticitu zaručuje jen přístup k repozitáři.                                                                                                                                                           |
| Data        | Nikam se neodesílají. Ven jdou jen veřejné dotazy na kurzy a dotaz na vydání na GitHubu.                                                                                                                                                                                                                                 |

## 12. Aktualizace a vydání

### Aktualizace v aplikaci (`main/updater.ts`)

```
 UpdateManager (stavový automat)               autoUpdater = electron-updater

   idle --check--> checking --> up-to-date
                      |
                      +--> downloading (procenta) --> ready --install()--> installing
                      |                                                       |
                      `--> error (česká zpráva)                       setTimeout 2,5 s
                                                                              |
   disabled (dev / portable): nic nehledá                         quitAndInstall(false, true)
                                                                  = viditelný instalátor,
 spouští se: 20 s po startu, pak každé 4 h, nebo ručně            po dokončení se spustí app
```

- Režim (`enabled` / `dev` / `portable`) se určí v `index.ts`: nesestavená aplikace = `dev`, proměnná
  `PORTABLE_EXECUTABLE_DIR` = `portable`.
- Stav se posílá rendereru událostí `update:state`; v UI je ho vidět v pruhu (`UpdateBanner`), v okně
  „Instaluji…“ (`UpdateInstallOverlay`) a v Nastavení → Aplikace (`UpdateSettings`).
- `settings.lastVersion` si pamatuje naposledy spuštěnou verzi; po změně se ukáže hláška „Aplikace byla
  aktualizována“ (`versionChangeNotice`).

### Vydání (CI)

```
 git tag v1.2.3  +  git push origin v1.2.3
          |
          v
 .github/workflows/release.yml  (windows-latest)
   1. npm ci
   2. lint + typecheck + testy
   3. node scripts/release-notes.mjs v1.2.3 > release-notes.md
        - vezme sekci "## [1.2.3]" z CHANGELOG.md
        - ověří, že verze v tagu = version v package.json   <-- bez shody vydání selže
   4. electron-vite build  +  electron-builder --win --publish never
        -> dist/portfolio-tracker-1.2.3-setup.exe
           dist/portfolio-tracker-1.2.3-setup.exe.blockmap
           dist/latest.yml           <-- podle něj si klienti zjistí, že existuje novější verze
   5. gh release create v1.2.3  <tři soubory>  --notes-file release-notes.md
          |
          v
 nainstalované aplikace při dalším hledání najdou latest.yml a stáhnou setup.exe
```

Podrobný postup vydání je v [vývoji a vydání](09-vyvoj-a-vydani.md).

## 13. Testování

```
 npm test  ->  Vitest, prostředí "node", ~540 testů, ~3 s

   core/*.test.ts        výpočty na ručně spočítaných příkladech (TTWROR, FIFO, hranice časového
                         testu, Monte Carlo se semínkem, import ...)
   core/prices/*.test.ts parsování odpovědí Yahoo, ČNB, Eurostat na uložených ukázkách
   main/*.test.ts        sítě a procesy NAHRAZENÉ falešnými: fetcher (kurzy, Ollama), CliRunner
                         (Claude Code), UpdaterLike (aktualizace), dočasné složky pro úložiště
   shared/*.test.ts      schémata a výchozí hodnoty nastavení (zpětná kompatibilita starých souborů)
   renderer/*.test.ts    jen logika bez React komponent (např. vykreslení grafů do SVG)
```

Zásady:

- **Testuj čisté funkce v `core/`.** Je to nejlevnější a nejvýnosnější místo.
- **Žádná skutečná síť, žádný skutečný `claude.exe` ani Ollama v testech.** Všude je vstřikovaná závislost
  (`fetcher`, `run`, `updater`, `generator`).
- **Testy na skutečných datech** jsou v souborech `*.local.test.ts` (jsou v `.gitignore`, v repozitáři
  nejsou) a navíc v `lots.test.ts` pod `describe.skipIf`: spustí se jen tehdy, když v kořeni projektu leží
  export `Všechny_transakce.json` (také ignorovaný). Slouží k ověření na vlastních datech bez toho, aby se
  osobní čísla dostala do repozitáře.
- **Ukázkový export** `examples/ukazka-portfolio-performance.json` má vlastní test (`example-data.test.ts`),
  který hlídá, že se vždy bez chyb a varování naimportuje a prodej jde spárovat FIFO.
- **UI komponenty se netestují automaticky** (žádné testy Reactu ani e2e; závislost `playwright` je
  v `package.json` pozůstatek). Ověřují se ručně spuštěním aplikace.
- Typy a styl hlídají `npm run typecheck`, `npm run lint` a `npm run format:check`; všechno běží v CI.

## 14. Známá omezení a technický dluh

| #   | Omezení                                                                                                                                                                                   | Důsledek / kde to je                                                                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Seznam brokerů je v kódu napevno** (Freedom24, XTB, Degiro): `BROKER_FILTERS` ve `store.ts`, `BROKER_COLORS` v `import-pp.ts`.                                                          | Horní filtr brokera jiné brokery nenabídne; jejich transakce se naimportují, ale vybrat jdou jen v „Vše“. Pro nového brokera uprav tyto dva soubory (a texty).                |
| 2   | **Katalog ETF je krátký** (`securities-catalog.ts`, 7 fondů).                                                                                                                             | Neznámé ETF dostane skupinu indexu „Neurčeno“ a import vypíše varování; skupinu a barvu jde upravit na obrazovce Alokace.                                                     |
| 3   | **Neoficiální zdroje kurzů.** Yahoo chart API nemá záruku stability, ČNB a Eurostat mají vlastní formáty.                                                                                 | Při změně formátu přestanou kurzy chodit; parsery jsou v `core/prices/` a mají testy na ukázkách, takže stačí upravit parser a ukázku.                                        |
| 4   | **Počítá se v EUR.** Účty mají měnu, ale hodnoty, kurzy a výpočty předpokládají EUR; koruny jsou přepočet ČNB.                                                                            | Jiná základní měna by vyžadovala zobecnění.                                                                                                                                   |
| 5   | **Žádný systém migrací dat.** `version: 1` je jen značka.                                                                                                                                 | Nekompatibilní změna `portfolio.json` by potřebovala vlastní migraci. Pole přidávej s `.default()` / `.catch()`.                                                              |
| 6   | **Aplikace není podepsaná kódovým certifikátem.**                                                                                                                                         | SmartScreen a antiviry ji označují jako neznámou; aktualizace se ověřují jen kontrolním součtem. Řešením je placený certifikát.                                               |
| 7   | **Jen Windows (x64).** Cíl `electron-builder` je jen `win`/`nsis`.                                                                                                                        | Kód pro jiné systémy nebyl testován.                                                                                                                                          |
| 8   | **Po aktualizaci se musí kliknout na „Dokončit“** v okně instalátoru (poslední stránka NSIS).                                                                                             | Šlo by odstranit vlastním NSIS skriptem (`customFinishPage`), který při `isUpdated` stránku přeskočí a app spustí; zatím neděláno, protože se nedá snadno bezpečně otestovat. |
| 9   | **Nepoužívaný kód po odstranění karty „Měsíční shrnutí“ z Přehledu:** IPC `aiRewrite`, `rewriteSummary` v `ollama.ts`, `buildRewritePrompt` a `checkRewrite` v `core/monthly-summary.ts`. | Je dál otestovaný, ale nikdo ho nevolá. Kandidát na odstranění (`unknownNumbers` z téhož souboru se používá dál).                                                             |
| 10  | **Daně jsou informativní.** Počítá se časový test a FIFO, ne konkrétní výše daně, limity osvobození ani další specifika.                                                                  | Nelze použít jako podklad k přiznání bez kontroly.                                                                                                                            |
| 11  | **Velký jeden JS balík** rendereru (~3,3 MB).                                                                                                                                             | U desktopové aplikace nevadí; ECharts a React tvoří většinu.                                                                                                                  |
| 12  | **Žádné automatické UI testy ani e2e.**                                                                                                                                                   | Změny v obrazovkách se ověřují ručně.                                                                                                                                         |
| 13  | **Skutečná aktualizace (stažení + instalace) se testuje jen ručně** přechodem mezi dvěma vydáními. Logika stavového automatu je pokrytá testy s falešným updaterem.                       | Při změně updateru vždy vyzkoušej „stará verze -> nová verze“ na čistém počítači.                                                                                             |

## 15. Jak přidat novou věc

### Novou obrazovku

1. Přidej id do `SCREENS` ve `store.ts` a položku do `SCREEN_META` v `screenMeta.ts` (název, ikona).
2. Vytvoř `screens/NovaScreen.tsx` a zapoj ji v `App.tsx` (řetězec `screen === '...'`).
3. Pokud je to výpočet, napiš ho jako čistou funkci v `src/core/` **s testem**, obrazovka jen volá.

### Nový výpočet

Funkce do `src/core/nazev.ts` + `nazev.test.ts` vedle ní. Vstupem jsou data (`Portfolio`, kurzy, čísla),
ne `window` ani `fs`. Ve výsledku nech „odhad / chybí kurz“ jako `null` nebo příznak, ne výjimku.

### Nové nastavení

1. Přidej pole do `settingsSchema` v `src/shared/settings.ts` **s `.catch(výchozí)`** (starší soubory
   pole nemají) a do `settingsPatchSchema`.
2. Ovládací prvek přidej do příslušné části Nastavení (`SettingsScreen.tsx` nebo karty v `components/`).
3. Doplň test výchozí hodnoty (viz `update.test.ts` nebo `ai-article.test.ts`).

### Nový IPC kanál

1. `IPC` a `PortfolioApi` v `src/shared/ipc.ts`; implementace v `src/preload/index.ts`.
2. `ipcMain.handle` v `src/main/index.ts` s validací vstupu zod schématem.
3. Schéma požadavku/odpovědi dej do `src/shared/`.

### Novou část Nastavení

Přidej id a název do `src/core/settings-tabs.ts` (jsou tam i testem hlídané), ikonu do
`SETTINGS_TAB_ICONS` v `SettingsScreen.tsx` a obsah do jeho podmínek `tab === '...'`.

### Nového poskytovatele AI

Implementuj `TextGenerator` (`main/ai-provider.ts`: `(prompt, { timeoutMs, maxTokens }) => Promise<GenerateResult>`),
přidej hodnotu do `AI_PROVIDERS` v `shared/ai.ts`, do `aiSchema` a do přepínače v `AiSettingsCard.tsx`.
Ověřování čísel zůstává beze změny, protože je nezávislé na poskytovateli.

## 16. Slovník

| Pojem                  | Význam                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| **TTWROR**             | Time-True Weighted Rate of Return: časově vážený výnos, nezávislý na vkladech a výběrech. |
| **IRR / XIRR**         | Peněžně vážený výnos v % ročně, zahrnuje načasování vkladů.                               |
| **FIFO**               | First In, First Out: prodej spotřebuje nejstarší nákupy.                                  |
| **Lot**                | Jeden nákup, ze kterého se při prodejích odebírají kusy.                                  |
| **Časový test**        | České pravidlo: příjem z prodeje cenných papírů je po 3 letech držení osvobozen od daně.  |
| **ISIN**               | Mezinárodní identifikátor fondu; stejný ISIN může mít víc kotací na různých burzách.      |
| **Kotace / ticker**    | Konkrétní obchodování fondu na burze (např. EUNL.DE a IWDA.AS jsou stejný fond).          |
| **Skupina indexu**     | Index, který ETF sleduje (např. MSCI World); podle ní se sčítá alokace.                   |
| **HICP**               | Harmonizovaný index spotřebitelských cen (Eurostat), zdroj inflace.                       |
| **PP**                 | Portfolio Performance: open-source aplikace, jejíž JSON export aplikace importuje.        |
| **Fakta (článku)**     | Zmrazená čísla období, ze kterých se skládá šablonový i AI text.                          |
| **Přírůstek (P1–P28)** | Číslovaný vývojový krok: implementace, testy, kontrola, commit.                           |
| **`TextGenerator`**    | Funkce „zadání na vstup, text na výstup“ pro psaní textů AI (Ollama nebo Claude Code).    |
| **`UpdaterLike`**      | Minimální rozhraní `electron-updater`, které v testech nahrazuje falešný updater.         |
