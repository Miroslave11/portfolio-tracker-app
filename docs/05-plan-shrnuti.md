# Plán: stránka Shrnutí portfolia (přírůstky P24–P28)

Stav: **k odsouhlasení** (2026-11-13). Navazuje na P23 (měsíční shrnutí na Přehledu, lokální AI přes Ollamu).
Podobu měsíčního článku uživatel schválil 13. 11. 2026.

Postup je stejný jako dřív: **jeden přírůstek po druhém**. Každý přírůstek: implementace → testy → přesný návod, co zkontrolovat → čekání na potvrzení → commit.

## Zásady (platí pro všechny přírůstky)

- **Čísla počítá vždy kód** (stejně jako v P23). AI jen píše text; každé číslo v textu se ověří proti spočítaným faktům. Když nesedí, použije se šablonový text.
- **Článek se uloží tak, jak se vytvořil** (do `summaries.json` v datech aplikace vedle portfolia). Starší shrnutí se tedy samo nemění. Tlačítkem **Vytvořit znovu** ho jde přegenerovat z dnešních dat.
- **Vytváření:** při prvním spuštění aplikace po skončení období („dohnání“ všech chybějících článků). Kvartál, pololetí a rok se vytvoří po skončení období.
- **Karta Měsíční shrnutí na Přehledu** (z P23) zůstane jako krátká upoutávka s odkazem na celý článek.
- Nejde o finanční poradenství; „Výhled“ a návrh nákupu jsou informativní (jako v P20).

## Přírůstky

### P24 – Stránka Shrnutí portfolia + měsíční článek (standardní rozsah)

- **Kde:** nová položka menu **Shrnutí** (mezi Přehledem a Investicemi). Vlevo seznam článků po letech, vpravo článek. Přepnutí na **Seznam** (blog) s filtrem Vše / Měsíce / Kvartály / Pololetí / Roky. Na Přehledu z karty P23 vznikne upoutávka s odkazem „Celé shrnutí“.
- **Obsah článku:** V kostce (šablonový text), 4 hlavní čísla, graf průběhu měsíce s vyznačenými nákupy a největším propadem, rozklad změny („Odkud se vzala změna“: vklady / změna cen / poplatky), tabulka ETF (hodnota, váha, výkon, příspěvek, nákupy), nákupy porovnané s měsíčním plánem, cesta k cíli. **Bez dividend** (rozhodnutí uživatele 13. 11. 2026 – dividendy se v článcích nezobrazují).
- **Jádro:** rozšíření `core/monthly-summary.ts` o denní řadu, rozklad a příspěvky jednotlivých ETF. Nový `core/summary-article.ts` (článek = seznam sekcí s fakty). `main/summary-store.ts` pro ukládání a čtení `summaries.json` (validace zod, poškozený soubor = prázdný seznam + záloha).
- **Zpětně:** tlačítko „Vytvořit zpětně“ vytvoří články za všechny ukončené měsíce od první transakce (bez AI, rychle).
- **Testy:** rozklad sedí (začátek + vklady + ceny − poplatky = konec), součet příspěvků ETF = změna trhem, plán nákupů (splněno / nesplněno / bez plánu), uložení a načtení článku, „dohnání“ (který měsíc chybí → vytvořit; nic nevytvářet dvakrát).
- **Tvůj test:** otevřít Shrnutí, zkontrolovat říjen 2026 proti Přehledu a Transakcím, vytvořit zpětně a projít několik starších měsíců.

### P25 – Detailní sekce + nastavení rozsahu

- **Sekce navíc:** srovnání s trhem (benchmark z P16), riziko v měsíci (P15), alokace vs. cílová alokace a návrh rozdělení dalšího nákupu (P20), kurz EUR/CZK a jeho vliv, časový test (P14: co se uvolní v dalším měsíci), výhled na další měsíc, u cíle odhad roku dosažení (pásmo z Monte Carlo, P18).
- **Nastavení → Shrnutí portfolia:** rozsah **Stručný / Standardní / Detailní** a zaškrtávání jednotlivých sekcí (úroveň rozsahu jen přednastaví zaškrtnutí). Rozsah se uplatní při zobrazení, takže změna platí hned i pro starší články. Nastavení pro kvartál, pololetí a rok a volba, co vytvářet automaticky, přibudou v P26. _Měna shrnutí (EUR / Kč) zatím není – čísla jsou v EUR, Kč u hodnoty, cíle a vlivu kurzu._
- **Jádro:** sekce jako samostatné funkce nad existujícími moduly (`risk.ts`, `benchmark.ts`, `rebalance.ts`, `time-test.ts`, `monte-carlo.ts`), žádné nové výpočty trhu.
- **Testy:** každá sekce na ručních datech, chybějící data (žádný plán, žádná cílová alokace, bez kurzu benchmarku) = sekce se vynechá s poznámkou, rozsah → správná sada sekcí.
- **Tvůj test:** přepnout rozsah a sekce v Nastavení a ověřit, že se článek hned změní; u článku z P24 „Vytvořit znovu“ doplní detailní údaje.

### P26 – Kvartál, pololetí a rok

- **Co:** stejné sekce pro delší období. Navíc tabulka po měsících (výkon a nákupy každého měsíce), nejlepší a nejhorší měsíc. U roku také realizovaný zisk a prodeje za rok (P13, informativně), srovnání s předchozím rokem a posun k cíli za rok.
- **Jádro:** zobecnění „měsíc“ → „období“ (`RRRR-MM`, `RRRR-Q3`, `RRRR-H1`, `RRRR`).
- **Testy:** hranice období (přestupný rok, kvartál přes konec roku), součty měsíců = období, výkon období = složení měsíčních výkonů.
- **Tvůj test:** 3. kvartál 2026, 1. pololetí 2026 a rok 2025 proti obrazovce Výkon.

### P27 – Delší text od lokální AI + nastavení AI

- **Co:** AI napíše „V kostce“, „Komentář“ (průběh, co táhlo, co brzdilo) a „Výhled“. Každý kus se ověřuje zvlášť; kus, který neprojde, zůstane šablonový (ostatní z AI se ponechají). Štítek u článku: „text: lokální AI · čísla ověřena ✓“ nebo „text: šablona“.
- **Nastavení → Lokální AI** (rozšíření karty z P23): co má AI psát (V kostce / Komentář / Výhled), délka komentáře (krátký 1 odstavec / střední 2–3 / dlouhý 4–6), styl (věcný / přátelský). Zvlášť pro měsíc a pro delší období.
- **Testy:** sestavení promptu podle nastavení, ověřování po částech, výpadek Ollamy = celý článek ze šablony a později jde dát Vytvořit znovu.
- **Tvůj test:** vytvořit článek s AI v různých délkách, vypnout Ollamu a ověřit náhradní text.

### P28 – PDF článku

- **Co:** tlačítko **PDF** u článku uloží celé shrnutí jako PDF (A4, stejné vykreslení jako export v P21, grafy jako obrázky).
- **Testy:** sestavení HTML pro PDF ze sekcí článku (všechny rozsahy), escapování textu z AI.
- **Tvůj test:** uložit PDF říjnového a ročního shrnutí a zkontrolovat, že odpovídá článku v aplikaci.

_Odesílání e-mailem se zatím nedělá (rozhodnutí uživatele 13. 11. 2026); případně později jako samostatný přírůstek._

## Vydání

P23 zatím není vydaná (čeká v1.3 a v1.4). Návrh: **v1.3** vydat hned (P20–P22 + P23). P24–P28 pak tvoří **v1.4 „Shrnutí portfolia“**.
