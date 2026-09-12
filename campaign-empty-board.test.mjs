import assert from 'node:assert/strict';
import { campaignTerminalDecision } from './src/sky-rescue-core.mjs';

assert.deepEqual(
  campaignTerminalDecision({ type: 'clear' }, { remainingBalloons: 0 }),
  {
    complete: true,
    fallbackEmptyBoard: false,
    evaluation: { complete: true, current: 1, target: 1 },
  },
);

const rescueFallback = campaignTerminalDecision(
  { type: 'rescue', amount: 2 },
  { remainingBalloons: 0, rescued: 1 },
);
assert.equal(rescueFallback.complete, true);
assert.equal(rescueFallback.fallbackEmptyBoard, true);

const liveCollect = campaignTerminalDecision(
  { type: 'collect', amount: 2 },
  { remainingBalloons: 5, collected: 1 },
);
assert.equal(liveCollect.complete, false);

console.log('✓ campaign empty-board terminal reconciliation');
