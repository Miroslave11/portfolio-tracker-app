# Portfolio Tracker

Osobní desktopová aplikace pro sledování dlouhodobého ETF portfolia napříč brokery Freedom24, XTB a Degiro. Inspirováno aplikací Portfolio Performance, ale úzce na míru.

**Stav:** vydána verze **1.2.0** ([co obsahuje](CHANGELOG.md), [stažení instalátoru](https://github.com/Miroslave11/portfolio-tracker/releases/latest)). Další vývoj podle [plánu rozšíření](docs/04-plan-rozsireni.md). Dokumentace:

- [Rozsah V1](docs/00-rozsah-mvp.md)
- [Metaplán – architektura](docs/01-metaplan.md)
- [Implementační plán](docs/02-implementacni-plan.md)
- [Nápady na další funkce](docs/03-napady-v1.1.md)
- [Plán rozšíření P13–P23](docs/04-plan-rozsireni.md)

## Technologie

Electron · electron-vite · React · TypeScript · Vitest · ESLint/Prettier · electron-builder

## Vývoj

```bash
npm install
npm run dev        # spuštění s hot reloadem
npm test           # unit testy
npm run lint       # ESLint
npm run typecheck  # kontrola typů
npm run build:win  # instalátor + portable .exe do složky dist/
```

## Instalace

Instalátor (`portfolio-tracker-<verze>-setup.exe`) i přenosná verze (`…-portable.exe`) se sestavují příkazem `npm run build:win`
a na GitHubu v CI jako artefakt „portfolio-tracker-windows“. Instalace je jen pro aktuálního uživatele (bez práv správce).
Aplikace zatím **není podepsaná**, takže ji Windows (SmartScreen) při prvním spuštění může označit jako neznámou:
zvol „Další informace → Přesto spustit“.

Data zůstávají v `%APPDATA%portfolio-tracker` – instalace, aktualizace ani odinstalace je nemažou, takže
se po přeinstalování najdou. Zálohu si lze otevřít v Nastavení → Data.

## Data

Osobní data (transakce, cache kurzů) se ukládají mimo repozitář do `%APPDATA%/portfolio-tracker/`. Exporty transakcí (`*transakce*.json`) jsou v `.gitignore`.

## Vyzkoušení bez vlastních dat

V repozitáři je vymyšlený ukázkový export [`examples/ukazka-portfolio-performance.json`](examples/ukazka-portfolio-performance.json)
(3 účty, 4 ETF, měsíční nákupy 2023–2026 a jeden prodej; žádná skutečná data). Na prázdném Přehledu klikni na
**Importovat**, vyber tento soubor a potvrď náhled. Hodnoty se dopočítají z aktuálních kurzů, které aplikace stáhne
z Yahoo Finance a ČNB. Soubor vzniká skriptem `node scripts/generate-example.mjs`.
