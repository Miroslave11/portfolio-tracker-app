# Krok 1 – Metaplán (architektura)

Stav: **NÁVRH – čeká na schválení (krok 3)**
Vychází ze schváleného rozsahu [00-rozsah-mvp.md](00-rozsah-mvp.md).

## 1. Hlavní komponenty

```
┌──────────────────────────── Electron aplikace ────────────────────────────┐
│                                                                            │
│  MAIN PROCESS (Node.js)                  RENDERER (React UI)               │
│  ┌──────────────────────┐                ┌──────────────────────────────┐  │
│  │ Úložiště (JSON)      │                │ Obrazovky: Přehled, Výkon,   │  │
│  │  – portfolio.json    │                │ Alokace, Investice, Obchody, │  │
│  │  – prices-cache.json │   typované     │ Cíl, Nastavení               │  │
│  │  – automatické zálohy│◄── IPC API ───►│                              │  │
│  ├──────────────────────┤  (preload,     │ Stav: TanStack Query+Zustand │  │
│  │ Stahování kurzů      │   context-     │ Grafy: ECharts               │  │
│  │  – Yahoo Finance     │   Bridge)      │ Motivy: CSS proměnné         │  │
│  │  – ČNB (EUR/CZK)     │                └──────────────┬───────────────┘  │
│  ├──────────────────────┤                               │                  │
│  │ Import PP JSON       │                ┌──────────────▼───────────────┐  │
│  └──────────────────────┘                │ CORE (čisté TypeScript)      │  │
│                                          │ pozice, ocenění v čase,      │  │
│                                          │ TTWROR, IRR, alokace,        │  │
│                                          │ měsíční investice, projekce  │  │
│                                          └──────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

- **Core** – veškerá finanční logika jako čisté funkce bez závislosti na Electronu/Reactu. Tohle je nejdůležitější a nejvíc testovaná část (unit testy se známými výsledky).
- **Main process** – jediné místo, které sahá na disk a na internet (Yahoo kvůli CORS z prohlížeče nejde). Zápis souborů atomicky + záloha před každou změnou.
- **Renderer** – jen zobrazení a formuláře. Bez přístupu k Node (bezpečnost: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`).

## 2. Tech stack

| Oblast   | Volba                                                                             | Proč                                                                      |
| -------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Jazyk    | **TypeScript** (strict)                                                           | Peníze a výpočty – typy chytí chyby                                       |
| Build    | **electron-vite** (Vite)                                                          | Rychlý dev server, hot reload, jednotná konfigurace main/preload/renderer |
| UI       | **React 18** + **Tailwind CSS** + **Radix UI** primitives                         | Moderní vzhled, přístupné komponenty (dialogy, selecty), snadné motivy    |
| Animace  | **Framer Motion**                                                                 | „Dynamický“ vzhled – přechody obrazovek, animace čísel                    |
| Grafy    | **Apache ECharts**                                                                | Plynulý zoom/posun na 8 letech denních dat, tooltippy, animace            |
| Stav     | **TanStack Query** (data z IPC) + **Zustand** (UI stav: filtr, měna, motiv)       | Jednoduché, cache, minimum boilerplate                                    |
| Validace | **Zod**                                                                           | Kontrola importu i ukládaných dat                                         |
| Datumy   | **date-fns**                                                                      | Práce s obdobími                                                          |
| Testy    | **Vitest** (unit), **Playwright** (E2E smoke Electronu – od pozdějších přírůstků) |                                                                           |
| Kvalita  | **ESLint** + **Prettier** + `tsc --noEmit`                                        |                                                                           |
| Balení   | **electron-builder** – Windows NSIS instalátor + portable `.exe`                  |                                                                           |
| CI       | **GitHub Actions** (windows-latest): lint → typecheck → test → build              |                                                                           |

**Úložiště – JSON soubory místo databáze:** dat je málo (~200 transakcí, ~15 000 denních kurzů). JSON je čitelný, snadno zálohovatelný (např. na OneDrive), bez nativních modulů → jednodušší build i CI. Soubory leží v `%APPDATA%/portfolio-tracker/`, cestu půjde v nastavení změnit.

**Zdroje kurzů:**

- **Yahoo Finance** (neoficiální chart API) – denní historie i aktuální kurz pro tickery `EUNL.DE`, `IWDA.AS`, `SXR8.DE`… Riziko: neoficiální API se může změnit → poskytovatel je za rozhraním, lze ho vyměnit; při výpadku appka jede z cache a ukáže stáří dat.
- **ČNB** – oficiální denní kurz EUR/CZK (roční textové soubory) pro přepínač CZK a cíl v CZK.

## 3. Datový model

```ts
Account      { id, name: 'Freedom24' | 'XTB' | 'Degiro', currency: 'EUR', color }

Security     { id, isin, name, yahooTicker, currency,
               indexGroup: 'S&P 500' | 'MSCI World' | 'Nasdaq 100' | 'World ex-USA' | …,
               distributing: boolean, color }

Transaction  { id, accountId, date, type, amount, currency, note?,
               securityId?, shares?, fee?, tax?,          // u BUY/SELL/DIVIDEND
               linkedId? }                                // vazba nákup ↔ automatický vklad
  type ∈ BUY | SELL | DEPOSIT | WITHDRAWAL | DIVIDEND | FEE

MonthlyPlan  { id, name, items: [{ accountId, securityId, targetAmount? }] }   // šablona „Měsíční nákup“

Settings     { theme, accent, followSystemTheme, displayCurrency: 'EUR'|'CZK',
               goal: { amountCZK, monthlyContribution, expectedReturnPa } }

PriceCache   { [securityId]: { lastFetched, prices: [date, close][] },
               fx: { 'EURCZK': [date, rate][] } }
```

Klíčová pravidla:

- **Vložený kapitál** = vklady − výběry (jako v Portfolio Performance). Hotovostní a cenný účet z PP se slučují do jednoho `Account` na brokera.
- **Pozice** = součet BUY − SELL po účtech a ETF. Stejný ISIN na více burzách (EUNL/IWDA) je jeden fond pro alokaci, ale kurz se bere z burzy, kde byl nakoupen.
- **Ocenění v čase** = pro každý den počet kusů × poslední známý kurz (víkendy/svátky přenesou předchozí kurz).
- Všechny transakce jsou v EUR; model měnu nese, aby šlo později přidat i jiné měny.

## 4. Struktura projektu (orientačně)

```
src/
  core/        # čistá logika + testy (*.test.ts)
  main/        # Electron main: storage, prices, import, IPC handlery
  preload/     # contextBridge – typované API
  renderer/    # React: screens/, components/, themes/, hooks/
  shared/      # typy + Zod schémata sdílené mezi procesy
docs/          # rozsah, metaplán, plány
```
