import { LEVELS, WORLDS, getWorld } from './levels.mjs';
import { applyCampaignResult } from './sky-rescue-core.mjs';
import { loadProgress, saveProgress } from './save.mjs';
import { SkyRescueGame } from './game.mjs';
import { firstPlayableLevel, renderBossPips, renderCampaignMap, renderShotQueue, totalStars } from './campaign-ui.mjs';

const $ = (id) => document.getElementById(id);
const refs = {
  mapScreen: $('mapScreen'), gameScreen: $('gameScreen'), campaignMap: $('campaignMap'), totalStars: $('totalStars'),
  continueButton: $('continueButton'), homeButton: $('homeButton'), backButton: $('backButton'), pauseButton: $('pauseButton'),
  canvas: $('gameCanvas'), gameWorldLabel: $('gameWorldLabel'), gameLevelLabel: $('gameLevelLabel'), levelHint: $('levelHint'),
  objectiveLabel: $('objectiveLabel'), objectiveCurrent: $('objectiveCurrent'), objectiveTarget: $('objectiveTarget'),
  scoreValue: $('scoreValue'), comboValue: $('comboValue'), shotQueue: $('shotQueue'), shotsValue: $('shotsValue'),
  dropValue: $('dropValue'), missesValue: $('missesValue'), comboCallout: $('comboCallout'), bossMeter: $('bossMeter'),
  bossPips: $('bossPips'), resultDialog: $('resultDialog'), resultKicker: $('resultKicker'), resultTitle: $('resultTitle'),
  resultStars: $('resultStars'), resultScore: $('resultScore'), resultDetail: $('resultDetail'), resultMapButton: $('resultMapButton'),
  retryButton: $('retryButton'), nextButton: $('nextButton'), pauseDialog: $('pauseDialog'), pauseMapButton: $('pauseMapButton'),
  resumeButton: $('resumeButton'),
};

let progress = loadProgress();
let currentLevel = null;
let calloutTimer = 0;

const game = new SkyRescueGame(refs.canvas, {
  onState: updateHud,
  onComplete: showWin,
  onFail: showLoss,
  onCallout: flashCallout,
  onRescue: () => flashCallout('RESCUE!'),
  onCollect: () => flashCallout('STAR!'),
  onAnchor: () => flashCallout('ANCHOR DOWN'),
  onCeilingDrop: () => flashCallout('CEILING DROP'),
  onBossPhase: ({ current, total }) => {
    renderBossPips(refs.bossPips, current, total);
    flashCallout(current >= total ? 'STORM BROKEN' : `PHASE ${current}/${total}`);
  },
});

function renderMap() {
  renderCampaignMap(refs.campaignMap, WORLDS, LEVELS, progress, startLevel);
  refs.totalStars.textContent = String(totalStars(progress));
  const next = firstPlayableLevel(LEVELS, progress);
  refs.continueButton.textContent = progress.levels?.[next.id]?.completed ? 'Zagraj ponownie' : `Leć do poziomu ${next.number}`;
  refs.continueButton.onclick = () => startLevel(next);
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
  const world = getWorld(level.world);
  refs.mapScreen.hidden = true;
  refs.gameScreen.hidden = false;
  refs.gameWorldLabel.textContent = world?.name || 'Sky Rescue';
  refs.gameLevelLabel.textContent = `${level.number}. ${level.name}`;
  refs.levelHint.textContent = level.hint || '';
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
  refs.objectiveLabel.textContent = snapshot.objectiveLabel;
  refs.objectiveCurrent.textContent = String(snapshot.objective.current);
  refs.objectiveTarget.textContent = String(snapshot.objective.target);
  refs.scoreValue.textContent = snapshot.score.toLocaleString('pl-PL');
  refs.comboValue.textContent = snapshot.combo > 0 ? `Combo ×${snapshot.combo}` : 'Combo —';
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
  progress = applyCampaignResult(progress, result.level.id, result.stars, result.score);
  progress = saveProgress(progress);
  renderMap();

  refs.resultKicker.textContent = result.level.boss ? 'Burza pokonana' : 'Poziom ukończony';
  refs.resultTitle.textContent = result.stars === 3 ? 'Perfekcyjny lot!' : result.stars === 2 ? 'Świetny lot!' : 'Misja wykonana!';
  refs.resultScore.textContent = result.score.toLocaleString('pl-PL');
  refs.resultStars.innerHTML = [0, 1, 2].map((index) => `<span class="${index < result.stars ? '' : 'empty'}" aria-hidden="true">★</span>`).join('');
  refs.resultStars.setAttribute('aria-label', `${result.stars} z 3 gwiazdek`);
  refs.resultDetail.textContent = result.optionalComplete
    ? 'Cel dodatkowy ukończony — trzecia gwiazdka jest Twoja.'
    : `${result.shotsRemaining} strzałów zostało • ${result.misses} pudeł.`;

  const index = LEVELS.findIndex((level) => level.id === result.level.id);
  const next = LEVELS[index + 1] || null;
  refs.nextButton.hidden = !next;
  refs.nextButton.onclick = next ? () => { refs.resultDialog.close(); startLevel(next); } : null;
  refs.resultDialog.showModal();
}

function showLoss(result) {
  refs.resultKicker.textContent = 'Spróbuj innej drogi';
  refs.resultTitle.textContent = 'Jeszcze jeden lot';
  refs.resultScore.textContent = result.score.toLocaleString('pl-PL');
  refs.resultStars.innerHTML = '<span class="empty">★</span><span class="empty">★</span><span class="empty">★</span>';
  refs.resultStars.setAttribute('aria-label', '0 z 3 gwiazdek');
  refs.resultDetail.textContent = result.reason;
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
refs.resumeButton.addEventListener('click', resumeGame);
refs.pauseMapButton.addEventListener('click', leaveForMap);
refs.resultMapButton.addEventListener('click', showMap);
refs.retryButton.addEventListener('click', () => {
  refs.resultDialog.close();
  if (currentLevel) startLevel(currentLevel);
});

refs.pauseDialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  resumeGame();
});
refs.resultDialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  showMap();
});

renderMap();
