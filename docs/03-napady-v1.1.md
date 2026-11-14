# Nápady na další funkce (po v1.0)

Stav: **k rozhodnutí** (brainstorming z 2026-11-12). Nic z toho zatím není v rozsahu v1.0.
Sloupec _Rozhodnutí_ vyplní autor: **v1.0** / **v1.1** / **později** / **ne**.

Hodnota = kolik to reálně pomůže, Práce = složitost (nízká / střední / vyšší).

## A) Lokální AI (data zůstávají v počítači)

Pravidlo: **čísla vždy počítá kód, model jen rozumí otázce a formuluje odpověď** (jinak hrozí vymyšlené hodnoty).
Model běží lokálně (např. Ollama nebo vestavěný model přes node-llama-cpp); nic se neposílá do cloudu.

| #   | Nápad                                                                                                                              | Hodnota | Práce   | Rozhodnutí |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | ------- | ------- | ---------- |
| A1  | **Zápis větou:** „včera jsem koupil 3 SPYL u Freedom24 za 2 505 €“ → předvyplní formulář, uživatel zkontroluje a uloží             | střední | střední |            |
| A2  | **Chat nad portfoliem:** „kolik jsem vydělal v 2025?“ – model volá existující výpočty (výkon, investice, alokace) a odpovídá česky | vysoká  | vyšší   |            |
| A3  | **Import výpisu z brokera pomocí AI:** PDF/CSV z XTB, Degira, Freedom24 → transakce (navazuje na B3)                               | vysoká  | vyšší   |            |
| A4  | **Měsíční shrnutí slovy** („V říjnu jsi investoval…, portfolio vzrostlo o…“)                                                       | střední | nízká   |            |
| A5  | **Vysvětlovač metrik a propadů** (z vlastních dat, bez znalosti světa)                                                             | nízká   | nízká   |            |
| A6  | **Hlídač chyb v zápisech** (překlep v počtu kusů, zdvojený nákup, cena mimo kurz) – většina jde i bez AI pravidly                  | nízká   | nízká   |            |

## B) Funkce na míru českému dlouhodobému investorovi

| #   | Nápad                                                                                                         | Hodnota | Práce   | Rozhodnutí |
| --- | ------------------------------------------------------------------------------------------------------------- | ------- | ------- | ---------- |
| B1  | **Daňový časový test 3 roky:** které kusy lze po 3 letech prodat bez daně (FIFO loty)                         | vysoká  | střední |            |
| B2  | **Realizovaný zisk** z prodejů po letech + podklad pro daňové přiznání (dnes appka ukazuje jen nerealizovaný) | vysoká  | střední |            |
| B3  | **Import výpisů z brokerů** (CSV/XLSX z XTB, Degira, Freedom24) přesnými parsery                              | vysoká  | vyšší   |            |
| B4  | **Dividendy:** kalendář, výnos, doplnění chybějících dividend VUSA                                            | střední | střední |            |
| B5  | **Srovnání s benchmarkem** (MSCI World / S&P 500) při stejných vkladech                                       | vysoká  | střední |            |
| B6  | **Rebalancing:** cílová alokace a návrh, co tento měsíc dokoupit                                              | vysoká  | střední |            |
| B7  | **Reálná hodnota po inflaci** na grafech a v cíli                                                             | střední | nízká   |            |

## C) Analytika a grafy

| #   | Nápad                                                                                         | Hodnota | Práce   | Rozhodnutí |
| --- | --------------------------------------------------------------------------------------------- | ------- | ------- | ---------- |
| C1  | **Riziko:** max. propad (drawdown), volatilita, doba zotavení                                 | střední | nízká   |            |
| C2  | **Monte Carlo projekce** cíle („s 80 % pravděpodobností dosáhneš cíle do roku X“)             | vysoká  | střední |            |
| C3  | **Kalkulačka čerpání** (pravidlo 4 %, FIRE) – kolik lze měsíčně čerpat z naspořené částky     | střední | nízká   |            |
| C4  | **Rozpad ETF dovnitř (look-through):** země, sektory, největší firmy (potřebuje externí data) | střední | vyšší   |            |
| C5  | **Poplatky a TER:** roční náklady fondů a brokerů                                             | nízká   | nízká   |            |
| C6  | **DCA analýza:** průměrná nákupní cena, nejlepší/nejhorší měsíc nákupu                        | nízká   | nízká   |            |

## D) Pohodlí a spolehlivost

| #   | Nápad                                                                        | Hodnota | Práce   | Rozhodnutí |
| --- | ---------------------------------------------------------------------------- | ------- | ------- | ---------- |
| D1  | **Export:** CSV, Excel, PDF měsíční report                                   | střední | nízká   |            |
| D2  | **Záloha do cloudové složky** (OneDrive/Dropbox) a šifrovaný export          | střední | nízká   |            |
| D3  | **Paleta příkazů (Ctrl+K):** rychlé akce a hledání                           | nízká   | nízká   |            |
| D4  | **Zámek heslem** při spuštění                                                | nízká   | střední |            |
| D5  | **Automatické aktualizace appky** (vyžaduje podepisování kódu)               | střední | vyšší   |            |
| D6  | **Systémové oznámení** „tento měsíc ještě nezainvestováno“ i mimo okno appky | střední | nízká   |            |
| D7  | **Více cílů** (rezerva, dům…) a více portfolií                               | nízká   | střední |            |

## Doporučené pořadí (návrh)

1. **B3 import výpisů** + **B1 daňový časový test** (+ **B2 realizovaný zisk**) – největší reálný přínos pro CZ investora.
2. **B5 benchmark** + **C2 Monte Carlo** – změní čtení výkonu a cíle.
3. AI: začít **A1 zápis větou** a **A4 měsíční shrnutí**; **A2 chat** až po stabilním základu.

Vydání **v1.0** doporučuji bez těchto funkcí; výjimku lze udělat pro **B2**.
