# Portfolio Tracker

Desktopová aplikace pro Windows pro sledování dlouhodobého ETF portfolia napříč více brokery (rozpoznává
Freedom24, XTB a Degiro). Z transakcí a stažených kurzů počítá hodnotu, výkon (TTWROR, IRR), alokaci,
daňový časový test, cíl s projekcí a pravidelná „Shrnutí portfolia“ (volitelně s texty od AI). Inspirováno
aplikací Portfolio Performance, ale úzce na míru. **Všechna data zůstávají na tvém počítači.**

**Stav:** vydána verze **1.5.2** ([co obsahuje](CHANGELOG.md), [stažení instalátoru](https://github.com/Miroslave11/portfolio-tracker-app/releases/latest)).

```
   transakce (import z Portfolio Performance / ruční zápis)
                      +
   kurzy (Yahoo Finance, ČNB, Eurostat)
                      |
                      v
   +-------------------------------------------------------------+
   |  PORTFOLIO TRACKER  (Electron + React + TypeScript)         |
   |  hodnota | výkon | alokace | daně | cíl | shrnutí | export   |
   +-------------------------------------------------------------+
                      |
                      v
   lokální soubory JSON v %APPDATA%\portfolio-tracker  (žádný server)
```

## Dokumentace

Začni tady, podle toho, co potřebuješ:

| Chci…                                                                            | Dokument                                                  |
| -------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **používat aplikaci** (instalace, import, obrazovky, zkratky, řešení potíží)     | [Uživatelský návod](docs/06-uzivatelsky-navod.md)         |
| **vědět, co aplikace umí a jak to počítá** (vzorce, diagramy)                    | [Přehled funkcí](docs/07-prehled-funkci.md)               |
| **pochopit, jak je postavená** (architektura, data, toky, bezpečnost, omezení)   | [Technická dokumentace](docs/08-technicka-dokumentace.md) |
| **vyvíjet a vydávat** (spuštění, testy, vydání verze, co zkontrolovat po letech) | [Vývoj a vydání](docs/09-vyvoj-a-vydani.md)               |
| vidět **seznam změn**                                                            | [CHANGELOG](CHANGELOG.md)                                 |

Historické plánovací dokumenty z doby vzniku (jak se rozhodovalo, ne aktuální popis):
[Rozsah V1](docs/00-rozsah-mvp.md) · [Metaplán](docs/01-metaplan.md) ·
[Implementační plán](docs/02-implementacni-plan.md) · [Nápady](docs/03-napady-v1.1.md) ·
[Plán rozšíření](docs/04-plan-rozsireni.md) · [Plán Shrnutí](docs/05-plan-shrnuti.md)

## Technologie

Electron · electron-vite · React · TypeScript · Tailwind · zustand · ECharts · zod · Vitest ·
ESLint/Prettier · electron-builder · electron-updater

## Rychlý start (vývoj)

```bash
git clone https://github.com/Miroslave11/portfolio-tracker-app.git
cd portfolio-tracker-app
npm install
npm run dev        # spuštění s hot reloadem (nebo dvojklik na spustit.bat – s vlastními vývojovými daty)
npm test           # unit testy
npm run lint       # ESLint
npm run typecheck  # kontrola typů
npm run build:win  # instalátor (setup.exe) a latest.yml do složky dist/
```

Pokud `npm run dev` skončí chybou „Electron uninstall“ (novější npm nespouští instalační skripty balíčků
automaticky), stáhni program Electron příkazem `node node_modules/electron/install.js`. `spustit.bat` to
dělá sám. Víc v [Vývoj a vydání](docs/09-vyvoj-a-vydani.md).

## Instalace

Instalátor (`portfolio-tracker-<verze>-setup.exe`) najdeš na stránce
[Releases](https://github.com/Miroslave11/portfolio-tracker-app/releases/latest); sestavit ho jde i
příkazem `npm run build:win`. Instalace je jen pro aktuálního uživatele (bez práv správce).
Aplikace **není podepsaná**, takže ji Windows (SmartScreen) při prvním spuštění může označit jako neznámou:
zvol „Další informace → Přesto spustit“.

Data zůstávají v `%APPDATA%\portfolio-tracker` – instalace, aktualizace ani odinstalace je nemažou, takže se
po přeinstalování najdou. Zálohu si lze otevřít v Nastavení → Data a zálohy.

## Automatické aktualizace

Nainstalovaná aplikace při spuštění a pak každé 4 hodiny hledá novější vydání na GitHubu, stáhne ho na
pozadí a po restartu nainstaluje (tlačítko „Restartovat a nainstalovat“ ukáže okno s vysvětlením a pak
instalátor s průběhem; nebo se nainstaluje při zavření aplikace). Vypnout je lze v Nastavení → Aplikace,
tamtéž je ruční kontrola. Při vývoji (`npm run dev`) se aktualizace nehledají. Aktualizace se ověřují
kontrolním součtem, ale aplikace není podepsaná.

Vývojový běh přes `spustit.bat` používá vlastní data ve složce `vyvoj-data`, takže nesahá na data
nainstalované aplikace.

## Data

Osobní data (transakce, cache kurzů) se ukládají mimo repozitář do `%APPDATA%\portfolio-tracker\`. Exporty
transakcí (`*transakce*.json`) jsou v `.gitignore`.

## Vyzkoušení bez vlastních dat

V repozitáři je vymyšlený ukázkový export
[`examples/ukazka-portfolio-performance.json`](examples/ukazka-portfolio-performance.json)
(3 účty, 4 ETF, měsíční nákupy 2023–2026 a jeden prodej; žádná skutečná data). Na prázdném Přehledu klikni na
**Importovat**, vyber tento soubor a potvrď náhled. Hodnoty se dopočítají z aktuálních kurzů, které aplikace
stáhne z Yahoo Finance a ČNB. Soubor vzniká skriptem `node scripts/generate-example.mjs`.

## Upozornění

Nejde o finanční, investiční ani daňové poradenství. Výpočty jsou informativní a zjednodušené.
