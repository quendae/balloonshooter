const assert = require("assert");
const B = require("./balloon.js");

// --- geometria ---
assert.strictEqual(B.rowCols(0), 10, "rząd parzysty 10 kolumn");
assert.strictEqual(B.rowCols(1), 9, "rząd nieparzysty 9 kolumn");
assert.strictEqual(B.colX(0, 0), 12);
assert.strictEqual(B.colX(1, 0), 12 + 24);
assert.strictEqual(B.colX(0, 1), 24);
assert.strictEqual(B.colX(1, 1), 24 + 24);
assert(B.inGrid(0, 0) && B.inGrid(9, 0) && !B.inGrid(10, 0));
assert(B.inGrid(8, 1) && !B.inGrid(9, 1));
assert(!B.inGrid(0, 10), "rząd 10 poza planszą");

// --- sąsiedztwo: komórka (5,0) ma 6 sąsiadów (pełny heks, bez ścian bocznych od dołu? rząd0 u sufitu => 5) ---
// rząd 0: sąsiedzi w rzędzie to kolumny 4,6; niżej rząd 1: kolumny 4,5 (przesunięcie)
{
  const ns = B.neighbors(5, 0);
  const got = ns.map(([c, r]) => c + "," + r).sort();
  assert.deepStrictEqual(got, ["4,0", "4,1", "5,1", "6,0"].sort(), "sąsiedzi (5,0)");
}
// kolumna środkowa rzędu nieparzystego (4,1): pełne 6 sąsiadów
{
  const ns = B.neighbors(4, 1);
  assert.strictEqual(ns.length, 6, "6 sąsiadów (4,1), dostałem: " + JSON.stringify(ns));
}
// symetria
{
  const a = B.neighbors(3, 2).map(([c, r]) => c + "," + r);
  for (const [c, r] of B.neighbors(3, 2)) {
    const b = B.neighbors(c, r).map(([cc, rr]) => cc + "," + rr);
    assert(b.includes("3,2"), "sąsiedztwo symetryczne dla 3,2");
  }
}

// --- prefill rzędu, klaster, pękanie ---
function rowFill(n, color) {
  const g = new Map();
  for (let c = 0; c < n; c++) g.set(B.key(c, 0), color);
  return g;
}
{
  // rząd 0: 5 balonów tego samego koloru => wstawiając szósty pęka (6 >= 3)
  const g = rowFill(5, 1);
  B.setBalloon(g, 5, 0, 1);
  const res = B.settle(g, 5, 0);
  assert.strictEqual(res.popped.length, 6, "6 pękło: " + res.popped);
  assert.strictEqual(g.size, 0, "plansza pusta po pęknięciu");
}
{
  // dwa balony w rzędzie 0 + trzeci wstawiony => tylko 3 pękają
  const g = rowFill(2, 1);
  B.setBalloon(g, 2, 0, 1);
  const res = B.settle(g, 2, 0);
  assert.strictEqual(res.popped.length, 3);
  assert.strictEqual(g.size, 0);
}
{
  // różne kolory => brak pęknięcia
  const g = new Map();
  for (let c = 0; c < 3; c++) g.set(B.key(c, 0), c + 1);
  B.setBalloon(g, 3, 0, 3);
  const res = B.settle(g, 3, 0);
  assert.strictEqual(res.popped.length, 0, "nic nie pęka");
  assert.strictEqual(g.size, 4);
}
{
  // spadanie: balon odcięty od sufitu spada
  const g = new Map();
  g.set(B.key(4, 0), 1);  // sufit
  g.set(B.key(4, 1), 2);  // wisi na 4,0 (rząd 1, przesunięty; sprawdź sąsiada)
  // 4,0 (parzysty) sąsiaduje z 4,1 i 5,1? rząd1 x=24+24c; 4,0 x=12+96=108;
  // 4,1 x=24+96=120 dx=12, dy=20.8 => 24 ok sąsiad.
  assert(B.occ(g, 4, 0));
  const res = B.settle(g, 4, 0); // wstawienie w 4,0... ale ono już jest; wywołaj pęknięcie osobno
  assert.strictEqual(res.popped.length, 0);
}
{
  // wisi 2 balony na łańcuchu pod sufitem; usunięcie sufitu strąca oba
  const g = new Map();
  g.set(B.key(5, 0), 1);  // sufit
  g.set(B.key(5, 1), 2);  // pod spodem
  g.set(B.key(5, 2), 3);  // pod spodem dalej
  // pęknięcie łańcucha: wstaw balon koloru 1 obok (5,0) tak, by klaster nie powstał,
  // ale wtedy nic nie pęka... zamiast tego symuluj: usuń (5,0) ręcznie i policz
  g.delete(B.key(5, 0));
  const connected = B.topConnected(g);
  const drop = [...g.keys()].filter((k) => !connected.has(k));
  assert.deepStrictEqual(drop.sort(), [B.key(5, 1), B.key(5, 2)].sort(), "oba spadły");
}
{
  // klaster koloru przy suficie pęka i strąca wiszący inny kolor
  const g = new Map();
  g.set(B.key(5, 0), 1);
  g.set(B.key(6, 0), 1);
  g.set(B.key(5, 1), 2); // wisi pod 5,0
  B.setBalloon(g, 4, 0, 1); // domyka klaster 1 (4,5,6 w rzędzie0)
  const res = B.settle(g, 4, 0);
  assert.strictEqual(res.popped.length, 3, "klaster 1 pęka");
  assert.deepStrictEqual(res.dropped, [B.key(5, 1)], "balon 2 spada");
  assert.strictEqual(g.size, 0);
}

// --- findSnap: komórka poniżej sufitu, wsparcie od klastra ---
{
  const g = new Map();
  g.set(B.key(4, 0), 1);
  g.set(B.key(5, 0), 2);
  // strzał w przestrzeń pod (4,0): najbliższa wolna podparta w promieniu to (4,1)
  const [c, r] = B.findSnap(g, B.colX(4, 1), B.rowY(1) + 1);
  assert.deepStrictEqual([c, r], [4, 1], "snap pod balonem");
}
{
  // brak miejsca: pełna kolumna
  const g = new Map();
  for (let r = 0; r <= B.MAXROW; r++) for (let c = 0; c < B.rowCols(r); c++) g.set(B.key(c, r), 1);
  assert.strictEqual(B.findSnap(g, 120, 200), null, "pełna plansza => null");
}
{
  // dziura w ostatnim rzędzie łapie balon; pełna plansza => null
  const g = new Map();
  for (let r = 0; r <= B.MAXROW; r++) for (let c = 0; c < B.rowCols(r); c++) g.set(B.key(c, r), 1);
  g.delete(B.key(0, B.MAXROW)); // jedna wolna dziura w dolnym rzędzie
  const snap = B.findSnap(g, 0, B.rowY(B.MAXROW) + 2);
  assert(snap, "dziura w dolnym rzędzie łapie balon");
  g.set(B.key(0, B.MAXROW), 1); // wypełnij
  assert.strictEqual(B.findSnap(g, 120, 300), null, "wszystko pełne => null");
}

// --- support: balon w rzędzie 1 bez sąsiada nie może wisieć (pominięty przez findSnap) ---
{
  const g = new Map();
  g.set(B.key(4, 0), 1);
  const snap = B.findSnap(g, B.colX(0, 1), B.rowY(1)); // daleko od 4,0
  // jedyna wsparta wolna komórka musi być w rzędzie 0 (sufit)
  assert(snap[1] === 0, "samotny pocisk ląduje przy suficie, rząd=" + snap[1]);
}

// --- shiftDown: opad sufitu przesuwa CAŁĄ planszę o rząd w dół ---
{
  const g = new Map();
  g.set(B.key(3, 0), 1);
  g.set(B.key(4, 0), 2);
  g.set(B.key(0, 2), 3);
  B.shiftDown(g);
  assert.deepStrictEqual(
    [...g.entries()].sort(),
    [[B.key(0, 3), 3], [B.key(3, 1), 1], [B.key(4, 1), 2]].sort(),
    "wszystko zjechało o rząd, kolory zachowane"
  );
}
{
  const g = new Map();
  g.set(B.key(1, 1), 5);
  B.shiftDown(g);
  assert.strictEqual(g.size, 1, "balon nie znika przy opadzie");
  assert.strictEqual(g.get(B.key(1, 2)), 5, "kolor zachowany po opadzie");
}
{
  const g = new Map();
  g.set(B.key(1, B.MAXROW), 4);
  B.shiftDown(g);
  assert.strictEqual(g.size, 0, "dolny rząd wypada poza planszę");
}
{
  // Pełne 4 rzędy: po opadzie nic nie ląduje poza planszą. Rzędy heksa mają
  // naprzemiennie 10 i 9 kolumn, więc skrajna kolumna 9 wypada, gdy trafia
  // do rzędu nieparzystego (9 kolumn) — to jedyna dopuszczalna strata.
  const g = new Map();
  for (let r = 0; r <= 3; r++) for (let c = 0; c < B.rowCols(r); c++) g.set(B.key(c, r), 1);
  B.shiftDown(g);
  for (const k of g.keys()) {
    const [c, r] = B.split(k);
    assert(B.inGrid(c, r), "komórka po opadzie nadal w planszy: " + k);
    assert(r >= 1, "żaden balon nie został w rzędzie 0 (sufit pusty): " + k);
    assert(c < B.rowCols(r), "kolumna mieści się w rzędzie docelowym: " + k);
  }
  // Każdy parzysty rząd (10 kolumn) przesuwa się do nieparzystego (9 kolumn),
  // więc gubimy po jednej skrajnej kolumnie z rzędów 0 i 2 => 38 - 2 = 36.
  assert.strictEqual(g.size, 10 + 9 + 10 + 9 - 2, "przycięte tylko skrajne kolumny, reszta zachowana");
  assert(g.has(B.key(2, 1)), "środek rzędu 0 zachowany po opadzie");
}
{
  // Opad nie tworzy duplikatów: liczba balonów nigdy nie rośnie.
  const g = new Map();
  for (let r = 0; r <= 5; r++) for (let c = 0; c < B.rowCols(r); c++) g.set(B.key(c, r), 1);
  const before = g.size;
  B.shiftDown(g);
  assert(g.size <= before, "opad nie duplikuje balonów");
  assert.strictEqual(new Set(g.keys()).size, g.size, "brak zduplikowanych kluczy");
}

// --- lowestRow / rowCount: podstawa detekcji przegranej i paska presji ---
{
  const g = new Map();
  assert.strictEqual(B.lowestRow(g), -1, "pusta plansza => -1");
  g.set(B.key(0, 3), 1);
  g.set(B.key(5, 7), 2);
  g.set(B.key(6, 7), 2);
  assert.strictEqual(B.lowestRow(g), 7, "najniższy zajęty rząd");
  assert.strictEqual(B.rowCount(g, 0), 0, "rowCount nie liczy innych rzędów");
  assert.strictEqual(B.rowCount(g, 3), 1, "rowCount liczy balony wskazanego rzędu");
  assert.strictEqual(B.rowCount(g, 7), 2);
  assert.strictEqual(B.rowCount(g, 4), 0);
}
{
  const g = new Map();
  g.set(B.key(2, B.MAXROW - 1), 1);
  assert(B.lowestRow(g) < B.MAXROW, "balon wyżej niż MAXROW => gra trwa");
  g.set(B.key(3, B.MAXROW), 1);
  assert(B.lowestRow(g) >= B.MAXROW, "balon w MAXROW => koniec gry");
}

// --- pickColor: nigdy nie zwraca koloru, którego nie ma na planszy ---
{
  const g = new Map();
  g.set(B.key(0, 0), 2);
  g.set(B.key(1, 0), 5);
  for (let i = 0; i < 50; i++) {
    const c = B.pickColor(g);
    assert(c === 2 || c === 5, "kolor tylko z planszy, dostałem " + c);
  }
  assert.strictEqual(B.pickColor(g, [2]), 5, "wykluczony kolor nie wraca, gdy jest alternatywa");
  const forced = B.pickColor(g, [2, 5]);
  assert(forced === 2 || forced === 5, "pusta pula => fallback do kolorów z planszy");
}
{
  const g = new Map();
  g.set(B.key(0, 0), 1);
  g.set(B.key(1, 0), 3);
  assert.strictEqual(B.pickColor(g, null, () => 0), 1, "rng=0 => pierwszy kolor puli");
  assert.strictEqual(B.pickColor(g, null, () => 0.99), 3, "rng~1 => ostatni kolor puli");
}
{
  const g = new Map();
  assert.strictEqual(B.pickColor(g), 0, "pusta plansza => 0 (sygnał braku koloru)");
  assert.deepStrictEqual(B.colorPool(g, null), [], "pusta pula kolorów");
}

// --- scoreShot: combo, mnożnik i bonusy ---
{
  const s1 = B.scoreShot(3, 0, 1);
  assert.strictEqual(s1.base, 30, "baza: 3 pekniecia po 10");
  assert.strictEqual(s1.mult, 1, "pierwszy strzal bez mnoznika");
  assert.strictEqual(s1.total, 30, "3 balony na starcie serii = 30");
}
{
  const m = [1, 2, 3, 5, 9, 50].map((c) => B.scoreShot(3, 0, c).mult);
  assert.deepStrictEqual(m, [1, 1.5, 2, 3, 5, 8], "mnoznik serii: " + m.join(", "));
  assert(B.scoreShot(3, 0, 999).mult === 8, "mnoznik nie przekracza x8");
}
{
  assert(B.scoreShot(0, 3, 1).base > B.scoreShot(3, 0, 1).base, "strącenie > pęknięcie");
  assert.strictEqual(B.scoreShot(0, 3, 1).base, 60, "strącone po 20");
}
{
  assert.strictEqual(B.scoreShot(3, 0, 1).bonus, 0, "zwykłe pekniecie bez bonusu");
  assert(B.scoreShot(5, 0, 1).bonus > 0, "5+ to duza kasacja => bonus");
  assert(B.scoreShot(8, 0, 1).bonus >= 100, "8+ to MEGA POP => duzy bonus");
  assert(B.scoreShot(3, 3, 1).bonus > 0, "3+ strącone => bonus za lawine");
  assert(B.scoreShot(6, 0, 1).total > B.scoreShot(5, 0, 1).total, "monotoniczne w liczbie peknietych");
}
{
  assert.strictEqual(B.scoreShot(3, 0, 0).mult, 1, "combo 0 traktowane jak 1");
  assert.strictEqual(B.scoreShot(3, 0, undefined).mult, 1, "brak combo => mnoznik 1");
  assert.strictEqual(B.scoreShot(0, 0, 5).total, 0, "brak kasacji => brak punktow");
}

// --- shotsPerDrop: presja rośnie z poziomem, ale ma sensowne granice ---
{
  assert(B.shotsPerDrop(1) > B.shotsPerDrop(10), "wyzszy poziom = mniej strzalow na opad");
  for (let l = 1; l <= 40; l++) {
    const s = B.shotsPerDrop(l);
    assert(s >= 4 && s <= 10, "licznik w rozsadnych granicach na poziomie " + l + ": " + s);
  }
}

// --- ceilRow: sufit jako kotwica, ktora opada razem z plansza ---
{
  // Po opadzie sufitu rzad 0 jest pusty. Kotwica MUSI byc wtedy w rzedzie 1
  // (sufit zjechal razem z balonami), inaczej settle uznaje cala plansze za
  // odcieta i zrzuca ja co do balona.
  const g = new Map();
  for (let c = 0; c < B.rowCols(1); c++) g.set(B.key(c, 1), 1);   // rzad sufitu
  g.set(B.key(4, 2), 1);
  g.set(B.key(4, 3), 1);
  const before = g.size;
  // dokladamy balon innego koloru (brak pekniecia) i rozliczamy z ceilRow=1
  assert(B.setBalloon(g, 3, 2, 2), "wolna podparta komorka");
  const res = B.settle(g, 3, 2, 1);
  assert.strictEqual(res.popped.length, 0, "inny kolor => brak pekniecia");
  assert.strictEqual(res.dropped.length, 0, "opad nie moze zawalic planszy");
  assert.strictEqual(g.size, before + 1, "wszystko zostaje na planszy");
}
{
  // Dowod bledu, ktory to naprawia: z kotwica w rzedzie 0 (zachowanie
  // sprzed poprawki) cala plansza jest "odcieta" i settle zrzuca wszystko.
  const g = new Map();
  for (let c = 0; c < B.rowCols(1); c++) g.set(B.key(c, 1), 1);
  g.set(B.key(4, 2), 1);
  B.setBalloon(g, 3, 2, 2);
  const res = B.settle(g, 3, 2, 0);   // stara, bledna kotwica
  assert(res.dropped.length > 0, "z kotwica w rzedzie 0 plansza sie zawala (udokumentowany blad)");
}
{
  // topConnected kotwiczy sie dokladnie na ceilRow
  const g = new Map();
  g.set(B.key(2, 2), 1);
  g.set(B.key(2, 3), 1);
  assert.strictEqual(B.topConnected(g, 0).size, 0, "przy ceilRow=0 nic nie wisi na sufcie");
  assert.strictEqual(B.topConnected(g, 2).size, 2, "przy ceilRow=2 struktura wisi na sufcie");
}
{
  // Komorki NAD sufitem sa niedostepne...
  const g = new Map();
  g.set(B.key(0, 3), 1);
  assert.strictEqual(B.supported(g, 5, 0, 2), false, "rzad 0 jest nad sufitem (ceilRow=2)");
  assert.strictEqual(B.supported(g, 5, 1, 2), false, "rzad 1 tez jest nad sufitem");
  assert.strictEqual(B.supported(g, 5, 2, 2), true, "rzad sufitu zawsze podparty");
  assert.strictEqual(B.supported(g, 5, 0, 0), true, "przy ceilRow=0 to rzad 0 jest sufitem");
  assert.strictEqual(B.supported(g, 8, 3, 0), false, "bez sasiada i nie u sufitu => niepodparty");
}
{
  // ...i findSnap nigdy ich nie wskaze
  const g = new Map();
  for (let c = 0; c < B.rowCols(5); c++) g.set(B.key(c, 5), 1);
  const snap = B.findSnap(g, B.colX(4, 0), B.rowY(0), 9999, 5);
  assert(snap, "jest gdzie wyladowac");
  assert(snap[1] >= 5, "snap respektuje ceilRow, dostalem rzad " + snap[1]);
}
{
  // Odciecie od sufitu nadal dziala po zmianie: bez tego mechanika gry
  // (stracanie odcietych klastrow) bylaby zepsuta.
  const g = new Map();
  g.set(B.key(5, 0), 1);
  g.set(B.key(6, 0), 1);
  g.set(B.key(5, 1), 2);      // wisi pod 5,0
  B.setBalloon(g, 4, 0, 1);   // domyka klaster 1
  const res = B.settle(g, 4, 0, 0);
  assert.strictEqual(res.popped.length, 3, "klaster peka");
  assert.deepStrictEqual(res.dropped, [B.key(5, 1)], "wiszacy balon spada");
}
{
  // To samo odciecie, ale z sufitem opuszczonym do rzedu 1.
  const g = new Map();
  g.set(B.key(5, 1), 1);
  g.set(B.key(6, 1), 1);
  g.set(B.key(5, 2), 2);      // wisi pod 5,1
  B.setBalloon(g, 4, 1, 1);
  const res = B.settle(g, 4, 1, 1);
  assert.strictEqual(res.popped.length, 3, "klaster peka przy opuszczonym sufcie");
  assert.deepStrictEqual(res.dropped, [B.key(5, 2)], "wiszacy balon spada");
}

// --- Etap 0 z dokumentu: twarde testy geometrii i sąsiedztwa ---
// Dokument "deep dive" twierdził, że neighbors() ma `return` w pętli i zwraca
// wynik częściowy. Te testy to rozstrzygają: sąsiedztwo musi być PEŁNE
// (pole wewnętrzne = 6), SYMETRYCZNE i nigdy poza planszą.
{
  const counts = {};
  for (let r = 0; r <= B.MAXROW; r++) {
    for (let c = 0; c < B.rowCols(r); c++) {
      const n = B.neighbors(c, r);
      counts[n.length] = (counts[n.length] || 0) + 1;
      for (const [nc, nr] of n) {
        assert(B.inGrid(nc, nr), "sąsiad poza planszą: " + c + "," + r + " -> " + nc + "," + nr);
        const back = B.neighbors(nc, nr).some(([a, b]) => a === c && b === r);
        assert(back, "sąsiedztwo niesymetryczne: " + c + "," + r + " -> " + nc + "," + nr);
      }
    }
  }
  // 60 pól wewnętrznych musi mieć pełne 6 sąsiadów (dowód braku return w pętli)
  assert.strictEqual(counts[6], 60, "pól z 6 sąsiadami: " + counts[6] + " (oczekiwane 60)");
  assert(!counts[7] && !counts[8], "nikt nie może mieć >6 sąsiadów");
}
{
  // Pole wewnętrzne ma dokładnie 6 sąsiadów i są to właściwe heksy.
  const n = B.neighbors(4, 4).map(([c, r]) => c + "," + r).sort();
  assert.strictEqual(n.length, 6, "pole wewnętrzne = 6 sąsiadów");
  // sąsiad w tym samym rzędzie jest o 1 kolumnę, w sąsiednim o 0/1 kolumny (offset heksa)
  for (const [c, r] of B.neighbors(4, 4)) {
    const dr = Math.abs(r - 4);
    if (dr === 0) assert.strictEqual(Math.abs(c - 4), 1, "sąsiad w rzędzie o 1 kolumnę");
    else assert.strictEqual(dr, 1, "sąsiad w sąsiednim rzędzie");
  }
}
{
  // Narożnik nie może wskazywać poza planszę (test zaproponowany w dokumencie).
  for (const [c, r] of B.neighbors(0, 0)) assert(B.inGrid(c, r), "narożnik w planszy");
  for (const [c, r] of B.neighbors(0, B.MAXROW)) assert(B.inGrid(c, r), "dolny narożnik w planszy");
  assert.strictEqual(B.neighbors(0, 0).length, 2, "róg 0,0 ma 2 sąsiadów");
}

// --- Ochrona przed niesprawiedliwą kolejką (dokument 9.2) ---
{
  const g = new Map();
  g.set(B.key(0, 0), 1);
  g.set(B.key(1, 0), 1);      // kolor 1: para => da się dobić do 3
  g.set(B.key(5, 0), 3);      // kolor 3: samotny => strzał bez szans na grupę
  assert.strictEqual(B.largestClusterOfColor(g, 1), 2, "klaster koloru 1 = 2");
  assert.strictEqual(B.largestClusterOfColor(g, 3), 1, "klaster koloru 3 = 1");
  const v = B.viableColors(g);
  assert.deepStrictEqual(v.viable, [1], "tylko kolor 1 jest użyteczny");
  assert.deepStrictEqual(v.dead, [3], "kolor 3 jest martwy");
}
{
  // pickPlayableColor preferuje użyteczne kolory, ale NIE blokuje gry,
  // gdy wszystkie są martwe (dokument: nie wolno stworzyć sytuacji bez ruchu).
  const g = new Map();
  g.set(B.key(0, 0), 1);
  g.set(B.key(1, 0), 1);
  g.set(B.key(5, 0), 3);
  for (let i = 0; i < 100; i++) {
    assert.strictEqual(B.pickPlayableColor(g), 1, "zwraca tylko kolor użyteczny");
  }
  const g2 = new Map();
  g2.set(B.key(0, 0), 2);
  g2.set(B.key(5, 0), 4);     // oba samotne => wszystkie martwe
  const seen = new Set();
  for (let i = 0; i < 100; i++) seen.add(B.pickPlayableColor(g2));
  assert(seen.size > 0, "przy samych martwych kolorach nadal zwraca kolor");
  for (const c of seen) assert(c === 2 || c === 4, "zwraca kolor z planszy, nie 0");
  assert.strictEqual(B.pickPlayableColor(new Map()), 0, "pusta plansza => 0");
}
{
  // exclude działa: nie dostajemy dwóch identycznych gniazd, gdy jest wybór
  const g = new Map();
  g.set(B.key(0, 0), 1);
  g.set(B.key(1, 0), 1);
  g.set(B.key(2, 0), 2);
  g.set(B.key(3, 0), 2);
  for (let i = 0; i < 50; i++) {
    const c = B.pickPlayableColor(g, [1]);
    assert(c === 2, "z wykluczeniem 1 zostaje tylko 2, dostałem " + c);
  }
}
{
  // determinizm (rng) — potrzebne do powtarzalnych poziomów i replayów
  const g = new Map();
  g.set(B.key(0, 0), 1);
  g.set(B.key(1, 0), 1);
  g.set(B.key(2, 0), 3);
  g.set(B.key(3, 0), 3);
  assert.strictEqual(B.pickPlayableColor(g, null, () => 0), 1, "rng=0 => pierwszy użyteczny");
  assert.strictEqual(B.pickPlayableColor(g, null, () => 0.99), 3, "rng~1 => ostatni użyteczny");
}

console.log("OK: wszystkie asercje logiki przeszły");
