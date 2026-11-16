// The DOM HUD: crosshair, hit marker, health, ammo, timer, score, kill feed, bomb
// status, prompts, banners and the buy menu. It never touches the simulation;
// main.js pushes numbers in and reads the play and buy callbacks out.
import { WEAPONS, GRENADE_PRICE, ARMOR_PRICE } from './weapons.js';
import { formatTime } from './util.js';

const COPY = {
  start: {
    title: 'Harbor Yard',
    copy: 'A dusk container yard. Plant the spike at Crane or Warehouse, or drop every Sentinel. Click to play.',
    action: 'Click to play',
  },
  paused: {
    title: 'Harbor Yard',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const grenadeCount = $('grenade-count');
  const healthFill = $('health-fill');
  const healthNumber = $('health-number');
  const armorNumber = $('armor-number');
  const moneyValue = $('money-value');
  const timerValue = $('timer-value');
  const scoreValue = $('score-value');
  const roundLabel = $('round-label');
  const aliveV = $('alive-v');
  const aliveS = $('alive-s');
  const killfeed = $('killfeed');
  const bombStatus = $('bomb-status');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const buy = $('buy');
  const buyItems = $('buy-items');
  const buyMoney = $('buy-money');
  const prompt = $('prompt');
  const vignette = $('vignette');

  let hitTimer = 0;
  let lastAmmo = '';
  let lastHealth = '';
  let lastTimer = '';
  let lastScore = '';
  let lastAlive = '';
  let lastMoney = -1;

  // Buy menu items, rendered once; availability refreshes from state.
  const BUY_LIST = [
    { key: '1', id: 'rifle', label: 'VK-9 Prowler', detail: 'Rifle · 34 dmg · 30 rounds', price: WEAPONS.rifle.price },
    { key: '2', id: 'smg', label: 'Dusk-9', detail: 'SMG · 22 dmg · 28 rounds', price: WEAPONS.smg.price },
    { key: '3', id: 'grenade', label: 'Popper-4', detail: 'Frag grenade · 1.6 s fuse', price: GRENADE_PRICE },
    { key: '4', id: 'armor', label: 'Vest', detail: 'Kevlar · absorbs half the damage', price: ARMOR_PRICE },
  ];
  const itemEls = {};
  for (const item of BUY_LIST) {
    const el = document.createElement('button');
    el.className = 'buy-item';
    el.type = 'button';
    el.dataset.id = item.id;
    el.innerHTML = `<b>${item.key}</b><span class="buy-name">${item.label}</span><span class="buy-detail">${item.detail}</span><span class="buy-price">$${item.price}</span>`;
    buyItems.appendChild(el);
    itemEls[item.id] = el;
  }

  return {
    setHealth(hp, armor) {
      const key = `${hp}|${armor}`;
      if (key === lastHealth) return;
      lastHealth = key;
      healthFill.style.width = `${Math.max(0, hp)}%`;
      healthFill.classList.toggle('low', hp <= 30);
      healthNumber.textContent = String(Math.max(0, Math.ceil(hp)));
      armorNumber.textContent = armor > 0 ? `+${Math.ceil(armor)}` : '';
    },
    setAmmo(mag, reserve, weapon, grenades) {
      const key = `${mag}|${reserve}|${weapon}|${grenades}`;
      if (key === lastAmmo) return;
      lastAmmo = key;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      weaponName.textContent = weapon;
      grenadeCount.textContent = grenades > 0 ? `◉ ${grenades}` : '';
    },
    setMoney(value) {
      if (value === lastMoney) return;
      lastMoney = value;
      moneyValue.textContent = `$${value}`;
      buyMoney.textContent = `$${value}`;
    },
    setTimer(seconds, phase) {
      const text = phase === 'buy' ? `BUY ${formatTime(seconds)}` : formatTime(seconds);
      if (text === lastTimer) return;
      lastTimer = text;
      timerValue.textContent = text;
      timerValue.classList.toggle('urgent', phase === 'live' && seconds <= 10);
    },
    setScore(v, s, round) {
      const text = `${v} — ${s}`;
      if (text !== lastScore) {
        lastScore = text;
        scoreValue.textContent = text;
      }
      roundLabel.textContent = `ROUND ${round}`;
    },
    setAlive(v, s) {
      const text = `${v}|${s}`;
      if (text === lastAlive) return;
      lastAlive = text;
      aliveV.textContent = `${v} alive`;
      aliveS.textContent = `${s} alive`;
    },
    setCrosshairGap(px) {
      crosshair.style.setProperty('--gap', `${px.toFixed(1)}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash() {
      vignette.classList.remove('hit');
      void vignette.offsetWidth;
      vignette.classList.add('hit');
    },
    killFeed(text, team) {
      const line = document.createElement('div');
      line.className = 'feed-line';
      line.innerHTML = text;
      killfeed.prepend(line);
      while (killfeed.children.length > 5) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => line.remove(), 10000);
    },
    setBombStatus(text, urgent) {
      bombStatus.textContent = text;
      bombStatus.classList.toggle('urgent', !!urgent);
      bombStatus.hidden = !text;
    },
    showBanner(titleText, subText, good) {
      bannerTitle.textContent = titleText;
      bannerSub.textContent = subText;
      banner.classList.toggle('good', !!good);
      banner.classList.toggle('bad', !good);
      banner.hidden = false;
    },
    hideBanner() {
      banner.hidden = true;
    },
    showPrompt(text) {
      prompt.textContent = text;
      prompt.hidden = false;
    },
    hidePrompt() {
      prompt.hidden = true;
    },
    refreshBuy(owned, money) {
      for (const item of BUY_LIST) {
        const el = itemEls[item.id];
        const isOwned = item.id === 'grenade' ? false : owned.has(item.id);
        el.classList.toggle('owned', isOwned);
        el.classList.toggle('poor', money < item.price);
        el.querySelector('.buy-price').textContent = isOwned ? 'OWNED' : `$${item.price}`;
      }
    },
    showBuy(show) {
      buy.hidden = !show;
    },
    buyVisible() {
      return !buy.hidden;
    },
    onBuy(handler) {
      buyItems.addEventListener('click', (event) => {
        const el = event.target.closest('.buy-item');
        if (el) handler(el.dataset.id);
      });
    },
    showOverlay(mode) {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
  };
}
