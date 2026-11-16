// Harbor Yard: boot and the one loop. A fixed 60 Hz simulation feeding a render at
// the display's rate; the loop owns rounds, shooting, the spike, buying and the
// deterministic screenshot poses (?shot=start|play|end with &seed=N), and every other
// module owns one job behind it.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { mulberry32 } from './rng.js';
import { clamp } from './util.js';
import { MAP, createWorld } from './world.js';
import { createPlayer } from './player.js';
import { createInput } from './input.js';
import { createWeapons, WEAPONS, GRENADE_PRICE, ARMOR_PRICE } from './weapons.js';
import { createBots } from './bots.js';
import { createBomb, PLANT_TIME } from './bomb.js';
import { createMatch, BUY_SECONDS, ROUND_SECONDS, END_SECONDS, WIN_ROUNDS } from './state.js';
import { createEffects } from './effects.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const random = mulberry32(shot ? seed : (Date.now() % 2147483647));

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 30, 95);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 220);
scene.add(camera);

const world = createWorld(scene);
const audio = createAudio();
const effects = createEffects(scene);
const hud = createHud();
const match = createMatch();
const bomb = createBomb(scene);
const weapons = createWeapons(camera, audio);
const player = createPlayer(world.colliders, MAP.spawns.vanguard[0]);
const input = createInput(renderer.domElement, onLockChange);

// Invisible hit boxes for the player, so bot rays can hit them like any bot body.
const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
const playerTorso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.3), hitMat);
const playerHead = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), hitMat);
playerTorso.userData = { player: true, part: 'torso' };
playerHead.userData = { player: true, part: 'head' };
scene.add(playerTorso, playerHead);

const raycaster = new THREE.Raycaster();
raycaster.far = 95;
// The player's own shots resolve against the world and the bots only: the player's
// own hit boxes are for bot rays, never for the shooter's own ray.
const shootables = world.shootables.slice();
const dir = new THREE.Vector3();
const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const muzzle = new THREE.Vector3();

let bots;
let botShots = 0;
const botCallbacks = {
  damagePlayer: (amount, from) => damagePlayer(amount, from),
  damageBot: (bot, amount, part, from) => damageBot(bot, amount, part, from),
  tracer: (from, to) => effects.tracer(from, to),
  noise: (position, radius) => bots.hearNoise(position, radius),
  onBotShot: (bot, dist) => {
    botShots += 1;
    if (dist < 30) audio.shot(bot.weapon);
    else audio.distantShot();
  },
  channelStart: () => audio.beep(),
  channelDone: (bot, kind) => {
    if (kind === 'plant') {
      bomb.plant(bot.position.x, bot.position.z, elapsed);
      hud.setBombStatus('SPIKE PLANTED', true);
      audio.beep(true);
    } else if (kind === 'defuse') {
      bomb.defuse();
      endRound('sentinel', 'Spike defused');
    }
  },
  playerHitMeshes: () => [playerTorso, playerHead],
};
bots = createBots(scene, world, random, botCallbacks);
shootables.push(...bots.hitMeshes);

const body = player.state;
let elapsed = 0;
let accumulator = 0;
let lastTime = performance.now();
let started = false;
let paused = false;
let frozen = false;
let playerAlive = true;
let spectating = null;
let trauma = 0;
let plantProgress = 0;
let wasFiring = false;
let stepCount = 0;

hud.setAmmo(weapons.ammo.pistol.mag, weapons.ammo.pistol.reserve, WEAPONS.pistol.name, 0);
hud.setMoney(match.match.money);
hud.setScore(0, 0, 1);
hud.setHealth(100, 0);
hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (match.match.matchWinner) {
    match.reset();
    startRound();
  }
  input.requestLock();
});
hud.onBuy((id) => tryBuy(id));

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    paused = false;
    hud.hideOverlay();
  } else if (started && !match.match.matchWinner) {
    paused = true;
    hud.showOverlay('paused');
  }
}

function startRound() {
  player.respawn(MAP.spawns.vanguard[0], 0);
  playerAlive = true;
  spectating = null;
  trauma = 0;
  plantProgress = 0;
  weapons.refillAmmo();
  weapons.clearGrenades();
  weapons.state.grenades = 0;
  weapons.switchTo('pistol');
  bomb.reset();
  bomb.giveTo(body);
  bots.assignRound(random, null);
  match.match.phase = 'buy';
  match.match.phaseLeft = BUY_SECONDS;
  hud.hideBanner();
  hud.showBuy(true);
  hud.refreshBuy(weapons.state.owned, match.match.money);
  hud.setBombStatus('You carry the spike', false);
  syncPlayerHitMeshes();
}

function endRound(winner, reason) {
  if (match.match.phase !== 'live') return;
  match.endRound(winner, reason);
  const good = winner === 'vanguard';
  hud.showBanner(
    good ? 'ROUND WON' : 'ROUND LOST',
    `${reason} · Vanguard ${match.match.wins.vanguard} — ${match.match.wins.sentinel} Sentinel`,
    good,
  );
  hud.showBuy(false);
  hud.hidePrompt();
  hud.setBombStatus('', false);
  if (good) audio.roundWin();
  else audio.roundLose();
  if (match.match.matchWinner) {
    hud.showBanner(
      match.match.matchWinner === 'vanguard' ? 'VANGUARD WINS THE MATCH' : 'SENTINEL WINS THE MATCH',
      `First to ${WIN_ROUNDS} rounds · click to play again`,
      match.match.matchWinner === 'vanguard',
    );
  }
}

function checkRoundEnd() {
  const m = match.match;
  if (m.phase !== 'live' || m.matchWinner) return;
  const vAlive = (playerAlive ? 1 : 0) + bots.aliveCount('vanguard');
  const sAlive = bots.aliveCount('sentinel');
  if (sAlive === 0) endRound('vanguard', 'Sentinel eliminated');
  else if (vAlive === 0) endRound('sentinel', 'Vanguard eliminated');
  else if (m.phaseLeft <= 0 && bomb.bomb.phase !== 'planted') endRound('sentinel', 'Time expired — spike not planted');
}

function damagePlayer(amount, from) {
  if (shot) return;
  if (!playerAlive || match.match.phase !== 'live') return;
  let remaining = amount;
  if (body.armor > 0) {
    const absorbed = Math.min(body.armor, amount * 0.5);
    body.armor -= absorbed;
    remaining -= absorbed;
  }
  body.health -= remaining;
  hud.damageFlash();
  audio.hurt();
  trauma = Math.min(1, trauma + 0.35);
  if (body.health <= 0) {
    body.health = 0;
    playerAlive = false;
    match.onDeath();
    hud.killFeed(`<b class="foe">${from.name}</b> ▸ <b class="friend">You</b>`, 'sentinel');
    if (bomb.bomb.carrier === body) {
      bomb.dropAt(body.position.x, body.position.z);
      hud.setBombStatus('Spike dropped — a teammate can pick it up', true);
    }
    spectate();
    checkRoundEnd();
  }
}

function damageBot(bot, amount, part, killer) {
  if (!bot.alive) return false;
  bot.health -= amount;
  if (bot.health > 0) return false;
  bot.alive = false;
  bot.target = null;
  bot.targetId = null;
  bot.channel = null;
  if (bot.hasSpike) {
    bot.hasSpike = false;
    bomb.dropAt(bot.position.x, bot.position.z);
  }
  const killerName = killer === 'player' ? 'You' : killer ? killer.name : '—';
  const killerClass = killer === 'player' || (killer && killer.team === 'vanguard') ? 'friend' : 'foe';
  const victimClass = bot.team === 'vanguard' ? 'friend' : 'foe';
  hud.killFeed(`<b class="${killerClass}">${killerName}</b> ▸ <b class="${victimClass}">${bot.name}</b>${part === 'head' ? ' ⌖' : ''}`, bot.team);
  if (killer === 'player') {
    match.addKillReward();
    audio.kill();
    hud.setMoney(match.match.money);
  }
  if (spectating === bot) spectate();
  checkRoundEnd();
  return true;
}

function shoot(spread) {
  const def = weapons.tryFire();
  if (!def) {
    if (weapons.ammo[def?.id ?? weapons.state.current]?.mag === 0) audio.dryFire();
    return false;
  }
  camera.getWorldDirection(dir);
  dir.x += (random() * 2 - 1) * spread;
  dir.y += (random() * 2 - 1) * spread;
  dir.z += (random() * 2 - 1) * spread;
  dir.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, dir);
  raycaster.far = def.range;
  const hit = raycaster.intersectObjects(shootables, false)[0];
  const end = hit ? hit.point : tmp2.copy(camera.position).addScaledVector(dir, def.range);
  weapons.muzzleWorld(muzzle);
  effects.tracer(muzzle, end);
  bots.hearNoise(body.position, 26);
  if (hit) {
    const obj = hit.object;
    if (obj.userData.bot && obj.userData.bot.alive) {
      const amount = obj.userData.part === 'head' ? def.damage * def.headMult : def.damage;
      const killed = damageBot(obj.userData.bot, amount, obj.userData.part, 'player');
      hud.hitMarker(killed, shot ? 4000 : 90);
      if (!killed) audio.hit();
      effects.sparksAt(hit.point, 5);
    } else if (obj.userData.player) {
      // A shot can never hit its own shooter; ignore.
    } else {
      effects.sparksAt(hit.point, 4);
    }
  }
  player.recoil(0.008 + random() * 0.004, (random() * 2 - 1) * 0.004);
  trauma = Math.min(1, trauma + 0.08);
  hud.setAmmo(weapons.ammo[def.id].mag, weapons.ammo[def.id].reserve, def.name, weapons.state.grenades);
  return true;
}

function explodeAt(position) {
  effects.explode(position);
  audio.explosion();
  bots.hearNoise(position, 42);
  const pd = Math.hypot(body.position.x - position.x, body.position.z - position.z);
  if (playerAlive && pd < 12) damagePlayer(Math.max(10, 90 - pd * 7), null);
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const d = Math.hypot(bot.position.x - position.x, bot.position.z - position.z);
    if (d < 12) damageBot(bot, Math.max(10, 90 - d * 7), 'torso', null);
  }
  trauma = 1;
}

function tryBuy(id) {
  const m = match.match;
  if (m.phase !== 'buy') {
    audio.denied();
    return;
  }
  if (id === 'grenade') {
    if (!match.buyGrenade()) {
      audio.denied();
      return;
    }
    weapons.state.grenades += 1;
  } else if (id === 'armor') {
    if (!match.buyArmor()) {
      audio.denied();
      return;
    }
    body.armor = 100;
  } else {
    const price = weapons.buy(id, m.money);
    if (price < 0) {
      audio.denied();
      return;
    }
    m.money -= price;
    weapons.switchTo(id);
  }
  audio.buy();
  hud.setMoney(m.money);
  hud.refreshBuy(weapons.state.owned, m.money);
  hud.setAmmo(weapons.ammo[weapons.state.current].mag, weapons.ammo[weapons.state.current].reserve, weapons.currentDef().name, weapons.state.grenades);
}

function spectate() {
  spectating = bots.nearestBot('vanguard', body.position.x, body.position.z);
  if (!spectating) {
    camera.position.set(0, 20, 6);
    camera.lookAt(0, 0, -4);
  }
}

function syncCamera() {
  if (spectating && spectating.alive) {
    camera.position.set(spectating.position.x, spectating.position.y + 1.55, spectating.position.z);
    camera.rotation.set(0, spectating.yaw, 0, 'YXZ');
    return;
  }
  const shake = trauma * trauma * 0.02;
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(
    body.pitch + (Math.random() * 2 - 1) * shake,
    body.yaw + (Math.random() * 2 - 1) * shake,
    0,
    'YXZ',
  );
}

function syncPlayerHitMeshes() {
  playerTorso.position.set(body.position.x, body.position.y + 1.08, body.position.z);
  playerTorso.rotation.y = body.yaw;
  playerHead.position.set(body.position.x, body.position.y + 1.62, body.position.z);
}

function handleActions() {
  const m = match.match;
  const live = m.phase === 'live' && playerAlive && !spectating;
  if (live) {
    const firing = input.state.firing;
    const def = weapons.currentDef();
    if (firing && weapons.ready() && (def.auto || !wasFiring)) shoot(shot ? 0 : weapons.spread(player.groundSpeed()));
    wasFiring = firing;
    if (input.consume('KeyR')) weapons.reload();
    if (input.consume('KeyG') && weapons.state.grenades > 0) {
      camera.getWorldDirection(dir);
      const origin = tmp.copy(camera.position).addScaledVector(dir, 0.5);
      if (weapons.throwGrenade(origin, dir)) {
        hud.setAmmo(weapons.ammo[def.id].mag, weapons.ammo[def.id].reserve, def.name, weapons.state.grenades);
      }
    }
    if (input.consume('KeyQ')) {
      const owned = [...weapons.state.owned];
      const next = owned[(owned.indexOf(weapons.state.current) + 1) % owned.length];
      weapons.switchTo(next);
    }
    if (input.consume('Digit1')) weapons.switchTo('pistol');
    if (input.consume('Digit2')) weapons.switchTo('rifle');
    if (input.consume('Digit3')) weapons.switchTo('smg');
  }
  if (m.phase === 'buy') {
    if (input.consume('Digit1')) tryBuy('rifle');
    if (input.consume('Digit2')) tryBuy('smg');
    if (input.consume('Digit3')) tryBuy('grenade');
    if (input.consume('Digit4')) tryBuy('armor');
    if (input.consume('KeyQ')) {
      const owned = [...weapons.state.owned];
      const next = owned[(owned.indexOf(weapons.state.current) + 1) % owned.length];
      weapons.switchTo(next);
    }
  }
  if (input.consume('KeyB') && m.phase === 'buy') {
    hud.showBuy(!hud.buyVisible());
    hud.refreshBuy(weapons.state.owned, m.money);
  }
  // Spike: pick up a dropped one, plant the carried one on a site with E held.
  if (m.phase === 'live' && playerAlive) {
    const b = bomb.bomb;
    if (b.phase === 'dropped') {
      const d = Math.hypot(b.position.x - body.position.x, b.position.z - body.position.z);
      if (d < 1.6) {
        bomb.giveTo(body);
        hud.setBombStatus('You carry the spike', false);
        audio.beep(true);
      }
    }
    if (b.phase === 'carried' && b.carrier === body) {
      let site = null;
      for (const s of Object.values(MAP.sites)) {
        if (Math.hypot(s.x - body.position.x, s.z - body.position.z) < 2.6) site = s;
      }
      if (site) {
        if (input.state.keys.has('KeyE')) {
          plantProgress += FIXED_STEP;
          hud.showPrompt(`Planting spike at ${site.name}… ${Math.min(99, Math.floor((plantProgress / PLANT_TIME) * 100))}%`);
          if (plantProgress >= PLANT_TIME) {
            plantProgress = 0;
            hud.hidePrompt();
            bomb.plant(site.x, site.z, elapsed);
            match.addPlantReward();
            hud.setMoney(m.money);
            hud.setBombStatus('SPIKE PLANTED', true);
            audio.beep(true);
          }
        } else {
          plantProgress = 0;
          hud.showPrompt(`Hold E to plant the spike at ${site.name}`);
        }
      } else {
        plantProgress = 0;
        hud.hidePrompt();
      }
    }
  }
}

function step(dt) {
  elapsed += dt;
  stepCount += 1;
  const m = match.match;
  if (m.phase === 'buy') {
    m.phaseLeft -= dt;
    if (m.phaseLeft <= 0) {
      match.startLive();
      hud.showBuy(false);
      hud.hidePrompt();
    }
  } else if (m.phase === 'live') {
    if (bomb.bomb.phase !== 'planted') m.phaseLeft -= dt;
    if (playerAlive && !spectating) player.step(dt, input.state.keys);
    bots.step(dt, elapsed, player, playerAlive, bomb.bomb);
    if (bomb.step(dt, elapsed, () => audio.beep())) {
      bomb.detonate();
      explodeAt(bomb.bomb.position);
      endRound('vanguard', 'Spike detonated');
    }
    // A dropped spike is picked up by the nearest living Vanguard bot.
    if (bomb.bomb.phase === 'dropped') {
      const bot = bots.nearestBot('vanguard', bomb.bomb.position.x, bomb.bomb.position.z);
      if (bot && Math.hypot(bot.position.x - bomb.bomb.position.x, bot.position.z - bomb.bomb.position.z) < 1.6) {
        bot.hasSpike = true;
        bomb.giveTo(bot);
      }
    }
    weapons.stepGrenades(dt, world.colliders, (pos) => explodeAt(pos));
    checkRoundEnd();
  } else if (m.phase === 'end') {
    m.phaseLeft -= dt;
    if (m.phaseLeft <= 0) {
      if (m.matchWinner) {
        hud.showOverlay('start');
      } else {
        match.nextRound();
        startRound();
      }
    }
  }
  weapons.step(dt);
  effects.step(dt);
  trauma = Math.max(0, trauma - dt * 1.6);
  syncPlayerHitMeshes();
}

function updateHud() {
  const m = match.match;
  hud.setHealth(body.health, body.armor);
  const def = weapons.currentDef();
  hud.setAmmo(weapons.ammo[def.id].mag, weapons.ammo[def.id].reserve, def.name, weapons.state.grenades);
  hud.setMoney(m.money);
  hud.setScore(m.wins.vanguard, m.wins.sentinel, m.round);
  hud.setAlive((playerAlive ? 1 : 0) + bots.aliveCount('vanguard'), bots.aliveCount('sentinel'));
  if (m.phase === 'live' && bomb.bomb.phase === 'planted') {
    hud.setTimer(bomb.bomb.fuseLeft, 'live');
  } else {
    hud.setTimer(m.phaseLeft, m.phase);
  }
  hud.setCrosshairGap(6 + weapons.spread(player.groundSpeed()) * 900);
  if (m.phase === 'live' && bomb.bomb.phase === 'planted') {
    hud.setBombStatus(`SPIKE PLANTED — ${Math.ceil(bomb.bomb.fuseLeft)}s`, true);
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen && !paused) {
    const look = input.takeLook();
    if (!spectating) player.look(look.x, look.y);
    handleActions();
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    updateHud();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(clamp(dy / length, -1, 1));
  syncCamera();
}

function placeBot(team, index, x, z, yaw) {
  const bot = bots.bots.find((b) => b.team === team && b.id === `${team}-${index}`);
  if (!bot) return null;
  bot.position.set(x, 0, z);
  bot.velocity.set(0, 0, 0);
  bot.yaw = yaw;
  bot.target = null;
  bot.state = 'hold';
  bot.holdUntil = 99999;
  bot.holdYaw = yaw;
  bot.path = [];
  return bot;
}

function runShot(name) {
  hud.hideOverlay();
  hud.showBuy(false);
  hud.hideBanner();
  match.match.phase = 'live';
  match.match.phaseLeft = ROUND_SECONDS;
  bots.assignRound(random, null);
  weapons.refillAmmo();
  bomb.reset();

  if (name === 'start') {
    body.position.set(0, 0, 15.5);
    body.yaw = 0.32;
    body.pitch = -0.01;
    weapons.switchTo('pistol');
    match.match.money = 800;
    placeBot('sentinel', 0, 0, -3, Math.PI);
    placeBot('sentinel', 1, 7, -5, Math.PI * 0.9);
    placeBot('vanguard', 0, -3.5, 11, 0);
    placeBot('vanguard', 1, 3.5, 11.5, 0);
    settle(20);
  } else if (name === 'play') {
    // Round 2 on the Dock lane: the rifle was bought from round 1's winnings
    // ($800 + $325 win + $300 kill), and one headshot drops a Sentinel mid-lane.
    match.match.wins.vanguard = 1;
    match.match.round = 2;
    match.match.money = 1425;
    const price = weapons.buy('rifle', match.match.money);
    if (price > 0) match.match.money -= price;
    weapons.switchTo('rifle');
    body.position.set(-15.5, 0, 6);
    body.yaw = 0;
    body.pitch = 0;
    const foe = placeBot('sentinel', 0, -15.5, -6, Math.PI);
    placeBot('sentinel', 1, -13, -8, Math.PI * 0.8);
    placeBot('vanguard', 0, -11, -1, 0);
    settle(30);
    if (foe) {
      aimAt(tmp.set(foe.position.x, foe.position.y + 1.62, foe.position.z));
      shoot(0);
      settle(1);
    }
  } else {
    // end: the spike just blew at Crane, the round is won, the banner is up.
    body.position.set(2, 0, -4);
    body.yaw = 0.6;
    body.pitch = 0.02;
    weapons.switchTo('rifle');
    match.match.wins.vanguard = 0;
    match.match.round = 1;
    bomb.plant(MAP.sites.A.x, MAP.sites.A.z, elapsed);
    bomb.bomb.fuseLeft = 0.5;
    const foe = placeBot('sentinel', 0, -11, -9, Math.PI * 0.5);
    if (foe) {
      foe.alive = false;
      foe.fall = 1;
      foe.body.rotation.x = -1.5;
      foe.body.position.y = -0.1;
    }
    placeBot('vanguard', 0, -6, -6, 0.5);
    effects.explode(tmp.set(MAP.sites.A.x, 0.6, MAP.sites.A.z));
    settle(30);
    endRound('vanguard', 'Spike detonated at Crane');
    match.match.phase = 'end';
    match.match.phaseLeft = END_SECONDS;
  }
  hud.setScore(match.match.wins.vanguard, match.match.wins.sentinel, match.match.round);
  hud.setMoney(match.match.money);
  hud.setHealth(body.health, body.armor);
  updateHud();
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Read-only handle for automated checks: the live numbers, no gameplay effect.
window.__harbor = {
  get phase() { return match.match.phase; },
  get phaseLeft() { return match.match.phaseLeft; },
  get money() { return match.match.money; },
  get round() { return match.match.round; },
  get wins() { return match.match.wins; },
  get player() { return { x: body.position.x, z: body.position.z, health: body.health, alive: playerAlive }; },
  get botsAlive() { return { vanguard: bots.aliveCount('vanguard'), sentinel: bots.aliveCount('sentinel') }; },
  get bots() { return bots.bots.map((b) => ({ id: b.id, x: +b.position.x.toFixed(1), z: +b.position.z.toFixed(1), hp: Math.round(b.health), alive: b.alive, state: b.state, target: b.target ? b.target.kind : null })); },
  get botShots() { return botShots; },
  get bomb() { return bomb.bomb.phase; },
  get grenades() { return weapons.state.grenades; },
};

startRound();
syncCamera();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
