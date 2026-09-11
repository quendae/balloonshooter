import assert from 'node:assert/strict';
import * as renderer from './src/game-renderer.mjs';

assert.equal(typeof renderer.orbRackLayout, 'function', 'renderer should expose an in-playfield orb rack layout');

const B = { LW: 240, LH: 320, LAUNCH_Y: 288 };
const waiting = renderer.orbRackLayout(B, false);
assert.deepEqual(waiting.current, { x: 120, y: 288, scale: 1 }, 'waiting orb should stay on the real launch point');
assert.equal(waiting.next.length, 2, 'two next orbs should be visible in the playfield');
assert.ok(waiting.next.every((orb) => orb.x > waiting.current.x), 'next orbs should sit beside the current orb, not in a separate panel');
assert.ok(waiting.next.every((orb) => orb.y >= waiting.current.y), 'next orbs should rest on the same bottom rack');
assert.ok(waiting.next.every((orb) => orb.x + 12 * orb.scale < B.LW), 'rack must stay inside the logical canvas');
assert.ok(waiting.railY > waiting.current.y + 10 && waiting.railY < B.LH, 'a visible rail should support the waiting orbs');

const flying = renderer.orbRackLayout(B, true);
assert.equal(flying.current, null, 'no duplicate current orb should remain while the shot is in flight');
assert.equal(flying.next.length, 2, 'the two upcoming orbs should remain visible while a shot flies');

assert.equal(typeof renderer.projectileTrailSegments, 'function', 'renderer should expose a short motion trail for a flying orb');
const trail = renderer.projectileTrailSegments({ x: 120, y: 150, vx: 300, vy: -300 });
assert.equal(trail.length, 3, 'flying orb should get three short motion marks');
assert.ok(trail.every((mark) => mark.x < 120 && mark.y > 150), 'trail marks must sit behind the projectile, never predict its future path');

console.log('OK: in-playfield orb rack and projectile motion feedback contract passed');
