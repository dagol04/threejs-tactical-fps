// Weapons: three invented guns and a frag grenade, each with its own numbers, view
// model and feel. The module owns magazines, reloads, switching and the grenade's
// flight; main.js owns the ray and the damage. Spread grows with movement speed, so
// stopping to aim pays, and every gun runs dry.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'Kestrel P-12', kind: 'pistol', price: 0,
    damage: 26, headMult: 2.5, magSize: 12, reserve: 48,
    fireGap: 0.17, reloadTime: 1.4, auto: false,
    spreadStill: 0.003, spreadMoving: 0.03, range: 60,
  },
  rifle: {
    id: 'rifle', name: 'VK-9 Prowler', kind: 'rifle', price: 1000,
    damage: 34, headMult: 3, magSize: 30, reserve: 90,
    fireGap: 0.095, reloadTime: 2.0, auto: true,
    spreadStill: 0.0022, spreadMoving: 0.028, range: 90,
  },
  smg: {
    id: 'smg', name: 'Dusk-9', kind: 'smg', price: 550,
    damage: 22, headMult: 3, magSize: 28, reserve: 112,
    fireGap: 0.07, reloadTime: 1.7, auto: true,
    spreadStill: 0.004, spreadMoving: 0.032, range: 45,
  },
};

export const GRENADE_PRICE = 150;
export const ARMOR_PRICE = 300;

const SWITCH_TIME = 0.45;

export function createWeapons(camera, audio) {
  // Gunmetal body, dark grip, teal accent: the gun has to read against a dark
  // dusk scene, so the body is a mid grey rather than near-black.
  const gripMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#2a2f36'), roughness: 0.7, metalness: 0.2 });
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#7d838a'), roughness: 0.45, metalness: 0.5 });
  const accentMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.2 });

  function buildModel(kind) {
    const model = new THREE.Group();
    if (kind === 'rifle') {
      const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.42), bodyMat);
      const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.42), gripMat);
      barrel.position.set(0, 0.025, -0.4);
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), gripMat);
      stock.position.set(0, -0.02, 0.3);
      const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.08), accentMat);
      sight.position.set(0, 0.08, -0.1);
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.1), gripMat);
      mag.position.set(0, -0.12, 0.02);
      model.add(receiver, barrel, stock, sight, mag);
    } else if (kind === 'smg') {
      const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.11, 0.3), bodyMat);
      const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.26), gripMat);
      barrel.position.set(0, 0.02, -0.26);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.07), gripMat);
      grip.position.set(0, -0.11, 0.14);
      const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.06), accentMat);
      sight.position.set(0, 0.075, -0.05);
      model.add(receiver, barrel, grip, sight);
    } else {
      const slide = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.26), bodyMat);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.13, 0.08), gripMat);
      grip.position.set(0, -0.09, 0.08);
      grip.rotation.x = 0.25;
      const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.04), accentMat);
      sight.position.set(0, 0.045, -0.08);
      model.add(slide, grip, sight);
    }
    model.position.set(0.19, -0.14, -0.38);
    // The pistol is a small gun: scale it up so it reads as clearly as the rifle.
    model.scale.setScalar(kind === 'pistol' ? 1.15 : 0.8);
    model.visible = false;
    camera.add(model);
    return model;
  }

  const models = { rifle: buildModel('rifle'), smg: buildModel('smg'), pistol: buildModel('pistol') };
  models.pistol.visible = true;

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.14, 0.14),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.gold), transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.19, -0.16, -0.9);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.gold), 0, 6);
  flashLight.position.set(0.19, -0.14, -0.55);
  camera.add(flashLight);

  const grenadeGeo = new THREE.SphereGeometry(0.09, 10, 8);
  const grenadeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.rust), roughness: 0.6, metalness: 0.3 });

  const ammo = {};
  for (const def of Object.values(WEAPONS)) ammo[def.id] = { mag: def.magSize, reserve: def.reserve };
  const state = {
    current: 'pistol',
    owned: new Set(['pistol']),
    grenades: 0,
    cooldown: 0,
    reloadLeft: 0,
    switchLeft: 0,
    flash: 0,
    kick: 0,
    triggerHeld: false,
  };
  const grenades = [];

  function currentDef() {
    return WEAPONS[state.current];
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[state.current];
    model.position.z = -0.38 + state.kick;
    model.rotation.x = state.kick * 2.2;
    if (state.switchLeft > 0) {
      state.switchLeft = Math.max(0, state.switchLeft - dt);
      model.position.y = -0.14 - Math.sin((state.switchLeft / SWITCH_TIME) * Math.PI) * 0.12;
    } else {
      model.position.y = -0.14;
    }
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, ((currentDef().reloadTime - state.reloadLeft) / currentDef().reloadTime) * 2);
      if (state.reloadLeft === 0) {
        const def = currentDef();
        const need = def.magSize - ammo[def.id].mag;
        const take = Math.min(need, ammo[def.id].reserve);
        ammo[def.id].mag += take;
        ammo[def.id].reserve -= take;
      }
    } else {
      model.rotation.x = state.kick * 2.2;
    }
  }

  return {
    state,
    ammo,
    defs: WEAPONS,
    currentDef,
    step,
    ready() {
      const def = currentDef();
      return ammo[def.id].mag > 0 && state.cooldown === 0 && state.reloadLeft === 0 && state.switchLeft === 0;
    },
    // Returns the fired weapon def, or null when no round left the barrel.
    tryFire() {
      const def = currentDef();
      if (ammo[def.id].mag <= 0 || state.cooldown > 0 || state.reloadLeft > 0 || state.switchLeft > 0) return null;
      ammo[def.id].mag -= 1;
      state.cooldown = def.fireGap;
      state.flash = 0.06;
      state.kick = 0.055;
      audio.shot(def.kind);
      return def;
    },
    reload() {
      const def = currentDef();
      if (state.reloadLeft > 0 || ammo[def.id].mag === def.magSize || ammo[def.id].reserve === 0) return false;
      state.reloadLeft = def.reloadTime;
      audio.reload();
      return true;
    },
    switchTo(id) {
      if (!state.owned.has(id) || id === state.current || state.reloadLeft > 0) return false;
      models[state.current].visible = false;
      state.current = id;
      models[id].visible = true;
      state.switchLeft = SWITCH_TIME;
      state.cooldown = Math.max(state.cooldown, SWITCH_TIME * 0.6);
      return true;
    },
    buy(id, money) {
      const def = WEAPONS[id];
      if (!def || state.owned.has(id) || money < def.price) return -1;
      state.owned.add(id);
      ammo[id] = { mag: def.magSize, reserve: def.reserve };
      return def.price;
    },
    refillAmmo() {
      for (const def of Object.values(WEAPONS)) {
        if (state.owned.has(def.id)) ammo[def.id] = { mag: def.magSize, reserve: def.reserve };
      }
    },
    spread(speed) {
      const def = currentDef();
      return def.spreadStill + Math.min(1, speed / 5.4) * def.spreadMoving;
    },
    muzzleWorld(out) {
      out.set(0.19, -0.16, -0.9);
      return camera.localToWorld(out);
    },
    throwGrenade(origin, direction) {
      if (state.grenades <= 0) return false;
      state.grenades -= 1;
      const mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
      mesh.position.copy(origin);
      mesh.castShadow = true;
      camera.parent.add(mesh);
      grenades.push({
        mesh,
        velocity: direction.clone().multiplyScalar(16).add(new THREE.Vector3(0, 4.5, 0)),
        fuse: 1.6,
        bounced: false,
      });
      return true;
    },
    // Grenade flight: gravity, one floor bounce, then the fuse ends in an explosion.
    // onExplode(position) is called by main.js, which owns the damage.
    stepGrenades(dt, colliders, onExplode) {
      for (let i = grenades.length - 1; i >= 0; i -= 1) {
        const g = grenades[i];
        g.fuse -= dt;
        g.velocity.y -= 18 * dt;
        g.mesh.position.addScaledVector(g.velocity, dt);
        if (g.mesh.position.y < 0.09) {
          g.mesh.position.y = 0.09;
          if (!g.bounced) {
            g.velocity.y = Math.abs(g.velocity.y) * 0.45;
            g.velocity.x *= 0.6;
            g.velocity.z *= 0.6;
            g.bounced = true;
          } else {
            g.velocity.y = 0;
            g.velocity.x *= 0.8;
            g.velocity.z *= 0.8;
          }
        }
        if (g.fuse <= 0) {
          const pos = g.mesh.position.clone();
          camera.parent.remove(g.mesh);
          grenades.splice(i, 1);
          onExplode(pos);
        }
      }
    },
    clearGrenades() {
      for (const g of grenades) camera.parent.remove(g.mesh);
      grenades.length = 0;
    },
  };
}
