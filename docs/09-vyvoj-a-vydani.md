# Vývoj a vydání

Praktický postup pro vývojáře: jak projekt rozběhnout na novém počítači, jak se pracuje, jak se vydává nová
verze a co zkontrolovat, když se k projektu vrátíš po delší době. Architekturu popisuje
[technická dokumentace](08-technicka-dokumentace.md).

## Obsah

1. [Požadavky](#1-požadavky)
2. [První spuštění](#2-první-spuštění)
3. [Příkazy](#3-příkazy)
4. [Vývojová data a proměnné prostředí](#4-vývojová-data-a-proměnné-prostředí)
5. [Jak se pracuje](#5-jak-se-pracuje)
6. [Osobní data a veřejný repozitář](#6-osobní-data-a-veřejný-repozitář)
7. [Vydání nové verze](#7-vydání-nové-verze)
8. [Test aktualizace](#8-test-aktualizace)
9. [Co zkontrolovat po dlouhé pauze](#9-co-zkontrolovat-po-dlouhé-pauze)
10. [Časté potíže](#10-časté-potíže)

---

## 1. Požadavky

| Co                | Verze                     | Poznámka                                                                |
| ----------------- | ------------------------- | ----------------------------------------------------------------------- |
| Windows           | 10/11                     | Aplikace i sestavení jsou pro Windows                                   |
| Node.js           | **24** (stejná jako v CI) | `node -v`; novější npm nespouští instalační skripty balíčků automaticky |
| npm               | součást Node              |                                                                         |
| Git               | libovolná                 |                                                                         |
| GitHub CLI (`gh`) | volitelně                 | pro kontrolu běhu vydání a vydání z příkazové řádky                     |

## 2. První spuštění

```bash
git clone https://github.com/Miroslave11/portfolio-tracker-app.git
cd portfolio-tracker-app
npm install
node node_modules/electron/install.js   # jen pokud se Electron nestáhl (viz potíže)
npm run dev
```

Pohodlnější je **dvojklik na `spustit.bat`**: sám doinstaluje závislosti, případně stáhne Electron, nastaví
vlastní vývojová data a spustí `npm run dev`. Okno aplikace se otevře na displeji, kde je kurzor myši.

Po spuštění je aplikace prázdná. Naimportuj ukázkový soubor `examples/ukazka-portfolio-performance.json`
(tlačítko **Importovat**) nebo vlastní export z Portfolio Performance.

## 3. Příkazy

| Příkaz                                  | Co dělá                                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------ |
| `npm run dev`                           | Vývojový režim s hot reloadem (dev server na `localhost:5173` + Electron).                 |
| `npm test`                              | Všechny testy (Vitest). `npm run test:watch` je sleduje průběžně.                          |
| `npm run lint`                          | ESLint (`--cache`).                                                                        |
| `npm run format` / `format:check`       | Prettier zapisuje / kontroluje formátování.                                                |
| `npm run typecheck`                     | `tsc` pro main/preload (`typecheck:node`) i renderer (`typecheck:web`).                    |
| `npm run build`                         | Typecheck + `electron-vite build` (výstup do `out/`).                                      |
| `npm start`                             | Náhled sestavené aplikace (`electron-vite preview`).                                       |
| `npm run build:win`                     | Build + instalátor `dist/portfolio-tracker-<verze>-setup.exe`, `.blockmap` a `latest.yml`. |
| `node scripts/generate-example.mjs`     | Znovu vygeneruje ukázkový export `examples/...`.                                           |
| `node scripts/release-notes.mjs v1.2.3` | Vypíše sekci verze z `CHANGELOG.md` a ověří shodu s `package.json`.                        |

CI (`.github/workflows/ci.yml`) při každém pushi do `main` a u pull requestů spouští: instalaci (`npm ci`),
Prettier, ESLint, typecheck, testy a build. **Před commitem to samé spusť lokálně.**

## 4. Vývojová data a proměnné prostředí

Aplikace ukládá data do `%APPDATA%\portfolio-tracker`. Nainstalovaná aplikace a vývojový běh by tedy
**sdílely** stejná data. Proto `spustit.bat` nastavuje `PT_DATA_DIR` na složku `vyvoj-data` v projektu
(je v `.gitignore`).

| Proměnná                  | Význam                                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `PT_DATA_DIR`             | Přepíše složku s daty (soubory `portfolio.json`, `prices.json`, `settings.json`, `summaries.json`, `backups\`). |
| `PT_IMPORT_FILE`          | Jen vývoj: import použije tento soubor místo dialogu (pro automatické testy).                                   |
| `PT_EXPORT_DIR`           | Jen vývoj: export se uloží do této složky bez dialogu.                                                          |
| `PORTABLE_EXECUTABLE_DIR` | Nastavuje electron-builder u přenosné verze; aplikace pak nehledá aktualizace.                                  |
| `ELECTRON_RENDERER_URL`   | Nastavuje `electron-vite dev` (adresa dev serveru).                                                             |

> Při práci se **skutečnými** daty si před experimentem zkopíruj složku `%APPDATA%\portfolio-tracker`.
> Aplikace sice před každým zápisem zálohuje, ale kopie celé složky je jistější.

## 5. Jak se pracuje

Projekt vznikal po **přírůstcích**: jeden po druhém, každý s postupem _implementace → testy → kontrola →
potvrzení → commit_. Doporučený postup pro každou změnu:

1. Malá změna, jedno téma. Výpočty jako čisté funkce v `src/core/` s testem (viz
   [Jak přidat novou věc](08-technicka-dokumentace.md#15-jak-přidat-novou-věc)).
2. `npm run typecheck && npm run lint && npm run format:check && npm test`.
3. Ověř ručně v `npm run dev` (UI se automaticky netestuje).
4. Commit s popisnou zprávou (zprávy v repozitáři jsou česky, např. „P27: …“).

Konvence kódu: TypeScript `strict`, Prettier (jednoduché uvozovky, bez středníků, šířka 100, bez koncových
čárek), komentáře a texty UI česky, identifikátory anglicky, soubory s LF (`.gitattributes`).

## 6. Osobní data a veřejný repozitář

Repozitář je **veřejný**. Osobní finanční data se do něj **nikdy** nesmí dostat.

| Co                                                              | Jak je ošetřeno                                                                               |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Export transakcí (`Všechny_transakce.json`, `*transakce*.json`) | `.gitignore`, a také vyloučeno z instalátoru (`electron-builder.yml`)                         |
| Testy na skutečných datech (`*.local.test.ts`)                  | `.gitignore`                                                                                  |
| Vývojová data (`vyvoj-data/`)                                   | `.gitignore`                                                                                  |
| Ukázky v dokumentaci a v testech                                | **Jen vymyšlené hodnoty.** Skutečné částky, cíle a velikost portfolia do dokumentace nepatří. |

Před zveřejněním nové dokumentace nebo testů zkontroluj, že neobsahují čísla z vlastních dat. Použij
vymyšlené příklady (jako v `examples/` a v testovacích fixturách).

## 7. Vydání nové verze

Verze se řídí [sémantickým verzováním](https://semver.org/lang/cs/). Vydání spouští **push tagu `v*`**; to
udělá GitHub Actions (`release.yml`).

```
 1. CHANGELOG.md:  přidej sekci "## [X.Y.Z] – RRRR-MM-DD" nad předchozí verzi
 2. package.json:  "version": "X.Y.Z"
 3. package-lock.json:  stejná verze na řádcích 3 a 9 ("version" kořenového balíčku)
 4. README.md:  řádek "Stav: vydána verze X.Y.Z"
 5. kontroly:  npm run typecheck && npm run lint && npm run format:check && npm test
               node scripts/release-notes.mjs vX.Y.Z      <- musí vypsat poznámky bez chyby
 6. commit:    git commit -m "Vydání X.Y.Z: ..."
 7. push:      git push origin main
 8. tag:       git tag -a vX.Y.Z -m "Portfolio Tracker X.Y.Z"
               git push origin vX.Y.Z               <-- tím se spustí vydání
 9. sleduj:    gh run list --limit 3      (workflow "Release" trvá cca 3-5 minut)
10. ověř:      gh release view vX.Y.Z --json assets --jq '.assets[].name'
               musí tam být:  portfolio-tracker-X.Y.Z-setup.exe
                              portfolio-tracker-X.Y.Z-setup.exe.blockmap
                              latest.yml
```

Workflow selže (a vydání se nevytvoří), pokud:

- lint, typecheck nebo testy neprojdou,
- verze v tagu nesouhlasí s `package.json`,
- v `CHANGELOG.md` chybí sekce `## [X.Y.Z]`.

Chybějící `latest.yml` nebo `.blockmap` ve vydání znamená, že se **aplikace nebudou umět samy
aktualizovat** (updater podle `latest.yml` pozná novou verzi).

**Přílohy vydání nemažou starší verze.** Na GitHubu zůstávají všechny, dokud je ručně nesmažeš
(`gh release delete-asset`, resp. `gh release delete`). Kapacitně to nevadí (instalátor má ~127 MB), ale
mazání starých vydání můžeš někdy udělat pro přehlednost. Pro automatické aktualizace stačí to nejnovější.

Nesprávné vydání:

- Špatné poznámky: `gh release edit vX.Y.Z --notes-file soubor.md`.
- Vadná verze: nepřepisuj tag, raději vydej **další opravnou verzi** (X.Y.Z+1). Klientům, kteří už
  aktualizovali, se tak automaticky nabídne oprava.

## 8. Test aktualizace

Skutečnou aktualizaci nelze otestovat jednotkově (testy používají falešný updater). Postup:

```
 stará verze (A) nainstalovaná  ----->  vydej novou verzi (B)
         |
         v
 Nastavení -> Aplikace -> "Zkontrolovat aktualizace"
         |
         v
 "Stahuji verzi B (n %)" -> "Restartovat a nainstalovat" -> okno "Instaluji..."
         |
         v
 okno instalátoru s průběhem -> "Dokončit" -> app se spustí -> "Aplikace byla aktualizována na verzi B"
```

Pozor na antivirus (např. Avast), který může blokovat spuštění nepodepsaného instalátoru. Při potížích
přidej výjimku pro `%LOCALAPPDATA%\Programs\portfolio-tracker` a `%LOCALAPPDATA%\portfolio-tracker-updater`
(tam updater instalátor stahuje).

## 9. Co zkontrolovat po dlouhé pauze

Po delší době (měsíce až roky) projekt **nemusí fungovat tak, jak jsi ho nechal**. Projdi postupně:

```
 [ ] 1. git pull; npm ci                    -> nainstalují se přesně uzamčené závislosti
 [ ] 2. npm run typecheck && npm run lint && npm test
        -> pokud vše prochází, jádro (core) je v pořádku
 [ ] 3. npm run dev  +  import ukázkového souboru
        -> aplikace se otevře a ukáže data
 [ ] 4. ETF a kurzy -> "Aktualizovat kurzy"
        -> zdroje dat se mohly změnit! viz níže
 [ ] 5. npm audit; npm outdated             -> bezpečnostní opravy, nové hlavní verze
 [ ] 6. GitHub Actions: verze akcí (actions/checkout, actions/setup-node) a Node 24
        -> starší verze GitHub časem vyřadí; případně uprav .github/workflows/*.yml
 [ ] 7. npm run build:win                   -> sestaví se instalátor?
```

**Nejkřehčí místa** (externí závislosti, které se mohou změnit bez tvého přičinění):

| Místo                                     | Co se může stát                                                                                                   | Kde opravit                                                                                                                                |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Yahoo Finance** (neoficiální chart API) | Změní se formát odpovědi nebo začne odmítat požadavky (HTTP 429, nutný cookie/crumb). Kurzy ETF přestanou chodit. | `src/core/prices/yahoo.ts` (parser), `src/main/price-service.ts` (hlavičky, opakování). Ukázky odpovědí a testy jsou v `src/core/prices/`. |
| **ČNB** (denní kurzy)                     | Změna adresy nebo formátu textového souboru.                                                                      | `src/core/prices/cnb.ts`                                                                                                                   |
| **Eurostat HICP**                         | Změna API nebo kódu datové sady.                                                                                  | `src/core/prices/hicp.ts`                                                                                                                  |
| **Claude Code CLI**                       | Změna přepínačů (`--tools`, `--setting-sources`, `--effort`, výstup JSON) nebo formátu `auth status`.             | `src/main/claude-code.ts` (funkce `claudeGenerate`, `checkClaudeCode`)                                                                     |
| **Ollama API**                            | Změna `/api/generate` nebo `/api/tags`.                                                                           | `src/main/ollama.ts`                                                                                                                       |
| **electron-updater / electron-builder**   | Změna formátu `latest.yml`, jiné chování NSIS při aktualizaci.                                                    | `src/main/updater.ts`, `electron-builder.yml`                                                                                              |
| **Electron**                              | Nová hlavní verze (změny API, Node, Chromium).                                                                    | Aktualizuj opatrně po jedné hlavní verzi, vždy `npm test` a ruční zkouška.                                                                 |

## 10. Časté potíže

| Příznak                                                     | Příčina a řešení                                                                                                                                                            |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev` skončí chybou **„Electron uninstall“**        | Novější npm nespustil instalační skript Electronu, proto chybí `node_modules/electron/path.txt`. Spusť `node node_modules/electron/install.js` (`spustit.bat` to dělá sám). |
| Okno se otevírá na jiném monitoru                           | Okno se centruje na displej s kurzorem myši při startu. Spouštíš-li z klávesnice, kurzor může být jinde.                                                                    |
| `spustit.bat` otevře starou verzi aplikace                  | Spouštíš `spustit.bat` z **jiné složky** (např. staré kopie projektu). Zkontroluj cestu v titulku okna příkazové řádky.                                                     |
| Změny v kódu se neprojeví                                   | Zastav `npm run dev` a spusť znovu. U změn v hlavním procesu (`src/main/`) a preloadu je restart nutný; renderer se překresluje sám.                                        |
| `npm install` hlásí varování „allow-scripts“                | Novější npm nespouští instalační skripty automaticky. Pro Electron viz výše; ostatní balíčky (např. `electron-winstaller`) pro vývoj nepotřebuješ.                          |
| Instalátor se nespustí („nemá přístup k určenému zařízení“) | Blokuje ho antivirus nebo příznak „stažený z internetu“. Odblokovat v Vlastnostech souboru, případně výjimka v antiviru.                                                    |
| CI selže jen na Prettieru                                   | Spusť `npm run format` a commitni změny.                                                                                                                                    |
| Vydání selhalo                                              | `gh run view <id> --log-failed`. Častá příčina: neshoda verze v tagu a `package.json`, chybějící sekce v CHANGELOG, neprošlé testy.                                         |
| Aplikace neukazuje data                                     | Zkontroluj, jestli neběží se **vývojovou** složkou (`PT_DATA_DIR`): vývojová data jsou jiná než data nainstalované aplikace.                                                |
