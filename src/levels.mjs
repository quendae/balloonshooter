function cells(pattern) {
  const grid = [];
  pattern.forEach((row, r) => {
    [...row].forEach((char, c) => {
      if (/^[1-6]$/.test(char)) grid.push({ c, r, color: Number(char) });
    });
  });
  return grid;
}

const ATMOSPHERES = {
  'meadow-01': { timeOfDay: 'morning', weather: 'clear', intensity: .1 },
  'meadow-02': { timeOfDay: 'morning', weather: 'breeze', intensity: .25 },
  'meadow-03': { timeOfDay: 'day', weather: 'clear', intensity: .15 },
  'meadow-04': { timeOfDay: 'sunset', weather: 'clear', intensity: .2 },
  'meadow-05': { timeOfDay: 'sunset', weather: 'clouds', intensity: .35 },
  'clouds-01': { timeOfDay: 'day', weather: 'clear', intensity: .15 },
  'clouds-02': { timeOfDay: 'day', weather: 'clouds', intensity: .35 },
  'clouds-03': { timeOfDay: 'day', weather: 'fog', intensity: .5 },
  'clouds-04': { timeOfDay: 'sunset', weather: 'rain', intensity: .45 },
  'clouds-05': { timeOfDay: 'sunset', weather: 'overcast', intensity: .55 },
  'forest-01': { timeOfDay: 'day', weather: 'breeze', intensity: .35 },
  'forest-02': { timeOfDay: 'sunset', weather: 'windy', intensity: .55 },
  'forest-03': { timeOfDay: 'dusk', weather: 'rain', intensity: .55 },
  'forest-04': { timeOfDay: 'dusk', weather: 'heavy-rain', intensity: .72 },
  'forest-05': { timeOfDay: 'night', weather: 'storm', intensity: 1 },
  'storm-01': { timeOfDay: 'day', weather: 'windy', intensity: .55 },
  'storm-02': { timeOfDay: 'sunset', weather: 'windy', intensity: .7 },
  'storm-03': { timeOfDay: 'sunset', weather: 'heavy-rain', intensity: .78 },
  'storm-04': { timeOfDay: 'dusk', weather: 'storm', intensity: .9 },
  'storm-05': { timeOfDay: 'night', weather: 'storm', intensity: 1 },
};

function level(config) {
  return {
    maxShots: 28,
    shotsPerDrop: 7,
    starThresholds: [0, 1100, 1900],
    optional: { type: 'accuracy', maxMisses: 2, label: 'Maks. 2 pudła' },
    specials: [],
    objects: [],
    atmosphere: ATMOSPHERES[config.id] || { timeOfDay: 'day', weather: 'clear', intensity: 0 },
    ...config,
    grid: cells(config.pattern),
  };
}

export const WORLDS = [
  { id: 'meadow', name: 'Zielone Wzgórza', subtitle: 'Pierwsze układy', icon: '🌼', atmosphere: 'meadow' },
  { id: 'clouds', name: 'Wyspy Chmur', subtitle: 'Ryzyko i ratunek', icon: '☁️', atmosphere: 'clouds' },
  { id: 'forest', name: 'Las Wiatru', subtitle: 'Prądy i kotwice', icon: '🍃', atmosphere: 'forest' },
  { id: 'storm', name: 'Burzowe Szczyty', subtitle: 'Wiatr i burze', icon: '⚡', atmosphere: 'storm' },
];

export const LEVELS = [
  level({
    id: 'meadow-01', world: 'meadow', number: 1, name: 'Pierwszy lot',
    objective: { type: 'clear' }, maxShots: 18, shotsPerDrop: 9,
    starThresholds: [0, 550, 900],
    pattern: ['1122334455', '112233445.', '..........'],
    hint: 'Łącz co najmniej trzy kulki tego samego koloru.',
  }),
  level({
    id: 'meadow-02', world: 'meadow', number: 2, name: 'Rykoszet',
    objective: { type: 'clear' }, maxShots: 20, shotsPerDrop: 9,
    starThresholds: [0, 700, 1200], specials: ['guide'],
    pattern: ['111..222..', '.1....2...', '33....44..', '.3....4...'],
    hint: 'Ściany są częścią układu.',
  }),
  level({
    id: 'meadow-03', world: 'meadow', number: 3, name: 'Słabe ogniwo',
    objective: { type: 'clear' }, maxShots: 21, shotsPerDrop: 8,
    starThresholds: [0, 900, 1450],
    pattern: ['1112223334', '.1.2.3.4..', '..12224...', '...444....', '...444....'],
    hint: 'Odetnij podporę, aby zrzucić cały fragment.',
  }),
  level({
    id: 'meadow-04', world: 'meadow', number: 4, name: 'Dwadzieścia strzałów',
    objective: { type: 'clear' }, maxShots: 20, shotsPerDrop: 7,
    starThresholds: [0, 1050, 1650],
    optional: { type: 'shots-left', amount: 5, label: 'Zostało 5 strzałów' },
    pattern: ['1122334455', '122334455.', '1122334455', '.2.3.4.5..', '..223344..'],
    hint: 'Planowanie kolejnych kolorów oszczędza strzały.',
  }),
  level({
    id: 'meadow-05', world: 'meadow', number: 5, name: 'Ptaszek w opałach',
    objective: { type: 'rescue', amount: 1 }, maxShots: 23, shotsPerDrop: 7,
    starThresholds: [0, 1150, 1800],
    pattern: ['1112223334', '.1.2.3.4..', '..12224...', '...555....', '...555....'],
    objects: [{ id: 'bird-1', type: 'captive', at: [4, 4] }],
    hint: 'Uwolnij ptaszka, odcinając podporę pod klatką.',
  }),
  level({
    id: 'clouds-01', world: 'clouds', number: 6, name: 'Dwa skrzydła',
    objective: { type: 'rescue', amount: 2 }, maxShots: 25, shotsPerDrop: 7,
    starThresholds: [0, 1300, 2050],
    pattern: ['1122..3344', '112...344.', '.12...34..', '..55555...', '..5...5...'],
    objects: [
      { id: 'bird-2', type: 'captive', at: [2, 4] },
      { id: 'bird-3', type: 'captive', at: [6, 4] },
    ],
    hint: 'Nie musisz czyścić wszystkiego.',
  }),
  level({
    id: 'clouds-02', world: 'clouds', number: 7, name: 'Bomba w chmurach',
    objective: { type: 'clear' }, maxShots: 24, shotsPerDrop: 7,
    starThresholds: [0, 1450, 2200], specials: ['bomb'],
    pattern: ['1112223334', '122233344.', '1122334455', '.22334455.', '..334455..'],
    hint: 'Bomba czyści mały obszar.',
  }),
  level({
    id: 'clouds-03', world: 'clouds', number: 8, name: 'Fałszywa droga',
    objective: { type: 'clear' }, maxShots: 24, shotsPerDrop: 6,
    starThresholds: [0, 1550, 2350],
    pattern: ['1112233445', '.1.2.3.4..', '5512233445', '.5.2.3.4..', '555..444..', '..5..4....'],
    hint: 'Największa grupa nie zawsze jest najlepszym celem.',
  }),
  level({
    id: 'clouds-04', world: 'clouds', number: 9, name: 'Deszcz gwiazd',
    objective: { type: 'collect', amount: 3 }, maxShots: 25, shotsPerDrop: 6,
    starThresholds: [0, 1600, 2450],
    pattern: ['1122334455', '.12233445.', '5511223344', '.5.1.2.3..', '..555444..'],
    objects: [
      { id: 'star-1', type: 'collectible', at: [1, 2] },
      { id: 'star-2', type: 'collectible', at: [4, 4] },
      { id: 'star-3', type: 'collectible', at: [7, 2] },
    ],
    hint: 'Zrzuć trzy gwiazdy.',
  }),
  level({
    id: 'clouds-05', world: 'clouds', number: 10, name: 'Bank Shot',
    objective: { type: 'rescue', amount: 1 }, maxShots: 22, shotsPerDrop: 6,
    starThresholds: [0, 1750, 2600], specials: ['guide'],
    optional: { type: 'accuracy', maxMisses: 1, label: 'Maks. 1 pudło' },
    pattern: ['1111..2222', '1.3...3.2.', '1..333..2.', '.4.3.3.4..', '..45554...'],
    objects: [{ id: 'bird-4', type: 'captive', at: [4, 4] }],
    hint: 'Boczna osłona premiuje odbicie.',
  }),
  level({
    id: 'forest-01', world: 'forest', number: 11, name: 'Pierwszy podmuch',
    objective: { type: 'survive', amount: 8 }, maxShots: 18, shotsPerDrop: 5,
    starThresholds: [0, 1300, 2050], wind: { forceX: 120, forceY: 0 },
    pattern: ['1122334455', '.12233445.', '..223344..', '...3344...'],
    hint: 'Wiatr działa na całej planszy — popraw kierunek strzału.',
  }),
  level({
    id: 'forest-02', world: 'forest', number: 12, name: 'Dwie kotwice',
    objective: { type: 'anchors', amount: 2 }, maxShots: 24, shotsPerDrop: 5,
    starThresholds: [0, 1750, 2650], specials: ['guide'], wind: { forceX: -150, forceY: 0 },
    pattern: ['1112223334', '.1.2.3.4..', '5512233445', '.5.2.3.4..', '..555444..'],
    objects: [
      { id: 'anchor-1', type: 'anchor', at: [1, 0] },
      { id: 'anchor-2', type: 'anchor', at: [7, 0] },
    ],
    hint: 'Stały boczny wiatr wymaga poprawki przed każdym strzałem.',
  }),
  level({
    id: 'forest-03', world: 'forest', number: 13, name: 'Tęczowy ratunek',
    objective: { type: 'rescue', amount: 2 }, maxShots: 24, shotsPerDrop: 5,
    starThresholds: [0, 1900, 2850], specials: ['rainbow'], wind: { forceX: -165, forceY: -12 },
    pattern: ['1122334455', '.12233445.', '6611223344', '.6.1.2.3..', '..666555..'],
    objects: [
      { id: 'bird-5', type: 'captive', at: [2, 4] },
      { id: 'bird-6', type: 'captive', at: [6, 4] },
    ],
    hint: 'Tęcza pomaga, ale wiatr nadal zakrzywia lot.',
  }),
  level({
    id: 'forest-04', world: 'forest', number: 14, name: 'Bez marginesu',
    objective: { type: 'clear' }, maxShots: 22, shotsPerDrop: 4,
    starThresholds: [0, 2100, 3100], specials: ['guide'], wind: { forceX: 190, forceY: 0 },
    optional: { type: 'accuracy', maxMisses: 1, label: 'Maks. 1 pudło' },
    pattern: ['1122334455', '122334455.', '6611223344', '.61223345.', '..661155..', '...6555...'],
    hint: 'Silny wiatr zostawia mało marginesu błędu.',
  }),
  level({
    id: 'forest-05', world: 'forest', number: 15, name: 'Strażnik Burzy',
    objective: { type: 'anchors', amount: 3 }, maxShots: 30, shotsPerDrop: 4,
    starThresholds: [0, 2800, 4200], boss: true, specials: ['guide', 'bomb', 'rainbow'],
    windSequence: [
      { forceX: 210, forceY: -8 }, { forceX: 210, forceY: -8 },
      { forceX: -225, forceY: 0 }, { forceX: -225, forceY: 0 },
      { forceX: 235, forceY: -10 }, { forceX: -240, forceY: 0 },
    ],
    optional: { type: 'shots-left', amount: 4, label: 'Zostały 4 strzały' },
    pattern: ['1112223334', '511223344.', '5511223344', '.56622334.', '..666555..', '...6555...'],
    objects: [
      { id: 'anchor-left', type: 'anchor', at: [1, 0] },
      { id: 'anchor-mid', type: 'anchor', at: [4, 0] },
      { id: 'anchor-right', type: 'anchor', at: [7, 0] },
    ],
    hint: 'Burza zmienia wiatr między strzałami.',
  }),
  level({
    id: 'storm-01', world: 'storm', number: 16, name: 'Boczny wiatr',
    objective: { type: 'clear' }, maxShots: 22, shotsPerDrop: 6,
    starThresholds: [0, 1700, 2550], wind: { forceX: 150, forceY: 0 },
    pattern: ['1111222233', '111122223.', '..445566..', '...4556...'],
    hint: 'Krótka linia pokazuje pierwsze ugięcie toru przez wiatr.',
  }),
  level({
    id: 'storm-02', world: 'storm', number: 17, name: 'Zmiana frontu',
    objective: { type: 'rescue', amount: 1 }, maxShots: 24, shotsPerDrop: 6,
    starThresholds: [0, 1900, 2850],
    windSequence: [
      { forceX: 150, forceY: 0 }, { forceX: 150, forceY: 0 },
      { forceX: -170, forceY: 0 }, { forceX: -170, forceY: 0 },
    ],
    pattern: ['1122334455', '112233445.', '1233445522', '123344552.', '..334455..'],
    objectiveSlots: [[3, 2], [4, 2], [5, 2], [6, 2]],
    hint: 'Kierunek wiatru zmienia się dopiero po zakończonym strzale.',
  }),
  level({
    id: 'storm-03', world: 'storm', number: 18, name: 'Pierwszy piorun',
    objective: { type: 'collect', amount: 2 }, maxShots: 26, shotsPerDrop: 5,
    starThresholds: [0, 2200, 3250], wind: { forceX: 125, forceY: 28 },
    storm: { firstStrikeAfterShots: 4, intervalShots: 4, spawnCount: [2, 3] },
    pattern: ['1122334455', '122334455.', '1122334455', '.22334455.', '..334455..', '...4455...'],
    objectiveSlots: [[3, 2], [6, 2], [4, 3], [5, 3]],
    hint: 'Piorun dospawnuje nowe kulki — nie zwlekaj z celem.',
  }),
  level({
    id: 'storm-04', world: 'storm', number: 19, name: 'Bieg przez burzę',
    objective: { type: 'survive', amount: 10 }, maxShots: 18, shotsPerDrop: 4,
    starThresholds: [0, 2300, 3450], wind: { forceX: -215, forceY: 12 }, specials: ['guide'],
    storm: { firstStrikeAfterShots: 3, intervalShots: 3, spawnCount: [3, 4] },
    pattern: ['1122334455', '122334455.', '.22334455.', '..334455..', '...4455...'],
    hint: 'Przetrwaj dziesięć tur pod silnym wiatrem i częstymi piorunami.',
  }),
  level({
    id: 'storm-05', world: 'storm', number: 20, name: 'Oko burzy',
    objective: { type: 'anchors', amount: 3 }, maxShots: 30, shotsPerDrop: 4,
    starThresholds: [0, 3300, 5000], boss: true, specials: ['guide', 'bomb', 'rainbow'],
    windSequence: [
      { forceX: 190, forceY: -12 }, { forceX: 190, forceY: -12 },
      { forceX: -210, forceY: 0 }, { forceX: -210, forceY: 0 },
      { forceX: 230, forceY: -16 }, { forceX: -240, forceY: 8 },
    ],
    storm: { firstStrikeAfterShots: 3, intervalShots: 3, spawnCount: [3, 4] },
    optional: { type: 'shots-left', amount: 4, label: 'Zostały 4 strzały' },
    pattern: ['1122334455', '122334455.', '5511223344', '.56622334.', '..666555..', '...6555...'],
    objects: [
      { id: 'storm-anchor-left', type: 'anchor', at: [1, 0] },
      { id: 'storm-anchor-mid', type: 'anchor', at: [4, 0] },
      { id: 'storm-anchor-right', type: 'anchor', at: [7, 0] },
    ],
    hint: 'Łam kotwice zanim pioruny zagęszczą planszę.',
  }),
];

export function getLevel(id) {
  return LEVELS.find((item) => item.id === id) || null;
}

export function getWorld(id) {
  return WORLDS.find((item) => item.id === id) || null;
}
