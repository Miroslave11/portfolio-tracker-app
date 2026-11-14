# Changelog

Všechny podstatné změny aplikace Portfolio Tracker. Formát vychází z [Keep a Changelog](https://keepachangelog.com/cs/1.1.0/), verze podle [sémantického verzování](https://semver.org/lang/cs/).

## [1.5.1] – 2026-11-14

Přehlednější Nastavení.

### Změněno

- **Nastavení je rozdělené do částí** s podmenu vlevo: Vzhled, Obecné, Šablony (měsíční nákup), Umělá inteligence (včetně rozsahu a sekcí Shrnutí portfolia), Data a zálohy a Aplikace (aktualizace, verze, odkaz na GitHub). Obsah se nemění, jen se přeskupil a nic se neztratí. Odkaz „Rozsah“ na obrazovce Shrnutí otevře rovnou správnou část.

### Poznámka

- Toto vydání slouží zároveň jako první ověření automatické aktualizace z verze 1.5.0.

## [1.5.0] – 2026-11-14

Automatické aktualizace.

### Přidáno

- **Automatické aktualizace:** nainstalovaná aplikace při spuštění a pak každé 4 hodiny hledá novější vydání na GitHubu, stáhne ho na pozadí a ukáže pruh „Restartovat a nainstalovat“ (jinak se nainstaluje při zavření aplikace). V Nastavení → Obecné je přepínač, ruční kontrola a stav. Data v %APPDATA% zůstávají nedotčená. Při hledání se kromě čísla verze nic neodesílá.
- **spustit.bat** pro vývoj používá vlastní složku dat (`vyvoj-data`), aby nesahal na data nainstalované aplikace.

### Změněno

- Vydání obsahuje jen instalátor (`setup.exe`); přenosná verze (`portable.exe`) se už nevydává, protože se neumí aktualizovat.

### Upozornění

- **Verze 1.5.0 je první s aktualizacemi:** starší verze (1.4.0 a méně) je neobsahují, proto 1.5.0 nainstaluj ručně přes stávající instalaci. Od ní dál už se aplikace aktualizuje sama.
- Aplikace není digitálně podepsaná. Aktualizace se ověřují kontrolním součtem z vydání, ale ne podpisem.

## [1.4.0] – 2026-11-14

Shrnutí portfolia, cílová alokace, export a AI texty.

### Přidáno

- **Shrnutí portfolia:** nová obrazovka s články za měsíc, kvartál, pololetí a rok. Článek vznikne sám po skončení období (chybějící se dohoní, starší jde vytvořit zpětně) a uloží se tak, jak byl vytvořen. Obsahuje „V kostce“, hlavní čísla, graf průběhu, rozklad změny, tabulku ETF, nákupy proti plánu, srovnání s trhem, riziko, alokaci proti cíli, cestu k cíli s odhadem, vliv kurzu EUR/CZK, časový test a výhled; u delších období tabulku po měsících a „Rok v číslech“. Rozsah a sekce se nastavují v Nastavení → Shrnutí portfolia.
- **Texty od AI (volitelné):** „V kostce“, „Komentář“ a „Výhled“ může napsat umělá inteligence – lokální **Ollama**, nebo **Claude Code** z předplatného (bez API klíče). Každé číslo v textu se ověří proti výpočtu, část s chybou se zahodí a zůstane šablona. Nastavuje se, co AI píše, délka komentáře a styl. Pozor: s Claude Code se fakta o portfoliu odesílají Anthropicu, s Ollamou nic neopouští počítač.
- **PDF článku:** tlačítko PDF uloží celý článek na A4 podle zapnutých sekcí, včetně grafů.
- **Cílová alokace:** cílové podíly podle indexu a rozdělení měsíčního nákupu jen dokupováním.
- **Export:** CSV, Excel a PDF měsíční report a záloha dat.
- **Paleta příkazů (Ctrl+K)** a zkratky Ctrl+N a Ctrl+M.
- **Ukázkový export** `examples/ukazka-portfolio-performance.json` k vyzkoušení bez vlastních dat.

### Změněno

- Obrazovka **Cíl** a položka menu se jmenují jen „Cíl“ (částku nastavíš na obrazovce Cíl); výchozí cíl pro nové nastavení je 5 mil. Kč.
- Z Přehledu je odstraněna karta Měsíční shrnutí; shrnutí jsou na obrazovce Shrnutí.

Texty od AI a výhled jsou informativní, nejde o investiční doporučení.

## [1.2.0] – 2026-11-13

Inflace, nejistota a plánování čerpání.

### Přidáno

- **Hodnoty po inflaci:** přepínač „Po inflaci“ v horní liště přepočte Přehled, Výkon (včetně rizika a srovnání s benchmarkem) a Cíl do dnešních cen. Inflace se stahuje z Eurostatu (HICP eurozóny pro EUR, Česka pro Kč). Na Cíli se pak počítá s reálným výnosem a s nastavitelnou budoucí inflací.
- **Cíl → Monte Carlo:** 5 000 možných vývojů s kolísáním trhu (počítá se na pozadí, okno se nezasekne). Pásma 10–90 % a 25–75 %, medián, kdy jsi v cíli s 80% jistotou a v horším scénáři, a šance na dosažení cíle podle roku. Výchozí kolísavost se bere z historie portfolia.
- **Cíl → Kalkulačka čerpání:** kolik lze měsíčně čerpat z cíle, z dnešní hodnoty nebo z vlastní částky. Ukazuje pravidlo 4 %, jak dlouho kapitál vydrží, čerpání podle délky (20–50 let i „navždy“) a graf kapitálu a jeho kupní síly. Čerpání se každý rok zvyšuje o inflaci.
- **Kalkulačka čerpání → Jen dividendy:** varianta, kdy celý kapitál převedeš do dividendového ETF (výchozí SCHD, nebo jiný Yahoo ticker) a čerpáš jen čisté dividendy. Historie výplat se stahuje z Yahoo: výnos za 12 měsíců, růst dividend za 5 a 10 let a skutečný celkový výnos fondu. Kalkulačka ukáže příjem po letech v korunách i v dnešních cenách a férové srovnání s prodejem podílů při stejném celkovém výnosu. U optimistických předpokladů upozorní.

Výpočty jsou orientační (zjednodušené modely), nejde o investiční doporučení.

## [1.1.0] – 2026-11-13

Daně, riziko a srovnání s indexem.

### Přidáno

- **Daně → Realizovaný zisk:** zisk z prodejů podle FIFO (nejstarší nákupy téhož fondu, podle ISIN napříč brokery), tabulka po letech, detail prodejů s rozbalením použitých nákupů, rozdělení na příjmy osvobozené časovým testem a příjmy k posouzení; v EUR i Kč (příjem kurzem ČNB ke dni prodeje, náklady ke dni nákupu).
- **Daně → Časový test 3 roky:** kolik je volné k prodeji bez daně, co se uvolní do 12 měsíců, nejbližší uvolnění, graf uvolňování po letech, přehled po fondech (kolik kusů lze prodat bez daně) a po jednotlivých nákupech.
- **Upozornění ve formuláři prodeje**, když prodej podle FIFO zahrne kusy držené kratší dobu než 3 roky (uložení neblokuje).
- **Výkon → Riziko:** největší propad, doba zotavení, roční volatilita, nejhorší měsíc a rok, graf propadu od vrcholu a tabulka největších propadů – vše pro zvolené období a bez vlivu vkladů.
- **Výkon → Srovnání s benchmarkem:** „co kdybys každý vklad dal do jednoho ETF“ – výchozí MSCI World (EUNL.DE), libovolné ETF z portfolia nebo vlastní Yahoo ticker; hodnota, TTWROR, IRR, rozdíl zisku a výnosu za období, graf.

### Opraveno

- Prodej se nově hlídá u každého brokera zvlášť – nelze prodat ETF u brokera, kde ho nedržíš.

Přehled je informativní, nejde o daňové poradenství.

## [1.0.0] – 2026-11-13

První vydání. Osobní desktopová aplikace pro sledování dlouhodobého ETF portfolia napříč brokery Freedom24, XTB a Degiro.

### Přehled a výkon

- **Přehled:** hodnota portfolia, vloženo, zisk (včetně IRR) a změna za den; graf hodnoty vs. vloženého kapitálu (1R / 3R / 5R / Max), pozice a poslední obchody.
- **Výkon:** TTWROR, IRR p.a. a absolutní zisk za libovolné období (1M, 3M, YTD, 1R, 3R, 5R, Max, kalendářní roky, vlastní od–do), graf kumulativního výkonu a tabulka po letech; vysvětlení metrik srozumitelnou češtinou.
- **Alokace:** koláč a tabulka podle indexu, ETF (sloučeno přes ISIN – EUNL.DE a IWDA.AS jsou jeden fond) a brokera; názvy a podíly přímo v grafu; úprava skupiny indexu a barvy ETF.
- **Měsíční investice:** nákupy po měsících rozdělené podle brokera, průměr a medián za 12 měsíců, roční součty.
- **Cíl:** postup k cíli, projekce s odhadem data dosažení, scénáře výnosu (±3 p. b.), nastavitelný cíl, měsíční vklad a očekávaný výnos.

### Data a transakce

- **Import** historie z Portfolio Performance (JSON) s náhledem a kontrolou dat před uložením.
- **Zápis transakcí:** nákup, prodej, vklad, výběr, dividenda, poplatek; dopočet kusů / ceny / částky z kurzu, automatický vklad k nákupu, přidání nového ETF; úprava a smazání včetně spárovaného vkladu.
- **Měsíční nákup:** šablona pravidelného nákupu, hromadný zápis jedním formulářem, upozornění „tento měsíc ještě nezainvestováno“.
- **Obchody:** hledání (bez ohledu na diakritiku), filtry podle typu, ETF a období, řazení sloupců, aktuální zisk u každého nákupu.
- **Kurzy** se stahují automaticky (Yahoo Finance pro ETF, ČNB pro EUR/CZK) a ukládají; aplikace funguje i offline z uložených kurzů.
- **Zálohy:** před každým zápisem, úpravou, smazáním i importem (posledních 30); složky s daty a zálohami jdou otevřít z Nastavení.

### Vzhled a ovládání

- Pět motivů (tmavý, světlý, půlnoční modrá, OLED černá, teplý), volitelná akcentní barva, sledování motivu Windows.
- Přepínač měny EUR / Kč (kurz ČNB) a globální filtr brokera pro všechny obrazovky.
- Instalátor pro Windows (bez práv správce, odinstalace nemaže data) a přenosná verze.

### Známá omezení

- Historické dividendy VUSA nejsou v datech, zisk a výkon VUSA jsou proto mírně podhodnocené.
- Aplikace není digitálně podepsaná – Windows ji při prvním spuštění může označit jako neznámou („Další informace → Přesto spustit“).
- Přenosná verze se při každém spuštění rozbaluje (cca 10 s); instalovaná verze startuje okamžitě.
- Projekce cíle je zjednodušená (konstantní výnos a kurz, bez inflace a daní).
