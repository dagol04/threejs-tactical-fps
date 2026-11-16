// Bots: both teams' AI. Each bot is a body with a weapon, a waypoint route and a
// small state machine: route to a site or a hold, scan, engage what it sees, react
// to what it hears, plant the spike or defuse it. Perception is staggered so eight
// bots never raycast on the same frame; shooting is a real ray with spread, so a
// bot that fires on the move misses more, exactly like the player.
import * as THREE from 'three';
import { MAP, findPath, nearestWaypoint } from './world.js';
import { TEAMS } from './palette.js';
import { angleDelta, clamp } from './util.js';

const BOT_RADIUS = 0.34;
const BOT_HEIGHT = 1.72;
const BOT_SPEED = 4.2;
const BOT_ACCEL = 30;
const BOT_HEALTH = 100;
const PERCEIVE_EVERY = 0.3;
const HEAR_RADIUS = 28;
const REACT_MIN = 0.38;
const REACT_MAX = 0.75;
const BURST_MIN = 3;
const BURST_MAX = 5;
const BURST_GAP = 0.115;
const BURST_PAUSE = 0.7;
const PLANT_TIME = 3;
const DEFUSE_TIME = 5;

const NAMES = {
  vanguard: ['Vex', 'Hale', 'Mira'],
  sentinel: ['Onyx', 'Rook', 'Fable', 'Sable', 'Juno'],
};

const BOT_WEAPONS = {
  rifle: { damage: 30, headMult: 2.5, range: 80 },
  smg: { damage: 20, headMult: 2.5, range: 40 },
};

export function createBots(scene, world, random, cb) {
  const bots = [];
  const raycaster = new THREE.Raycaster();
  raycaster.far = 90;
  const tmpDir = new THREE.Vector3();
  const tmpPos = new THREE.Vector3();
  const tmpTarget = new THREE.Vector3();

  const torsoGeo = new THREE.BoxGeometry(0.52, 0.72, 0.3);
  const headGeo = new THREE.SphereGeometry(0.16, 14, 10);
  const legGeo = new THREE.BoxGeometry(0.2, 0.72, 0.22);
  const gunGeo = new THREE.BoxGeometry(0.08, 0.1, 0.55);
  const visorGeo = new THREE.BoxGeometry(0.3, 0.07, 0.05);
  const flashGeo = new THREE.PlaneGeometry(0.22, 0.22);

  function buildBody(team) {
    const teamColor = new THREE.Color(TEAMS[team].color);
    const dark = new THREE.Color(TEAMS[team].dark);
    const bodyMat = new THREE.MeshStandardMaterial({ color: dark, roughness: 0.7, metalness: 0.1 });
    const headMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c8b49a'), roughness: 0.8 });
    const visorMat = new THREE.MeshBasicMaterial({ color: teamColor });
    const gunMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#20242a'), roughness: 0.5, metalness: 0.4 });
    const group = new THREE.Group();
    const torso = new THREE.Mesh(torsoGeo, bodyMat);
    torso.position.y = 1.08;
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.62;
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 1.64, 0.14);
    const legL = new THREE.Mesh(legGeo, bodyMat);
    legL.position.set(-0.14, 0.36, 0);
    const legR = new THREE.Mesh(legGeo, bodyMat);
    legR.position.set(0.14, 0.36, 0);
    const gun = new THREE.Mesh(gunGeo, gunMat);
    gun.position.set(0.2, 1.15, -0.25);
    const flash = new THREE.Mesh(flashGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color('#f0a830'), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
    flash.position.set(0.2, 1.15, -0.6);
    flash.visible = false;
    group.add(torso, head, visor, legL, legR, gun, flash);
    group.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    return { group, torso, head, gun, flash };
  }

  function makeBot(team, index, name) {
    const body = buildBody(team);
    scene.add(body.group);
    const bot = {
      id: `${team}-${index}`,
      name,
      team,
      body: body.group,
      torso: body.torso,
      head: body.head,
      gun: body.gun,
      flash: body.flash,
      position: body.group.position,
      velocity: new THREE.Vector3(),
      yaw: 0,
      health: BOT_HEALTH,
      alive: true,
      weapon: random() < 0.6 ? 'rifle' : 'smg',
      state: 'route',
      path: [],
      pathIndex: 0,
      holdUntil: 0,
      holdYaw: 0,
      target: null,
      targetId: null,
      targetPos: new THREE.Vector3(),
      perceiveAt: random() * PERCEIVE_EVERY,
      reactAt: 0,
      burstLeft: 0,
      burstAt: 0,
      channel: null,
      channelLeft: 0,
      investigatePos: null,
      fall: 0,
      flashLeft: 0,
      walkPhase: 0,
      hasSpike: false,
    };
    body.torso.userData.bot = bot;
    body.torso.userData.part = 'torso';
    body.head.userData.bot = bot;
    body.head.userData.part = 'head';
    bots.push(bot);
    return bot;
  }

  for (let i = 0; i < NAMES.vanguard.length; i += 1) makeBot('vanguard', i, NAMES.vanguard[i]);
  for (let i = 0; i < NAMES.sentinel.length; i += 1) makeBot('sentinel', i, NAMES.sentinel[i]);

  const hitMeshes = [];
  for (const bot of bots) hitMeshes.push(bot.torso, bot.head);

  const probe = new THREE.Box3();
  function overlaps(x, y, z, height, lift) {
    probe.min.set(x - BOT_RADIUS, y + lift, z - BOT_RADIUS);
    probe.max.set(x + BOT_RADIUS, y + height - lift, z + BOT_RADIUS);
    for (const collider of world.colliders) if (probe.intersectsBox(collider)) return true;
    return false;
  }

  function moveToward(bot, tx, tz, dt, speed) {
    const dx = tx - bot.position.x;
    const dz = tz - bot.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return true;
    const wishX = (dx / dist) * speed;
    const wishZ = (dz / dist) * speed;
    const blend = Math.min(1, BOT_ACCEL * dt / speed);
    bot.velocity.x += (wishX - bot.velocity.x) * blend;
    bot.velocity.z += (wishZ - bot.velocity.z) * blend;
    const targetYaw = Math.atan2(-dx, -dz);
    bot.yaw += angleDelta(bot.yaw, targetYaw) * Math.min(1, dt * 8);
    const nextX = bot.position.x + bot.velocity.x * dt;
    if (!overlaps(nextX, bot.position.y, bot.position.z, BOT_HEIGHT, 0.04)) bot.position.x = nextX;
    else bot.velocity.x = 0;
    const nextZ = bot.position.z + bot.velocity.z * dt;
    if (!overlaps(bot.position.x, bot.position.y, nextZ, BOT_HEIGHT, 0.04)) bot.position.z = nextZ;
    else bot.velocity.z = 0;
    bot.walkPhase += dt * Math.hypot(bot.velocity.x, bot.velocity.z) * 2.2;
    return dist < 0.7;
  }

  function stopMoving(bot, dt) {
    const damp = Math.max(0, 1 - 9 * dt);
    bot.velocity.x *= damp;
    bot.velocity.z *= damp;
    bot.position.x += bot.velocity.x * dt;
    bot.position.z += bot.velocity.z * dt;
  }

  function eyePos(bot, out) {
    return out.set(bot.position.x, bot.position.y + 1.55, bot.position.z);
  }

  function hasLineOfSight(from, to) {
    tmpDir.subVectors(to, from);
    const dist = tmpDir.length();
    if (dist < 0.01) return true;
    tmpDir.divideScalar(dist);
    raycaster.set(from, tmpDir);
    raycaster.far = dist;
    return raycaster.intersectObjects(world.shootables, false).length === 0;
  }

  function perceive(bot, time, player, playerAlive) {
    bot.perceiveAt = time + PERCEIVE_EVERY;
    let best = null;
    let bestDist = Infinity;
    const eye = eyePos(bot, tmpPos);
    const candidates = [];
    // The player is Vanguard: only Sentinel bots may see them as a target.
    if (playerAlive && bot.team === 'sentinel') candidates.push({ kind: 'player', pos: player.state.position, eyeY: 1.5, dist: 0 });
    for (const other of bots) {
      if (other === bot || !other.alive || other.team === bot.team) continue;
      candidates.push({ kind: 'bot', bot: other, pos: other.position, eyeY: 1.5, dist: 0 });
    }
    for (const c of candidates) {
      const dx = c.pos.x - bot.position.x;
      const dz = c.pos.z - bot.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 48) continue;
      const angle = Math.atan2(-dx, -dz);
      if (Math.abs(angleDelta(bot.yaw, angle)) > 1.15 && dist > 4) continue;
      tmpTarget.set(c.pos.x, c.pos.y + c.eyeY, c.pos.z);
      if (!hasLineOfSight(eye, tmpTarget)) continue;
      if (dist < bestDist) {
        bestDist = dist;
        best = c;
      }
    }
    if (best) {
      // A candidate is a fresh object every perceive, so compare the stable
      // identity underneath it: re-aiming at the same enemy must not restart
      // the reaction timer, or the bot would never get to shoot.
      const bestId = best.kind === 'player' ? 'player' : best.bot;
      if (bot.targetId !== bestId) {
        bot.targetId = bestId;
        bot.target = best;
        bot.reactAt = time + REACT_MIN + random() * (REACT_MAX - REACT_MIN);
        bot.burstLeft = 0;
      }
      bot.target = best;
      bot.targetPos.set(best.pos.x, best.pos.y + 1.2, best.pos.z);
    } else {
      bot.target = null;
      bot.targetId = null;
    }
  }

  function shootAt(bot, time, player) {
    if (time < bot.reactAt) return;
    if (bot.burstLeft <= 0) {
      if (time < bot.burstAt) return;
      bot.burstLeft = BURST_MIN + Math.floor(random() * (BURST_MAX - BURST_MIN + 1));
      bot.burstAt = time + BURST_PAUSE;
    }
    if (time < bot.burstAt - BURST_PAUSE + (BURST_MIN + BURST_MAX - bot.burstLeft) * BURST_GAP) return;
    bot.burstLeft -= 1;
    bot.burstAt = time + BURST_GAP;
    const def = BOT_WEAPONS[bot.weapon];
    const eye = eyePos(bot, tmpPos);
    tmpDir.subVectors(bot.targetPos, eye);
    const dist = tmpDir.length();
    tmpDir.divideScalar(dist || 1);
    const targetSpeed = bot.target.kind === 'player' ? Math.hypot(player.state.velocity.x, player.state.velocity.z) : Math.hypot(bot.target.bot.velocity.x, bot.target.bot.velocity.z);
    const ownSpeed = Math.hypot(bot.velocity.x, bot.velocity.z);
    const spread = 0.014 + dist * 0.0009 + targetSpeed * 0.004 + ownSpeed * 0.006;
    tmpDir.x += (random() * 2 - 1) * spread;
    tmpDir.y += (random() * 2 - 1) * spread;
    tmpDir.z += (random() * 2 - 1) * spread;
    tmpDir.normalize();
    bot.flash.visible = true;
    bot.flashLeft = 0.06;
    cb.noise(bot.position, 24);
    cb.onBotShot(bot, dist);
    raycaster.set(eye, tmpDir);
    raycaster.far = def.range;
    const targets = world.shootables
      .concat(hitMeshes.filter((mesh) => mesh.userData.bot !== bot))
      .concat(cb.playerHitMeshes());
    const hit = raycaster.intersectObjects(targets, false)[0];
    const end = hit ? hit.point : tmpTarget.copy(eye).addScaledVector(tmpDir, def.range);
    cb.tracer(eye, end);
    if (!hit) return;
    const obj = hit.object;
    if (obj.userData.player) {
      const amount = obj.userData.part === 'head' ? def.damage * def.headMult : def.damage;
      cb.damagePlayer(amount, bot);
    } else if (obj.userData.bot && obj.userData.bot !== bot && obj.userData.bot.alive) {
      const amount = obj.userData.part === 'head' ? def.damage * def.headMult : def.damage;
      cb.damageBot(obj.userData.bot, amount, obj.userData.part, bot);
    }
  }

  function routeTo(bot, waypointIndex) {
    const from = nearestWaypoint(bot.position.x, bot.position.z);
    bot.path = findPath(from, waypointIndex);
    bot.pathIndex = 1;
    bot.state = 'route';
  }

  function assignRound(random, spikeCarrier) {
    for (const bot of bots) {
      bot.health = BOT_HEALTH;
      bot.alive = true;
      bot.fall = 0;
      bot.body.rotation.set(0, 0, 0);
      bot.body.visible = true;
      bot.target = null;
      bot.targetId = null;
      bot.channel = null;
      bot.investigatePos = null;
      bot.hasSpike = bot === spikeCarrier;
      const spawns = MAP.spawns[bot.team];
      const spawn = spawns[bots.filter((b) => b.team === bot.team).indexOf(bot) % spawns.length];
      bot.position.set(spawn[0], 0, spawn[1]);
      bot.velocity.set(0, 0, 0);
      bot.yaw = bot.team === 'vanguard' ? Math.PI : 0;
      if (bot.team === 'vanguard') {
        const site = random() < 0.5 ? 'A' : 'B';
        bot.assignedSite = site;
        routeTo(bot, MAP.sites[site].waypoint);
      } else {
        const holds = bot.id.endsWith('0') ? 12 : bot.id.endsWith('1') ? 14 : bot.id.endsWith('2') ? 5 : bot.id.endsWith('3') ? 17 : 18;
        bot.assignedSite = null;
        routeTo(bot, holds);
      }
    }
  }

  function step(dt, time, player, playerAlive, bomb) {
    for (const bot of bots) {
      if (!bot.alive) {
        bot.fall = Math.min(1, bot.fall + dt / 0.45);
        bot.body.rotation.x = -bot.fall * 1.5;
        bot.body.position.y = -bot.fall * 0.1;
        continue;
      }
      bot.flashLeft = Math.max(0, bot.flashLeft - dt);
      bot.flash.visible = bot.flashLeft > 0;
      bot.body.rotation.y = bot.yaw;
      bot.body.position.y = 0;

      if (time >= bot.perceiveAt) perceive(bot, time, player, playerAlive);

      // A channel (plant/defuse) pins the bot in place until it finishes or breaks.
      if (bot.channel) {
        stopMoving(bot, dt);
        bot.channelLeft -= dt;
        if (bot.channelLeft <= 0) {
          cb.channelDone(bot, bot.channel);
          bot.channel = null;
        }
        continue;
      }

      if (bot.target) {
        const dx = bot.targetPos.x - bot.position.x;
        const dz = bot.targetPos.z - bot.position.z;
        bot.yaw += angleDelta(bot.yaw, Math.atan2(-dx, -dz)) * Math.min(1, dt * 10);
        stopMoving(bot, dt);
        shootAt(bot, time, player);
        continue;
      }

      if (bot.investigatePos) {
        const arrived = moveToward(bot, bot.investigatePos.x, bot.investigatePos.z, dt, BOT_SPEED);
        if (arrived) {
          bot.investigatePos = null;
          bot.holdUntil = time + 3;
          bot.state = 'hold';
        }
        continue;
      }

      if (bot.state === 'route') {
        if (bot.pathIndex >= bot.path.length) {
          bot.state = 'hold';
          bot.holdUntil = time + 999;
          bot.holdYaw = bot.yaw;
          continue;
        }
        const node = MAP.waypoints[bot.path[bot.pathIndex]];
        const arrived = moveToward(bot, node[0], node[1], dt, BOT_SPEED);
        if (arrived) bot.pathIndex += 1;
        continue;
      }

      // Hold: scan the lane, and act on the objective when the moment comes.
      if (bot.state === 'hold') {
        stopMoving(bot, dt);
        bot.yaw = bot.holdYaw + Math.sin(time * 0.5 + bot.id.charCodeAt(0)) * 0.9;
        if (bot.team === 'vanguard' && bot.hasSpike && bomb.phase !== 'planted') {
          const site = MAP.sites[bot.assignedSite];
          const d = Math.hypot(site.x - bot.position.x, site.z - bot.position.z);
          if (d < 2.5) {
            bot.channel = 'plant';
            bot.channelLeft = PLANT_TIME;
            cb.channelStart(bot, 'plant');
          }
        }
        if (bot.team === 'sentinel' && bomb.phase === 'planted') {
          const d = Math.hypot(bomb.position.x - bot.position.x, bomb.position.z - bot.position.z);
          if (d < 2) {
            bot.channel = 'defuse';
            bot.channelLeft = DEFUSE_TIME;
            cb.channelStart(bot, 'defuse');
          }
        }
      }
    }
  }

  function hearNoise(position, radius) {
    for (const bot of bots) {
      if (!bot.alive || bot.target || bot.channel) continue;
      const d = Math.hypot(position.x - bot.position.x, position.z - bot.position.z);
      if (d < radius && bot.state !== 'route') {
        bot.investigatePos = { x: position.x, z: position.z };
        bot.state = 'investigate';
      } else if (d < radius * 0.6 && bot.state === 'hold') {
        bot.investigatePos = { x: position.x, z: position.z };
        bot.state = 'investigate';
      }
    }
  }

  function aliveCount(team) {
    return bots.filter((b) => b.team === team && b.alive).length;
  }

  return {
    bots,
    hitMeshes,
    assignRound,
    step,
    hearNoise,
    aliveCount,
    routeTo,
    nearestBot(team, x, z) {
      let best = null;
      let bestD = Infinity;
      for (const bot of bots) {
        if (bot.team !== team || !bot.alive) continue;
        const d = (bot.position.x - x) ** 2 + (bot.position.z - z) ** 2;
        if (d < bestD) {
          bestD = d;
          best = bot;
        }
      }
      return best;
    },
  };
}
