import assert from 'node:assert/strict';
import {
  ENDURANCE_WEATHER_CONFIG,
  advanceEnduranceWeather,
  createEnduranceWeatherState,
  weatherBadgeLabel,
  weatherCallout,
  weatherShotMetadata,
  weatherTransitionProgress,
} from './src/endurance-weather.mjs';

function sequenceRng(values) {
  let index = 0;
  return () => values[index++ % values.length];
}

const config = ENDURANCE_WEATHER_CONFIG;
const aRng = sequenceRng([.2, .8, .1, .6, .4, .9, .3]);
const bRng = sequenceRng([.2, .8, .1, .6, .4, .9, .3]);
let a = createEnduranceWeatherState({ nowMs: 0, rng: aRng, config });
let b = createEnduranceWeatherState({ nowMs: 0, rng: bRng, config });
assert.deepEqual(a, b);
assert.equal(a.current, 'clear');
assert.ok(a.phaseEndsMs >= 25_000 && a.phaseEndsMs <= 35_000);

const sequenceA = [];
const sequenceB = [];
for (let i = 0; i < 12; i += 1) {
  const nowA = a.phaseEndsMs + 1;
  const nowB = b.phaseEndsMs + 1;
  ({ state: a } = advanceEnduranceWeather(a, nowA, aRng, config));
  ({ state: b } = advanceEnduranceWeather(b, nowB, bRng, config));
  sequenceA.push([a.current, a.phaseEndsMs - a.phaseStartedMs]);
  sequenceB.push([b.current, b.phaseEndsMs - b.phaseStartedMs]);
}
assert.deepEqual(sequenceA, sequenceB);
assert.equal(sequenceA.some(([type], index) => index && type === sequenceA[index - 1][0]), false);
assert.equal(sequenceA.some(([type], index) => index && type === 'frost' && sequenceA[index - 1][0] === 'frost'), false);
assert.ok(a.frostScheduledMs / a.totalScheduledMs <= .4 + Number.EPSILON);

assert.deepEqual(weatherShotMetadata('clear', config), { weatherType: 'clear', collisionScale: 1 });
assert.deepEqual(weatherShotMetadata('frost', config), { weatherType: 'frost', collisionScale: .82 });
assert.equal(weatherCallout('snow', 'frost'), 'MRÓZ — mniejsza kolizja pocisków');
assert.equal(weatherCallout('frost', 'rain'), 'ODWILŻ — normalna wielkość pocisków');
assert.equal(weatherBadgeLabel('frost'), '❄ FROST');

const noTransition = { ...a, transitionStartedMs: null };
assert.equal(weatherTransitionProgress(noTransition, 1234, config), 1);
const transitionState = { ...a, transitionStartedMs: 1000, transitionDurationMs: 2200 };
assert.equal(weatherTransitionProgress(transitionState, 1000, config), 0);
assert.ok(weatherTransitionProgress(transitionState, 2100, config) > .49 && weatherTransitionProgress(transitionState, 2100, config) < .51);
assert.equal(weatherTransitionProgress(transitionState, 3200, config), 1);

console.log('✓ deterministic Endurance weather scheduler');
