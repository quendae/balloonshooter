import { LEVELS, WORLDS, getWorld } from './levels.mjs';
import { applyCampaignResult, evaluateMasteries } from './sky-rescue-core.mjs';
import { loadProgress, saveProgress } from './save.mjs';
import { SkyRescueGame } from './game.mjs';
import { EnduranceGame } from './endurance-game.mjs';
import { applyStormFeedbackPatch } from './storm-feedback.mjs';
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
  continueButton: $('continueButton'), enduranceButton: $('enduranceButton'), homeButton: $('homeButton'), backButton: $('backButton'),
  pauseButton: $('pauseButton'), canvas: $('gameCanvas'), gameWorldLabel: $('gameWorldLabel'), gameLevelLabel: $('gameLevelLabel'),
  objectiveLabel: $('objectiveLabel'), objectiveCurrent: $('objectiveCurrent'), objectiveTarget: $('objectiveTarget'),
  scoreValue: $('scoreValue'), comboValue: $('comboValue'), shotQueue: $('shotQueue'), shotsValue: $('shotsValue'),
  dropValue: $('dropValue'), missesValue: $('missesValue'), statOneLabel: $('statOneLabel'), statTwoLabel: $('statTwoLabel'),
  statThreeLabel: $('statThreeLabel'), comboCallout: $('comboCallout'), bossMeter: $('bossMeter'), bossPips: $('bossPips'),
  enduranceDialog: $('enduranceDialog'), enduranceStartButton: $('enduranceStartButton'), enduranceBackButton: $('enduranceBackButton'),
  enduranceBestScore: $('enduranceBestScore'), enduranceBestTime: $('enduranceBestTime'), enduranceBestCombo: $('enduranceBestCombo'),
  resultDialog: $('resultDialog'), resultKicker: $('resultKicker'), resultTitle: $('resultTitle'), resultStars: $('resultStars'),
  resultScore: $('resultScore'), resultDetail: $('resultDetail'), resultMasteries: $('resultMasteries'),
  resultMapButton: $('resultMapButton'), retryButton: $('retryButton'), nextButton: $('nextButton'), pauseDialog: $('pauseDialog'),
  pauseTitle: $('pauseTitle'), pauseMapButton: $('pauseMapButton'), resumeButton: $('resumeButton'),
};
const CAMPAIGN_MAX = LEVELS.length * 3;

let progress = loadProgress();
const audio = new SkyAudio(progress.settings.sound);
let currentLevel = null;
let activeGame = null;
let activeMode = 'campaign';
let calloutTimer = 0;
let runMastery = null;

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function resetRunMastery() {
  runMastery = { lastShotsUsed: 0, pendingBounced: false, successfulBankShots: 0, largestDrop: 0 };
}

function trackCallout(text) {
  if (!runMastery) return;
  if (text === 'AVALANCHE' || text === 'SKY FALL') runMastery.largestDrop = Math.max(runMastery.largestDrop, 6);
}

applyStormFeedbackPatch(SkyRescueGame);

function destroyActiveGame() {
  activeGame?.destroy?.();
  activeGame = null;
}

function createCampaignGame() {
  return new SkyRescueGame(refs.canvas, {
    onState: updateHud,
    onComplete: showWin,
    onFail: showLoss,
    onShot: (shot) => {
      if (runMastery) runMastery.pendingBounced = false;
      audio.shot(shot.type);
    },
    onBounce: () => {
      if (runMastery) runMastery.pendingBounced = true;
      audio.bounce();
    },
    onCallout: (text) => { trackCallout(text); audio.pop(text); flashCallout(text); },
    onRescue: () => { audio.rescue(); flashCallout('RESCUE!'); },
    onCollect: () => { audio.collect(); flashCallout('STAR!'); },
    onAnchor: () => { audio.anchor(); flashCallout('ANCHOR DOWN'); },
    onCeilingDrop: () => { audio.ceiling(); flashCallout('CEILING DROP'); },
    onLightning: () => { audio.lightning(); flashCallout('PIORUN!'); },
    onBossPhase: ({ current, total }) => {
      renderBossPips(refs.bossPips, current, total);
      audio.boss();
      flashCallout(current >= total ? 'STORM BROKEN' : `PHASE ${current}/${total}`);
    },
  });
}

function createEnduranceGame() {
  return new EnduranceGame(refs.canvas, {
    onState: updateHud,
    onEnduranceEnd: showEnduranceEnd,
    onShot: (shot) => audio.shot(shot.type),
    onBounce: () => audio.bounce(),
    onCallout: (text) => { audio.pop(text); flashCallout(text); },
    onEnduranceRow: () => { audio.ceiling(); flashCallout('NOWY RZĄD'); },
  });
}

function renderMap() {
  renderCampaignMap(refs.campaignMap, WORLDS, LEVELS, progress, startLevel);
  const stars = totalStars(progress);
  const masteries = totalMasteries(progress);
  refs.totalStars.textContent = String(stars);
  refs.totalMasteries.textContent = String(masteries);
  refs.campaignProgressBank.setAttribute('aria-label', `${stars} z ${CAMPAIGN_MAX} gwiazdek i ${masteries} z ${CAMPAIGN_MAX} odznak mastery`);
  const next = firstPlayableLevel(LEVELS, progress);
  refs.continueButton.textContent = progress.levels?.[next.id]?.completed ? 'Zagraj ponownie' : `Poziom ${next.number}`;
  refs.continueButton.onclick = () => startLevel(next);
}

function renderEnduranceRecords() {
  const record = progress.endurance || { bestScore: 0, bestTimeMs: 0, bestCombo: 0 };
  refs.enduranceBestScore.textContent = record.bestScore.toLocaleString('pl-PL');
  refs.enduranceBestTime.textContent = formatDuration(record.bestTimeMs);
  refs.enduranceBestCombo.textContent = String(record.bestCombo);
}

function updateEnduranceRecords(result) {
  const previous = progress.endurance || { bestScore: 0, bestTimeMs: 0, bestCombo: 0 };
  const next = {
    bestScore: Math.max(previous.bestScore || 0, Number(result.score) || 0),
    bestTimeMs: Math.max(previous.bestTimeMs || 0, Number(result.elapsedMs) || 0),
    bestCombo: Math.max(previous.bestCombo || 0, Number(result.bestCombo) || 0),
  };
  const improved = next.bestScore > previous.bestScore || next.bestTimeMs > previous.bestTimeMs || next.bestCombo > previous.bestCombo;
  progress = saveProgress({ ...progress, endurance: next });
  renderEnduranceRecords();
  return improved;
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
  destroyActiveGame();
  currentLevel = null;
  activeMode = 'campaign';
  runMastery = null;
  refs.gameScreen.dataset.mode = activeMode;
  refs.gameScreen.dataset.paletteStage = '0';
  if (refs.pauseDialog.open) refs.pauseDialog.close();
  if (refs.resultDialog.open) refs.resultDialog.close();
  if (refs.enduranceDialog.open) refs.enduranceDialog.close();
  refs.gameScreen.hidden = true;
  refs.mapScreen.hidden = false;
  renderMap();
  renderEnduranceRecords();
  window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

function startLevel(level) {
  destroyActiveGame();
  activeMode = 'campaign';
  currentLevel = level;
  resetRunMastery();
  const world = getWorld(level.world);
  refs.gameScreen.dataset.mode = activeMode;
  refs.gameScreen.dataset.paletteStage = '0';
  refs.mapScreen.hidden = true;
  refs.gameScreen.hidden = false;
  refs.gameWorldLabel.textContent = world?.name || 'Sky Rescue';
  refs.gameLevelLabel.textContent = `${level.number}. ${level.name}`;
  refs.bossMeter.hidden = !level.boss;
  refs.statOneLabel.textContent = 'Strzały';
  refs.statTwoLabel.textContent = 'Sufit';
  refs.statThreeLabel.textContent = 'Pudła';
  if (level.boss) renderBossPips(refs.bossPips, 0, level.objective.amount || 0);
  if (refs.resultDialog.open) refs.resultDialog.close();
  if (refs.pauseDialog.open) refs.pauseDialog.close();
  activeGame = createCampaignGame();
  activeGame.start(level);
  requestAnimationFrame(() => refs.canvas.focus({ preventScroll: true }));
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function openEnduranceIntro() {
  renderEnduranceRecords();
  if (!refs.enduranceDialog.open) refs.enduranceDialog.showModal();
}

function startEndurance() {
  destroyActiveGame();
  activeMode = 'endurance';
  currentLevel = null;
  runMastery = null;
  refs.gameScreen.dataset.mode = activeMode;
  refs.gameScreen.dataset.paletteStage = '0';
  refs.mapScreen.hidden = true;
  refs.gameScreen.hidden = false;
  refs.gameWorldLabel.textContent = 'Tryb punktowy';
  refs.gameLevelLabel.textContent = 'Endurance';
  refs.objectiveLabel.textContent = '';
  refs.objectiveCurrent.textContent = '';
  refs.objectiveTarget.textContent = '';
  refs.bossMeter.hidden = true;
  refs.statOneLabel.textContent = 'Czas';
  refs.statTwoLabel.textContent = 'Kolory';
  refs.statThreeLabel.textContent = '';
  if (refs.enduranceDialog.open) refs.enduranceDialog.close();
  if (refs.resultDialog.open) refs.resultDialog.close();
  if (refs.pauseDialog.open) refs.pauseDialog.close();
  activeGame = createEnduranceGame();
  activeGame.start(`run-${Date.now()}`);
  requestAnimationFrame(() => refs.canvas.focus({ preventScroll: true }));
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function updateHud(snapshot) {
  if (!snapshot) return;
  refs.gameScreen.dataset.mode = activeMode;

  if (snapshot.mode === 'endurance') {
    refs.gameScreen.dataset.paletteStage = String(snapshot.paletteStage ?? 0);
    refs.statOneLabel.textContent = 'Czas';
    refs.statTwoLabel.textContent = 'Kolory';
    refs.statThreeLabel.textContent = '';
    refs.objectiveLabel.textContent = '';
    refs.objectiveCurrent.textContent = '';
    refs.objectiveTarget.textContent = '';
    refs.gameWorldLabel.textContent = 'Tryb punktowy';
    refs.gameLevelLabel.textContent = 'Endurance';
    refs.shotsValue.textContent = formatDuration(snapshot.elapsedMs);
    refs.dropValue.textContent = String(snapshot.colorCount);
    refs.missesValue.textContent = '';
  } else {
    refs.gameScreen.dataset.paletteStage = '0';
    if (runMastery && snapshot.shotsUsed > runMastery.lastShotsUsed) {
      if (runMastery.pendingBounced && snapshot.combo > 0) runMastery.successfulBankShots += 1;
      runMastery.pendingBounced = false;
      runMastery.lastShotsUsed = snapshot.shotsUsed;
    }
    refs.statOneLabel.textContent = 'Strzały';
    refs.statTwoLabel.textContent = 'Sufit';
    refs.statThreeLabel.textContent = 'Pudła';
    refs.objectiveLabel.textContent = snapshot.objectiveLabel;
    refs.objectiveCurrent.textContent = String(snapshot.objective.current);
    refs.objectiveTarget.textContent = String(snapshot.objective.target);
    refs.shotsValue.textContent = String(snapshot.shotsRemaining);
    refs.dropValue.textContent = String(snapshot.shotsUntilDrop);
    refs.missesValue.textContent = String(snapshot.misses);
  }

  refs.scoreValue.textContent = snapshot.score.toLocaleString('pl-PL');
  refs.comboValue.textContent = snapshot.combo > 0 ? `×${snapshot.combo}` : '—';
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
  refs.resultStars.hidden = false;
  refs.resultStars.innerHTML = [0, 1, 2].map((index) => `<span class="${index < result.stars ? '' : 'empty'}" aria-hidden="true">★</span>`).join('');
  refs.resultStars.setAttribute('aria-label', `${result.stars} z 3 gwiazdek`);
  refs.resultDetail.textContent = newMasteries.length
    ? `Nowe mastery: ${newMasteries.length} • zostało ${result.shotsRemaining} strzałów • ${result.misses} pudeł.`
    : `${result.shotsRemaining} strzałów zostało • ${result.misses} pudeł.`;
  refs.resultMasteries.hidden = false;
  renderMasteryBadges(refs.resultMasteries, storedMasteries, newMasteries);
  refs.retryButton.textContent = 'Powtórz';

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
  refs.resultStars.hidden = false;
  refs.resultStars.innerHTML = '<span class="empty">★</span><span class="empty">★</span><span class="empty">★</span>';
  refs.resultStars.setAttribute('aria-label', '0 z 3 gwiazdek');
  refs.resultDetail.textContent = result.reason;
  refs.resultMasteries.hidden = true;
  refs.retryButton.textContent = 'Powtórz';
  refs.nextButton.hidden = true;
  refs.resultDialog.showModal();
}

function showEnduranceEnd(result) {
  const improved = updateEnduranceRecords(result);
  audio.loss();
  refs.resultKicker.textContent = improved ? 'Nowy rekord' : 'Endurance zakończony';
  refs.resultTitle.textContent = `Combo ${result.bestCombo}`;
  refs.resultScore.textContent = result.score.toLocaleString('pl-PL');
  refs.resultStars.hidden = true;
  refs.resultDetail.textContent = `${formatDuration(result.elapsedMs)} • combo ${result.bestCombo} • ${result.resolvedShots} strzałów • ${result.misses} pudeł • ${result.rowsAdded} nowych rzędów • ${result.reason}`;
  refs.resultMasteries.hidden = true;
  refs.retryButton.textContent = 'Jeszcze raz';
  refs.nextButton.hidden = true;
  refs.resultDialog.showModal();
}

function openPause() {
  if (!activeGame || activeGame.status !== 'playing' || refs.pauseDialog.open) return;
  activeGame.setPaused(true);
  refs.pauseTitle.textContent = activeMode === 'endurance' ? 'Endurance' : 'Sky Rescue';
  refs.pauseDialog.showModal();
}

function resumeGame() {
  if (refs.pauseDialog.open) refs.pauseDialog.close();
  activeGame?.setPaused(false);
  refs.canvas.focus({ preventScroll: true });
}

function leaveForMap() {
  activeGame?.setPaused(true);
  showMap();
}

refs.homeButton.addEventListener('click', () => refs.gameScreen.hidden ? showMap() : openPause());
refs.backButton.addEventListener('click', openPause);
refs.pauseButton.addEventListener('click', openPause);
refs.soundButton.addEventListener('click', toggleSound);
refs.enduranceButton.addEventListener('click', openEnduranceIntro);
refs.enduranceStartButton.addEventListener('click', startEndurance);
refs.enduranceBackButton.addEventListener('click', () => refs.enduranceDialog.close());
refs.resumeButton.addEventListener('click', resumeGame);
refs.pauseMapButton.addEventListener('click', leaveForMap);
refs.resultMapButton.addEventListener('click', showMap);
refs.retryButton.addEventListener('click', () => {
  refs.resultDialog.close();
  if (activeMode === 'endurance') startEndurance();
  else if (currentLevel) startLevel(currentLevel);
});

refs.enduranceDialog.addEventListener('cancel', (event) => { event.preventDefault(); refs.enduranceDialog.close(); });
refs.pauseDialog.addEventListener('cancel', (event) => { event.preventDefault(); resumeGame(); });
refs.resultDialog.addEventListener('cancel', (event) => { event.preventDefault(); showMap(); });

syncSoundButton();
renderMap();
renderEnduranceRecords();