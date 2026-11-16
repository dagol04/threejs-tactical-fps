// The spike: carried, planted, defused or detonated. Planting takes 3 seconds on a
// site, defusing 5 seconds beside a planted spike, and a planted spike blows after
// 40 seconds. The mesh is a small box with a blinking lamp; it rides on its
// carrier's back, sits on the ground when dropped, and stays where it was planted.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const PLANT_TIME = 3;
export const DEFUSE_TIME = 5;
export const FUSE_TIME = 40;

export function createBomb(scene) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.2, 0.24),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.danger), roughness: 0.5, metalness: 0.3 }),
  );
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 8, 6),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.gold) }),
  );
  lamp.position.set(0, 0.13, 0);
  group.add(body, lamp);
  group.visible = false;
  scene.add(group);

  const bomb = {
    phase: 'idle',
    position: new THREE.Vector3(),
    plantedAt: 0,
    fuseLeft: FUSE_TIME,
    beepAt: 0,
    carrier: null,
    mesh: group,
    lamp,
  };

  return {
    bomb,
    reset() {
      bomb.phase = 'idle';
      bomb.fuseLeft = FUSE_TIME;
      bomb.carrier = null;
      group.visible = false;
      group.position.set(0, -10, 0);
    },
    giveTo(carrier) {
      bomb.carrier = carrier;
      bomb.phase = 'carried';
      group.visible = true;
    },
    dropAt(x, z) {
      bomb.carrier = null;
      bomb.phase = 'dropped';
      bomb.position.set(x, 0.12, z);
      group.visible = true;
      group.position.copy(bomb.position);
    },
    plant(x, z, time) {
      bomb.phase = 'planted';
      bomb.carrier = null;
      bomb.position.set(x, 0.12, z);
      bomb.plantedAt = time;
      bomb.fuseLeft = FUSE_TIME;
      group.visible = true;
      group.position.copy(bomb.position);
    },
    defuse() {
      bomb.phase = 'defused';
      group.visible = false;
    },
    detonate() {
      bomb.phase = 'detonated';
      group.visible = false;
    },
    // Follows the carrier, blinks faster as the fuse runs down, returns true on blow.
    step(dt, time, onBeep) {
      if (bomb.phase === 'carried' && bomb.carrier) {
        const c = bomb.carrier;
        const p = c.position || c.state?.position;
        if (p) {
          group.position.set(p.x, (p.y || 0) + 1.35, p.z);
        }
      }
      if (bomb.phase === 'planted') {
        bomb.fuseLeft -= dt;
        const interval = bomb.fuseLeft > 20 ? 1 : bomb.fuseLeft > 10 ? 0.5 : 0.25;
        if (time >= bomb.beepAt) {
          bomb.beepAt = time + interval;
          onBeep(bomb.fuseLeft);
        }
        lamp.visible = Math.floor(time * 4) % 2 === 0;
        if (bomb.fuseLeft <= 0) return true;
      }
      return false;
    },
  };
}
