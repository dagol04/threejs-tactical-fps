// Transient combat effects, all pooled so the hot loop allocates nothing: tracer
// lines from muzzle to hit, hit sparks that burst and fall, and the explosion's
// flash sphere, smoke and light. Each effect is a mesh reused from a small pool.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACER_POOL = 24;
const TRACER_LIFE = 0.07;
const SPARK_POOL = 40;
const SPARK_LIFE = 0.35;

export function createEffects(scene) {
  const tracerMat = new THREE.LineBasicMaterial({ color: new THREE.Color('#ffd9a0'), transparent: true, opacity: 0.9 });
  const tracers = [];
  for (let i = 0; i < TRACER_POOL; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, tracerMat);
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerIndex = 0;

  const sparkGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
  const sparkMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.gold) });
  const sparks = [];
  for (let i = 0; i < SPARK_POOL; i += 1) {
    const mesh = new THREE.Mesh(sparkGeo, sparkMat);
    mesh.visible = false;
    scene.add(mesh);
    sparks.push({ mesh, velocity: new THREE.Vector3(), life: 0 });
  }
  let sparkIndex = 0;

  const boomGeo = new THREE.SphereGeometry(1, 20, 14);
  const boomMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff9a3c'), transparent: true, opacity: 0.85, depthWrite: false });
  const boom = new THREE.Mesh(boomGeo, boomMat);
  boom.visible = false;
  scene.add(boom);
  const boomLight = new THREE.PointLight(new THREE.Color('#ff9a3c'), 0, 26, 1.4);
  scene.add(boomLight);
  const smokeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#5a5f66'), transparent: true, opacity: 0.5, roughness: 1 });
  const smokeGeo = new THREE.SphereGeometry(1, 12, 8);
  const smokes = [];
  for (let i = 0; i < 5; i += 1) {
    const mesh = new THREE.Mesh(smokeGeo, smokeMat);
    mesh.visible = false;
    scene.add(mesh);
    smokes.push({ mesh, life: 0, velocity: new THREE.Vector3() });
  }
  let boomLife = 0;
  let boomPos = new THREE.Vector3();

  return {
    tracer(from, to) {
      const slot = tracers[tracerIndex];
      tracerIndex = (tracerIndex + 1) % TRACER_POOL;
      const attr = slot.line.geometry.getAttribute('position');
      attr.setXYZ(0, from.x, from.y, from.z);
      attr.setXYZ(1, to.x, to.y, to.z);
      attr.needsUpdate = true;
      slot.line.visible = true;
      slot.life = TRACER_LIFE;
    },
    sparksAt(position, count = 6) {
      for (let i = 0; i < count; i += 1) {
        const slot = sparks[sparkIndex];
        sparkIndex = (sparkIndex + 1) % SPARK_POOL;
        slot.mesh.position.copy(position);
        slot.mesh.visible = true;
        slot.velocity.set((Math.random() - 0.5) * 4, Math.random() * 3 + 1, (Math.random() - 0.5) * 4);
        slot.life = SPARK_LIFE;
      }
    },
    explode(position) {
      boomPos.copy(position);
      boom.position.copy(position);
      boom.scale.setScalar(0.5);
      boom.visible = true;
      boomLight.position.copy(position);
      boomLight.position.y += 1;
      boomLife = 0.7;
      for (let i = 0; i < smokes.length; i += 1) {
        const s = smokes[i];
        s.mesh.position.set(position.x + (Math.random() - 0.5) * 2, 0.8 + Math.random() * 1.5, position.z + (Math.random() - 0.5) * 2);
        s.mesh.scale.setScalar(0.8 + Math.random() * 0.8);
        s.mesh.visible = true;
        s.velocity.set((Math.random() - 0.5) * 0.6, 0.8 + Math.random() * 0.6, (Math.random() - 0.5) * 0.6);
        s.life = 2.2;
      }
    },
    step(dt) {
      for (const slot of tracers) {
        if (slot.life <= 0) continue;
        slot.life -= dt;
        if (slot.life <= 0) slot.line.visible = false;
      }
      for (const slot of sparks) {
        if (slot.life <= 0) continue;
        slot.life -= dt;
        slot.velocity.y -= 9 * dt;
        slot.mesh.position.addScaledVector(slot.velocity, dt);
        if (slot.life <= 0 || slot.mesh.position.y < 0.03) slot.mesh.visible = false;
      }
      if (boomLife > 0) {
        boomLife -= dt;
        const t = 1 - boomLife / 0.7;
        boom.scale.setScalar(0.5 + t * 4);
        boomMat.opacity = Math.max(0, 0.7 * (1 - t));
        boomLight.intensity = Math.max(0, 160 * (1 - t));
        if (boomLife <= 0) {
          boom.visible = false;
          boomLight.intensity = 0;
        }
      }
      for (const s of smokes) {
        if (s.life <= 0) continue;
        s.life -= dt;
        s.mesh.position.addScaledVector(s.velocity, dt);
        s.mesh.scale.addScalar(dt * 0.9);
        smokeMat.opacity = Math.max(0, 0.5 * (s.life / 2.2));
        if (s.life <= 0) s.mesh.visible = false;
      }
    },
  };
}
