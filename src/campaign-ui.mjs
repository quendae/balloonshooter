import { isLevelUnlocked, MASTERY_BADGES, MASTERY_IDS } from './sky-rescue-core.mjs';

function starsMarkup(count = 0) {
  return `${'★'.repeat(count)}${'☆'.repeat(Math.max(0, 3 - count))}`;
}

function masteryMarksMarkup(masteries = []) {
  const earned = new Set(masteries);
  return MASTERY_IDS.map((id) => {
    const badge = MASTERY_BADGES[id];
    return `<span class="mastery-mark${earned.has(id) ? ' is-earned' : ''}" title="${badge.label}" aria-hidden="true">${badge.symbol}</span>`;
  }).join('');
}

export function renderCampaignMap(container, worlds, levels, progress, onSelect) {
  container.replaceChildren();
  for (const world of worlds) {
    const section = document.createElement('section');
    section.className = 'world-section';
    section.dataset.world = world.id;

    const heading = document.createElement('div');
    heading.className = 'world-heading';
    heading.innerHTML = `<span class="world-icon world-icon-${world.id}" aria-hidden="true"><span></span></span><div><h2>${world.name}</h2><p>${world.subtitle}</p></div>`;
    section.append(heading);

    const route = document.createElement('div');
    route.className = 'level-route';
    for (const item of levels.filter((level) => level.world === world.id)) {
      const unlocked = isLevelUnlocked(item, levels, progress);
      const result = progress.levels?.[item.id] || { stars: 0, score: 0, masteries: [] };
      const masteries = result.masteries || [];
      const stop = document.createElement('div');
      stop.className = 'level-stop';

      const button = document.createElement('button');
      button.className = 'level-node';
      button.type = 'button';
      button.disabled = !unlocked;
      button.dataset.state = result.stars > 0 ? 'complete' : unlocked ? 'open' : 'locked';
      button.dataset.boss = String(Boolean(item.boss));
      button.textContent = String(item.number);
      button.setAttribute('aria-label', `${item.number}. ${item.name}${result.stars ? `, ${result.stars} gwiazdki` : ''}${masteries.length ? `, ${masteries.length} odznaki mastery` : ''}${unlocked ? '' : ', zablokowany'}`);
      if (unlocked) button.addEventListener('click', () => onSelect(item));

      const stars = document.createElement('div');
      stars.className = 'level-stars';
      stars.textContent = starsMarkup(result.stars || 0);
      stars.setAttribute('aria-hidden', 'true');

      const mastery = document.createElement('div');
      mastery.className = 'level-masteries';
      mastery.innerHTML = masteryMarksMarkup(masteries);
      mastery.setAttribute('aria-label', `${masteries.length} z 3 odznak mastery`);

      const name = document.createElement('div');
      name.className = 'level-name';
      name.textContent = item.name;
      stop.append(button, stars, mastery, name);
      route.append(stop);
    }
    section.append(route);
    container.append(section);
  }
}

export function renderShotQueue(container, queue) {
  container.replaceChildren();
  queue.forEach((shot, index) => {
    const item = document.createElement('div');
    item.className = 'queue-shot';
    item.dataset.type = shot.type;
    item.dataset.color = String(shot.color || 1);
    item.style.backgroundImage = `url("assets/ball_${shot.color || 1}.png")`;
    item.setAttribute('aria-label', `${index === 0 ? 'Aktualny' : `Następny ${index}`}: ${shot.type === 'normal' ? `kolor ${shot.color}` : shot.type}`);
    container.append(item);
  });
}

export function renderBossPips(container, current, total) {
  container.replaceChildren();
  for (let i = 0; i < total; i += 1) {
    const pip = document.createElement('span');
    pip.className = `boss-pip${i < current ? ' is-cleared' : ''}`;
    container.append(pip);
  }
  container.setAttribute('aria-label', `${current} z ${total} faz ukończonych`);
}

export function renderMasteryBadges(container, masteries = [], newMasteries = []) {
  const earned = new Set(masteries);
  const fresh = new Set(newMasteries);
  container.replaceChildren();
  for (const id of MASTERY_IDS) {
    const badge = MASTERY_BADGES[id];
    const item = document.createElement('div');
    item.className = `mastery-badge${earned.has(id) ? ' is-earned' : ''}${fresh.has(id) ? ' is-new' : ''}`;
    item.innerHTML = `<span class="mastery-badge-symbol" aria-hidden="true">${badge.symbol}</span><span><strong>${badge.label}</strong><small>${badge.description}</small></span>`;
    container.append(item);
  }
  container.setAttribute('aria-label', `${masteries.length} z 3 odznak mastery`);
}

export function totalStars(progress) {
  return Object.values(progress.levels || {}).reduce((sum, result) => sum + (result.stars || 0), 0);
}

export function totalMasteries(progress) {
  return Object.values(progress.levels || {}).reduce((sum, result) => sum + (result.masteries?.length || 0), 0);
}

export function firstPlayableLevel(levels, progress) {
  return levels.find((level) => isLevelUnlocked(level, levels, progress) && !progress.levels?.[level.id]?.completed)
    || [...levels].reverse().find((level) => isLevelUnlocked(level, levels, progress))
    || levels[0];
}
