// Czysta logika gry w balony (bez DOM). Uruchamiana w node (test) i przeglądarce.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.BALLOON = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---- wymiary logiczne (pixel-art render w niskiej rozdzielczości) ----
  const LW = 240, LH = 320;   // canvas logiczny
  const RAD = 12;             // promień balona
  const PH = 2 * RAD;         // rozstaw poziomy centrów = 24
  const PV = Math.sqrt(PH * PH - (PH / 2) * (PH / 2)); // rozstaw pionowy ~20.78
  const Y0 = 48;              // środek pierwszego rzędu (pod HUD)
  const MAXROW = 9;           // rzędy 0..9 (10 rzędów balonów)
  const LAUNCH_Y = 288;       // poziom osi strzelca

  const rowCols = (r) => ((r & 1) ? 9 : 10);
  const colX = (c, r) => 12 + (r % 2) * 12 + c * PH;
  const rowY = (r) => Y0 + r * PV;
  const inGrid = (c, r) => r >= 0 && r <= MAXROW && c >= 0 && c < rowCols(r);
  const key = (c, r) => c + "," + r;
  const split = (k) => { const i = k.indexOf(","); return [+k.slice(0, i), +k.slice(i + 1)]; };

  const dist = (x1, y1, x2, y2) => {
    const dx = x1 - x2, dy = y1 - y2;
    return Math.sqrt(dx * dx + dy * dy);
  };

  function occ(grid, c, r) { return grid.has(key(c, r)); }

  // Sąsiedzi heks (dowolna komórka w promieniu < PH+1, w granicach).
  function neighbors(c, r) {
    const out = [];
    for (let rr = Math.max(0, r - 1); rr <= Math.min(MAXROW, r + 1); rr++) {
      for (let cc = Math.max(0, c - 2); cc <= Math.min(rowCols(rr) - 1, c + 2); cc++) {
        if (rr === r && cc === c) continue;
        if (dist(colX(c, r), rowY(r), colX(cc, rr), rowY(rr)) < PH + 0.5) out.push([cc, rr]);
      }
    }
    return out;
  }

  // Kolor = liczba 1..5. grid: Map "c,r" -> color.
  function setBalloon(grid, c, r, color) {
    if (!inGrid(c, r) || occ(grid, c, r)) return false;
    grid.set(key(c, r), color);
    return true;
  }

  function sameColorCluster(grid, c, r) {
    const k0 = key(c, r);
    const color = grid.get(k0);
    if (color === undefined) return [];
    const seen = new Set([k0]);
    const stack = [k0];
    while (stack.length) {
      const k = stack.pop();
      const [cc, rr] = split(k);
      for (const [nc, nr] of neighbors(cc, rr)) {
        const nk = key(nc, nr);
        if (!seen.has(nk) && grid.get(nk) === color) { seen.add(nk); stack.push(nk); }
      }
    }
    return [...seen];
  }

  function occInRow(grid, r) {
    const out = [];
    for (let c = 0; c < rowCols(r); c++) if (occ(grid, c, r)) out.push([c, r]);
    return out;
  }

  // Zbiór balonów połączonych z sufitem. `ceilRow` = rząd, w którym sufit
  // trzyma balony (0 na starcie; rośnie, gdy sufit opada). Kotwiczymy się
  // WŁAŚNIE na ceilRow, a nie na "najwyższym zajętym rzędzie": gdy sufit
  // opadnie, stary rząd 0 jedzie do rzędu 1 i nadal wisi na suficie, ale gdy
  // zniknie cały rząd 0 z powodu pęknięcia, reszta MUSI spaść. Kotwiczenie
  // na najwyższym zajętym rzędzie błędnie by ją uratowało.
  function topConnected(grid, ceilRow) {
    const c0 = ceilRow || 0;
    const seen = new Set();
    const stack = occInRow(grid, c0).map(([c, r]) => key(c, r));
    for (const k of stack) seen.add(k);
    while (stack.length) {
      const k = stack.pop();
      const [c, r] = split(k);
      for (const [nc, nr] of neighbors(c, r)) {
        const nk = key(nc, nr);
        if (!seen.has(nk) && grid.has(nk)) { seen.add(nk); stack.push(nk); }
      }
    }
    return seen;
  }

  // Po wstawieniu balonu w (c,r): pęka klaster >=3, odcięte od sufitu spadają.
  // Zwraca { popped: [keys], dropped: [keys] }; obie listy usunięte z grid.
  function settle(grid, c, r, ceilRow) {
    const c0 = ceilRow || 0;
    const cluster = sameColorCluster(grid, c, r);
    const popped = cluster.length >= 3 ? cluster : [];
    for (const k of popped) grid.delete(k);
    const connected = topConnected(grid, c0);
    const dropped = [];
    for (const k of grid.keys()) if (!connected.has(k)) dropped.push(k);
    for (const k of dropped) grid.delete(k);
    return { popped, dropped };
  }

  // ---- opadanie sufitu (presja czasu) ----
  // Przesuwa CAŁĄ planszę o jeden rząd w dół: rząd r ląduje w r+1, a rząd 0
  // zostaje pusty. Właściciel planszy MUSI wtedy zwiększyć `ceilRow` (sufit
  // pojechał razem z balonami) — inaczej `topConnected` nie miałby się na
  // czym zakotwiczyć i po pierwszym strzale spadłaby cała plansza.
  //
  // UWAGA na geometrię heksa: rzędy parzyste mają 10 kolumn, nieparzyste 9.
  // Po opadzie parzysty staje się nieparzystym, więc kolumna 9 nie istnieje
  // w rzędzie docelowym — taka skrajna kolumna jest przycinana (inaczej
  // powstałby balon poza planszą, którego nie da się dosięgnąć).
  function shiftDown(grid) {
    const moved = new Map();
    for (const [k, v] of grid) {
      const [c, r] = split(k);
      if (r + 1 > MAXROW) continue;      // dolny rząd wypada poza planszę
      if (c >= rowCols(r + 1)) continue; // skrajna kolumna nie mieści się niżej
      moved.set(key(c, r + 1), v);
    }
    grid.clear();
    for (const [k, v] of moved) grid.set(k, v);
    return grid;
  }

  // Czy w rzędzie `r` stoi cokolwiek (używane do oceny presji).
  function rowCount(grid, r) {
    let n = 0;
    for (let c = 0; c < rowCols(r); c++) if (occ(grid, c, r)) n++;
    return n;
  }

  // Najniższy zajęty rząd (-1 gdy pusto) — do paska presji i przewidywania.
  function lowestRow(grid) {
    let lo = -1;
    for (const k of grid.keys()) {
      const r = split(k)[1];
      if (r > lo) lo = r;
    }
    return lo;
  }

  // ---- kolory: pula i losowanie ----
  // Bierze pod uwagę OBA gniazda kolejki, żeby nie wygenerować pary kolorów,
  // których na planszy już nie ma (i żeby dało się planować dwa strzały).
  function colorPool(grid, exclude) {
    const s = new Set();
    for (const v of grid.values()) s.add(v);
    if (exclude) for (const e of exclude) s.delete(e);
    return [...s];
  }

  // Losuje kolor z puli; `rng` wstrzykiwane dla testów (domyślnie Math.random).
  function pickColor(grid, exclude, rng) {
    const r = rng || Math.random;
    const pool = colorPool(grid, exclude);
    if (pool.length === 0) {
      const all = colorPool(grid, null);
      if (all.length === 0) return 0;
      return all[Math.floor(r() * all.length) % all.length];
    }
    return pool[Math.floor(r() * pool.length) % pool.length];
  }

  // ---- ocena strzału (combo / mnożnik) ----
  // Zwraca { base, mult, bonus, total } z jednego pęknięcia.
  // combo rośnie z każdym udanym strzałem z rzędu; duże kasacje i strącenia
  // dają dodatkowe bonusy, więc ryzykowne strzały się opłacają.
  function scoreShot(popped, dropped, combo) {
    const base = popped * 10 + dropped * 20;
    const c = Math.max(1, combo || 1);
    const mult = Math.min(8, 1 + (c - 1) * 0.5);          // 1x, 1.5x, 2x ... 8x
    let bonus = 0;
    if (popped >= 5) bonus += (popped - 4) * 15;           // duża kasacja
    if (popped >= 8) bonus += 100;                         // "MEGA POP"
    if (dropped >= 3) bonus += dropped * 10;               // lawina
    return { base, mult, bonus, total: Math.round(base * mult) + bonus };
  }

  // ---- ochrona przed niesprawiedliwą kolejką (dokument 9.2) ----
  // Czy kolor `color` ma na planszy gdziekolwiek parę (lub trójkę), do której
  // da się dobić? Liczymy największe skupisko w tym kolorze. Kolor bez pary
  // jest "martwym" strzałem: nie da się nim utworzyć grupy 3.
  function largestClusterOfColor(grid, color) {
    let best = 0;
    const seen = new Set();
    for (const [k, v] of grid) {
      if (v !== color || seen.has(k)) continue;
      const [c, r] = split(k);
      const stack = [k];
      seen.add(k);
      let n = 0;
      while (stack.length) {
        const cur = stack.pop();
        n++;
        const [cc, rr] = split(cur);
        for (const [nc, nr] of neighbors(cc, rr)) {
          const nk = key(nc, nr);
          if (!seen.has(nk) && grid.get(nk) === color) { seen.add(nk); stack.push(nk); }
        }
      }
      if (n > best) best = n;
    }
    return best;
  }

  // Które kolory z puli pozwalają DOBIĆ do grupy 3 (mają już >= 2 sąsiadów)?
  // Zwraca { viable: [...], dead: [...] }. Gdy nic nie jest viable, zwracamy
  // pełną pulę — nie da się wtedy pomóc, a przynajmniej nie kłamiemy.
  function viableColors(grid) {
    const pool = colorPool(grid, null);
    const viable = [], dead = [];
    for (const col of pool) {
      if (largestClusterOfColor(grid, col) >= 2) viable.push(col); else dead.push(col);
    }
    return { viable, dead, pool };
  }

  // Wybiera kolor pocisku z PRIORYTETEM dla kolorów, którymi da się zagrać.
  // To nie jest "zawsze idealny kolor" (dokument 9.2 tego zabrania) — dopóki
  // jest choć jeden użyteczny kolor, losujemy z użytecznych; gdy wszystkie
  // są martwe, losujemy z całej puli, żeby gracz nie utknął bez ruchu.
  function pickPlayableColor(grid, exclude, rng) {
    const r = rng || Math.random;
    const { viable, pool, dead } = viableColors(grid);
    if (viable.length === 0) {
      // Wszystkie kolory są martwe — oddajemy cokolwiek z puli (z wykluczeniem),
      // żeby gracz mógł przynajmniej dokładać balony i budować strukturę.
      const any = dead.length ? dead : pool;
      const filtered = exclude ? any.filter((c) => !exclude.includes(c)) : any;
      const src = filtered.length ? filtered : any;
      if (!src.length) return 0;
      return src[Math.floor(r() * src.length) % src.length];
    }
    const filtered = exclude ? viable.filter((c) => !exclude.includes(c)) : viable;
    const src = filtered.length ? filtered : viable;
    return src[Math.floor(r() * src.length) % src.length];
  }

  // Czy wolna komórka może utrzymać nowy balon: sufit (r === ceilRow) albo
  // sąsiaduje z zajętym. Komórki NAD sufitem są niedostępne.
  function supported(grid, c, r, ceilRow) {
    const c0 = ceilRow || 0;
    if (r < c0) return false;
    if (r === c0) return true;
    for (const [nc, nr] of neighbors(c, r)) if (occ(grid, nc, nr)) return true;
    return false;
  }

  // Najlepsza wolna podparta komórka w promieniu `rad` od punktu zatrzymania (x,y).
  // null = pocisk nie ma gdzie wylądować (balony dotarły do linii strzelca).
  function findSnap(grid, x, y, rad, ceilRow) {
    const c0 = ceilRow || 0;
    if (rad === undefined) rad = PH * 1.25;
    let best = null, bestD = Infinity;
    for (let r = c0; r <= MAXROW; r++) {
      for (let c = 0; c < rowCols(r); c++) {
        if (occ(grid, c, r) || !supported(grid, c, r, c0)) continue;
        const d = dist(x, y, colX(c, r), rowY(r));
        if (d <= rad && d < bestD) { bestD = d; best = [c, r]; }
      }
    }
    return best;
  }

  return {
    LW, LH, RAD, PH, PV, Y0, MAXROW, LAUNCH_Y,
    rowCols, colX, rowY, inGrid, key, split, dist, occ, neighbors,
    setBalloon, sameColorCluster, occInRow, topConnected, settle,
    supported, findSnap, shiftDown, rowCount, lowestRow,
    colorPool, pickColor, scoreShot,
    largestClusterOfColor, viableColors, pickPlayableColor,
    levelRows: (lvl) => Math.min(7, 3 + Math.floor((lvl - 1) / 2)),
    levelColors: (lvl) => lvl >= 7 ? 6 : Math.min(5, 2 + Math.ceil(lvl / 2)),
    // Ile strzałów bez kasacji zanim sufit opadnie o rząd. Im wyższy poziom
    // i im więcej kolorów, tym szybciej (krótszy licznik = większa presja).
    shotsPerDrop: (lvl) => Math.max(4, 10 - Math.floor(lvl / 2)),
  };
});
