function cells(pattern) {
  const grid = [];
  pattern.forEach((row, r) => {
    [...row].forEach((char, c) => {
      if (/^[1-6]$/.test(char)) grid.push({ c, r, color: Number(char) });
    });
  });
  return grid;
}

function level(config) {
  return {
    maxShots: 28,
    shotsPerDrop: 7,
    starThresholds: [0, 1100, 1900],
    optional: { type: 'accuracy', maxMisses: 2, label: 'Maks. 2 pudła' },
    specials: [],
    objects: [],
    ...config,
    grid: cells(config.pattern),
  };
}

export const WORLDS = [
  {
    id: 'meadow',
    name: 'Łąka Balonów',
    subtitle: 'Nauka precyzji',
    icon: '🌼',
    atmosphere: 'meadow',
  },
  {
    id: 'clouds',
    name: 'Wyspy Chmur',
    subtitle: 'Odbicia i ratunek',
    icon: '☁️',
    atmosphere: 'clouds',
  },
  {
    id: 'forest',
    name: 'Las Wiatru',
    subtitle: 'Kotwice i ryzyko',
    icon: '🍃',
    atmosphere: 'forest',
  },
];

export const LEVELS = [
  level({
    id: 'meadow-01', world: 'meadow', number: 1, name: 'Pierwszy lot',
    objective: { type: 'clear' }, maxShots: 18, shotsPerDrop: 9,
    starThresholds: [0, 550, 900],
    pattern: ['1122334455', '112233445', '..........'],
    hint: 'Łącz co najmniej trzy balony tego samego koloru.',
  }),
  level({
    id: 'meadow-02', world: 'meadow', number: 2, name: 'Rykoszet',
    objective: { type: 'clear' }, maxShots: 20, shotsPerDrop: 9,
    starThresholds: [0, 700, 1200],
    pattern: ['111..222..', '.1....2..', '33....44..', '.3....4..'],
    hint: 'Ściany są częścią zagadki — użyj odbicia.',
  }),
  level({
    id: 'meadow-03', world: 'meadow', number: 3, name: 'Słabe ogniwo',
    objective: { type: 'clear' }, maxShots: 21, shotsPerDrop: 8,
    starThresholds: [0, 900, 1450],
    pattern: ['1112223334', '.1.2.3.4.', '..12224...', '...444....', '...444....'],
    hint: 'Odetnij podporę, aby zrzucić cały fragment.',
  }),
  level({
    id: 'meadow-04', world: 'meadow', number: 4, name: 'Dwadzieścia strzałów',
    objective: { type: 'clear' }, maxShots: 20, shotsPerDrop: 7,
    starThresholds: [0, 1050, 1650],
    optional: { type: 'shots-left', amount: 5, label: 'Zostało 5 strzałów' },
    pattern: ['1122334455', '122334455', '1122334455', '.2.3.4.5.', '..223344..'],
    hint: 'Planowanie dwóch następnych kolorów oszczędza strzały.',
  }),
  level({
    id: 'meadow-05', world: 'meadow', number: 5, name: 'Ptaszek w opałach',
    objective: { type: 'rescue', amount: 1 }, maxShots: 23, shotsPerDrop: 7,
    starThresholds: [0, 1150, 1800],
    pattern: ['1112223334', '.1.2.3.4.', '..12224...', '...555....', '...555....'],
    objects: [{ id: 'bird-1', type: 'captive', at: [4, 4] }],
    hint: 'Uwolnij ptaszka, odcinając gałąź pod jego klatką.',
  }),

  level({
    id: 'clouds-01', world: 'clouds', number: 6, name: 'Dwa skrzydła',
    objective: { type: 'rescue', amount: 2 }, maxShots: 25, shotsPerDrop: 7,
    starThresholds: [0, 1300, 2050],
    pattern: ['1122..3344', '112...344', '.12...34..', '..55555...', '..5...5...'],
    objects: [
      { id: 'bird-2', type: 'captive', at: [2, 4] },
      { id: 'bird-3', type: 'captive', at: [6, 4] },
    ],
    hint: 'Nie musisz czyścić wszystkiego — ratuj obie strony.',
  }),
  level({
    id: 'clouds-02', world: 'clouds', number: 7, name: 'Bomba w chmurach',
    objective: { type: 'clear' }, maxShots: 24, shotsPerDrop: 7,
    starThresholds: [0, 1450, 2200], specials: ['bomb'],
    pattern: ['1112223334', '122233344', '1122334455', '.22334455', '..334455..'],
    hint: 'Bomba czyści mały obszar. Zachowaj ją na gęsty węzeł.',
  }),
  level({
    id: 'clouds-03', world: 'clouds', number: 8, name: 'Fałszywa droga',
    objective: { type: 'clear' }, maxShots: 24, shotsPerDrop: 6,
    starThresholds: [0, 1550, 2350],
    pattern: ['1112233445', '.1.2.3.4.', '5512233445', '.5.2.3.4.', '555..444..', '..5..4....'],
    hint: 'Największa grupa nie zawsze jest najlepszym celem.',
  }),
  level({
    id: 'clouds-04', world: 'clouds', number: 9, name: 'Deszcz gwiazd',
    objective: { type: 'collect', amount: 3 }, maxShots: 25, shotsPerDrop: 6,
    starThresholds: [0, 1600, 2450],
    pattern: ['1122334455', '.12233445', '5511223344', '.5.1.2.3.', '..555444..'],
    objects: [
      { id: 'star-1', type: 'collectible', at: [1, 2] },
      { id: 'star-2', type: 'collectible', at: [4, 4] },
      { id: 'star-3', type: 'collectible', at: [7, 2] },
    ],
    hint: 'Zrzuć trzy gwiazdy do koszyka pod planszą.',
  }),
  level({
    id: 'clouds-05', world: 'clouds', number: 10, name: 'Bank Shot',
    objective: { type: 'rescue', amount: 1 }, maxShots: 22, shotsPerDrop: 6,
    starThresholds: [0, 1750, 2600],
    optional: { type: 'accuracy', maxMisses: 1, label: 'Maks. 1 pudło' },
    pattern: ['1111..2222', '1.......2', '1..333..2', '.4.3.3.4.', '..45554...'],
    objects: [{ id: 'bird-4', type: 'captive', at: [4, 4] }],
    hint: 'Bez odbicia trudno dotrzeć pod boczną osłonę.',
  }),

  level({
    id: 'forest-01', world: 'forest', number: 11, name: 'Pierwszy podmuch',
    objective: { type: 'survive', amount: 8 }, maxShots: 18, shotsPerDrop: 5,
    starThresholds: [0, 1300, 2050],
    pattern: ['1122334455', '.12233445', '..223344..', '...3344..'],
    hint: 'Przetrwaj osiem tur, zanim konstrukcja zejdzie za nisko.',
  }),
  level({
    id: 'forest-02', world: 'forest', number: 12, name: 'Dwie kotwice',
    objective: { type: 'anchors', amount: 2 }, maxShots: 24, shotsPerDrop: 5,
    starThresholds: [0, 1750, 2650],
    pattern: ['1112223334', '.1.2.3.4.', '5512233445', '.5.2.3.4.', '..555444..'],
    objects: [
      { id: 'anchor-1', type: 'anchor', at: [1, 0] },
      { id: 'anchor-2', type: 'anchor', at: [7, 0] },
    ],
    hint: 'Zniszcz oba punkty podparcia — reszta nie jest celem.',
  }),
  level({
    id: 'forest-03', world: 'forest', number: 13, name: 'Tęczowy ratunek',
    objective: { type: 'rescue', amount: 2 }, maxShots: 24, shotsPerDrop: 5,
    starThresholds: [0, 1900, 2850], specials: ['rainbow'],
    pattern: ['1122334455', '.12233445', '6611223344', '.6.1.2.3.', '..666555..'],
    objects: [
      { id: 'bird-5', type: 'captive', at: [2, 4] },
      { id: 'bird-6', type: 'captive', at: [6, 4] },
    ],
    hint: 'Tęcza dopasuje się do koloru w miejscu trafienia.',
  }),
  level({
    id: 'forest-04', world: 'forest', number: 14, name: 'Bez marginesu',
    objective: { type: 'clear' }, maxShots: 22, shotsPerDrop: 4,
    starThresholds: [0, 2100, 3100],
    optional: { type: 'accuracy', maxMisses: 1, label: 'Maks. 1 pudło' },
    pattern: ['1122334455', '122334455', '6611223344', '.61223345', '..661155..', '...6555...'],
    hint: 'Każde pudło przybliża sufit. Szukaj odcięć.',
  }),
  level({
    id: 'forest-05', world: 'forest', number: 15, name: 'Strażnik Burzy',
    objective: { type: 'anchors', amount: 3 }, maxShots: 30, shotsPerDrop: 4,
    starThresholds: [0, 2800, 4200], boss: true, specials: ['bomb', 'rainbow'],
    optional: { type: 'shots-left', amount: 4, label: 'Zostały 4 strzały' },
    pattern: ['1112223334', '511223344', '5511223344', '.56622334', '..666555..', '...6555...'],
    objects: [
      { id: 'anchor-left', type: 'anchor', at: [1, 0] },
      { id: 'anchor-mid', type: 'anchor', at: [4, 0] },
      { id: 'anchor-right', type: 'anchor', at: [7, 0] },
    ],
    hint: 'Boss ma trzy kotwice. Po każdej fazie sufit przyspiesza.',
  }),
];

export function getLevel(id) {
  return LEVELS.find((item) => item.id === id) || null;
}

export function getWorld(id) {
  return WORLDS.find((item) => item.id === id) || null;
}
