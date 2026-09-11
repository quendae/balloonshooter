import { LEVELS, WORLDS, getWorld } from './levels.mjs';
import { applyCampaignResult, evaluateMasteries } from './sky-rescue-core.mjs';
import { loadProgress, saveProgress } from './save.mjs';
import { SkyRescueGame } from './game.mjs';
import { SkyAudio } from './audio.mjs';
import {
  firstPlayableLevel,
  renderBossPips,
  renderCampaignMap,
  renderMasteryBadges,
  renderShotQueue,
  totalMasteries,
  totalStars,
} from './campaign-ui.mjs';

const $ = (id) => document.getElementById(id);
const refs = {
  mapScreen: $('mapScreen'), gameScreen: $('gameScreen'), campaignMap: $('campaignMap'), totalStars: $('totalStars'),
  totalMasteries: $('totalMasteries'), campaignProgressBank: $('campaignProgressBank'), soundButton: $('soundButton'),
  continueButton: $('continueButton'), homeButton: $('homeButton'), backButton: $('backButton'), pauseButton: $('pauseButton'),
  canvas: $('gameCanvas'), gameWorldLabel: $('gameWorldLabel'), gameLevelLabel: $('gameLevelLabel'),
  objectiveLabel: $('objectiveLabel'), objectiveCurrent: $('objectiveCurrent'), objectiveTarget: $('objectiveTarget'),
  scoreValue: $('scoreValue'), comboValue: $('comboValue'), shotQueue: $('shotQueue'), shotsValue: $('shotsValue'),
  dropValue: $('dropValue'), missesValue: $('missesValue'), comboCallout: $('comboCallout'), bossMeter: $('bossMeter'),
  bossPips: $('bossPips'), resultDialog: $('resultDialog'), resultKicker: $('resultKicker'), resultTitle: $('resultTitle'),
  resultStars: $('resultStars'), resultScore: $('resultScore'), resultDetail: $('resultDetail'), resultMasteries: $('resultMasteries'),
  resultMapButton: $('resultMapButton'), retryButton: $('retryButton'), nextButton: $('nextButton'), pauseDialog: $('pauseDialog'),
  pauseMapButton: $('pauseMapButton'), resumeButton: $('resumeButton'),
};

let progress = loadProgress();
const audio = new SkyAudio(progress.settings.sound);
let currentLevel = null;
let calloutTimer = 0;
let runMastery = null;

function resetRunMastery() {
  runMastery = { lastShotsUsed: 0, pendingBounced: false, successfulBankShots: 0, largestDrop: 0 };
}

function trackCallout(text) {
  if (text === 'AVALANCHE' || text === 'SKY FALL') runMastery.largestDrop = Math.max(runMastery.largestDrop, 6);
}

const game = new SkyRescueGame(refs.canvas, {
  onState: updateHud,
  onComplete: showWin,
  onFail: showLoss,
  onShot: (shot) => { runMastery.pendingBounced = false; audio.shot(shot.type); },
  onBounce: () => { runMastery.pendingBounced = true; audio.bounce(); },
  onCallout: (text) => { trackCallout(text); audio.pop(text); flashCallout(text); },
  onRescue: () => { audio.rescue(); flashCallout('RESCUE!'); },
  onCollect: () => { audio.collect(); flashCallout('STAR!'); },
  onAnchor: () => { audio.anchor(); flashCallout('ANCHOR DOWN'); },
  onCeilingDrop: () => { audio.ceiling(); flashCallout('CEILING DROP'); },
  onBossPhase: ({ current, total }) => {
    renderBossPips(refs.bossPips, current, total);
    audio.boss();
    flashCallout(current >= total ? 'STORM BROKEN' : `PHASE ${current}/${total}`);
  },
});

function renderMap() {
  renderCampaignMap(refs.campaignMap, WORLDS, LEVELS, progress, startLevel);
  const stars = totalStars(progress);
  const masteries = totalMasteries(progress);
  refs.totalStars.textContent = String(stars);
  refs.totalMasteries.textContent = String(masteries);
  refs.campaignProgressBank.setAttribute('aria-label', `${stars} z 45 gwiazdek i ${masteries} z 45 odznak mastery`);
  const next = firstPlayableLevel(LEVELS, progress);
  refs.continueButton.textContent = progress.levels?.[next.id]?.completed ? 'Zagraj ponownie' : `Poziom ${next.number}`;
  refs.continueButton.onclick = () => startLevel(next);
}

function syncSoundButton() {
  const enabled = progress.settings.sound !== false;
  refs.soundButton.dataset.enabled = String(enabled);
  refs.soundButton.setAttribute('aria-pressed', String(enabled));
  refs.soundButton.setAttribute('aria-label', enabled ? 'Wyłącz dźwięki' : 'Włącz dźwięki');
}

function toggleSound() {
  progress = { ...progress, settings: { ...progress.settings, sound: progress.settings.sound === false } };
  progress = saveProgress(progress);
  audio.setEnabled(progress.settings.sound);
  syncSoundButton();
}

function showMap() {
  if (refs.pauseDialog.open) refs.pauseDialog.close();
  if (refs.resultDialog.open) refs.resultDialog.close();
  refs.gameScreen.hidden = true;
  refs.mapScreen.hidden = false;
  renderMap();
  window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

function startLevel(level) {
  currentLevel = level;
  resetRunMastery();
  const world = getWorld(level.world);
  refs.mapScreen.hidden = true;
  refs.gameScreen.hidden = false;
  refs.gameWorldLabel.textContent = world?.name || 'Sky Rescue';
  refs.gameLevelLabel.textContent = `${level.number}. ${level.name}`;
  refs.bossMeter.hidden = !level.boss;
  if (level.boss) renderBossPips(refs.bossPips, 0, level.objective.amount || 0);
  if (refs.resultDialog.open) refs.resultDialog.close();
  if (refs.pauseDialog.open) refs.pauseDialog.close();
  game.start(level);
  requestAnimationFrame(() => refs.canvas.focus({ preventScroll: true }));
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function updateHud(snapshot) {
  if (!snapshot) return;
  if (runMastery && snapshot.shotsUsed > runMastery.lastShotsUsed) {
    if (runMastery.pendingBounced && snapshot.combo > 0) runMastery.successfulBankShots += 1;
    runMastery.pendingBounced = false;
    runMastery.lastShotsUsed = snapshot.shotsUsed;
  }
  refs.objectiveLabel.textContent = snapshot.objectiveLabel;
  refs.objectiveCurrent.textContent = String(snapshot.objective.current);
  refs.objectiveTarget.textContent = String(snapshot.objective.target);
  refs.scoreValue.textContent = snapshot.score.toLocaleString('pl-PL');
  refs.comboValue.textContent = snapshot.combo > 0 ? `×${snapshot.combo}` : '—';
  refs.shotsValue.textContent = String(snapshot.shotsRemaining);
  refs.dropValue.textContent = String(snapshot.shotsUntilDrop);
  refs.missesValue.textContent = String(snapshot.misses);
  renderShotQueue(refs.shotQueue, snapshot.queue);
  if (snapshot.boss) renderBossPips(refs.bossPips, snapshot.bossPhase, snapshot.bossPhases);
}

function flashCallout(text) {
  clearTimeout(calloutTimer);
  refs.comboCallout.classList.remove('is-visible');
  refs.comboCallout.textContent = text;
  void refs.comboCallout.offsetWidth;
  refs.comboCallout.classList.add('is-visible');
  calloutTimer = setTimeout(() => refs.comboCallout.classList.remove('is-visible'), 760);
}

function showWin(result) {
  const previousMasteries = progress.levels?.[result.level.id]?.masteries || [];
  const masteries = evaluateMasteries({ ...runMastery, misses: result.misses });
  const newMasteries = masteries.filter((id) => !previousMasteries.includes(id));
  progress = applyCampaignResult(progress, result.level.id, result.stars, result.score, masteries);
  progress = saveProgress(progress);
  const storedMasteries = progress.levels?.[result.level.id]?.masteries || masteries;
  renderMap();
  audio.win();

  refs.resultKicker.textContent = result.level.boss ? 'Burza pokonana' : 'Poziom ukończony';
  refs.resultTitle.textContent = result.stars === 3 ? 'Perfekcyjnie.' : result.stars === 2 ? 'Dobra robota.' : 'Gotowe.';
  refs.resultScore.textContent = result.score.toLocaleString('pl-PL');
  refs.resultStars.innerHTML = [0, 1, 2].map((index) => `<span class="${index < result.stars ? '' : 'empty'}" aria-hidden="true">★</span>`).join('');
  refs.resultStars.setAttribute('aria-label', `${result.stars} z 3 gwiazdek`);
  refs.resultDetail.textContent = newMasteries.length
    ? `Nowe mastery: ${newMasteries.length} • zostało ${result.shotsRemaining} strzałów • ${result.misses} pudeł.`
    : `${result.shotsRemaining} strzałów zostało • ${result.misses} pudeł.`;
  refs.resultMasteries.hidden = false;
  renderMasteryBadges(refs.resultMasteries, storedMasteries, newMasteries);

  const index = LEVELS.findIndex((level) => level.id === result.level.id);
  const next = LEVELS[index + 1] || null;
  refs.nextButton.hidden = !next;
  refs.nextButton.onclick = next ? () => { refs.resultDialog.close(); startLevel(next); } : null;
  refs.resultDialog.showModal();
}

function showLoss(result) {
  audio.loss();
  refs.resultKicker.textContent = 'Koniec próby';
  refs.resultTitle.textContent = 'Jeszcze raz?';
  refs.resultScore.textContent = result.score.toLocaleString('pl-PL');
  refs.resultStars.innerHTML = '<span class="empty">★</span><span class="empty">★</span><span class="empty">★</span>';
  refs.resultStars.setAttribute('aria-label', '0 z 3 gwiazdek');
  refs.resultDetail.textContent = result.reason;
  refs.resultMasteries.hidden = true;
  refs.nextButton.hidden = true;
  refs.resultDialog.showModal();
}

function openPause() {
  if (!currentLevel || game.status !== 'playing' || refs.pauseDialog.open) return;
  game.setPaused(true);
  refs.pauseDialog.showModal();
}

function resumeGame() {
  if (refs.pauseDialog.open) refs.pauseDialog.close();
  game.setPaused(false);
  refs.canvas.focus({ preventScroll: true });
}

function leaveForMap() {
  game.setPaused(true);
  showMap();
}

refs.homeButton.addEventListener('click', () => refs.gameScreen.hidden ? showMap() : openPause());
refs.backButton.addEventListener('click', openPause);
refs.pauseButton.addEventListener('click', openPause);
refs.soundButton.addEventListener('click', toggleSound);
refs.resumeButton.addEventListener('click', resumeGame);
refs.pauseMapButton.addEventListener('click', leaveForMap);
refs.resultMapButton.addEventListener('click', showMap);
refs.retryButton.addEventListener('click', () => {
  refs.resultDialog.close();
  if (currentLevel) startLevel(currentLevel);
});

refs.pauseDialog.addEventListener('cancel', (event) => { event.preventDefault(); resumeGame(); });
refs.resultDialog.addEventListener('cancel', (event) => { event.preventDefault(); showMap(); });

syncSoundButton();
renderMap();