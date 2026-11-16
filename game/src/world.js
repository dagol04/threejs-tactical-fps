// Harbor Yard: an original dusk container yard, 44 x 36 m. Two bomb sites, A "Crane"
// north-west and B "Warehouse" north-east, three lanes (Dock west, Mid, Alley east),
// Vanguard spawning south, Sentinel north. All cover is a box collider and a bullet
// stop; the waypoint graph below is the bots' road map, kept in open lanes.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// [width, height, depth, x, y, z, material]
const BOXES = [
  // Floor and perimeter walls.
  [44.4, 0.4, 36.4, 0, -0.2, 0, 'floor'],
  [0.4, 5, 36.4, -22.2, 2.5, 0, 'wall'],
  [0.4, 5, 36.4, 22.2, 2.5, 0, 'wall'],
  [44.4, 5, 0.4, 0, 2.5, -18.2, 'wall'],
  [44.4, 5, 0.4, 0, 2.5, 18.2, 'wall'],
  // Mid container stack: two offset containers with a walkable tunnel between them,
  // one more stacked across the top.
  [6, 2.6, 2.4, -2, 1.3, 2.2, 'rust'],
  [6, 2.6, 2.4, 2, 1.3, -2.2, 'teal'],
  [6, 2.6, 2.4, 0, 3.9, 0, 'amber'],
  // North cover in front of the sites.
  [4, 2.6, 2.4, -6, 1.3, -8, 'teal'],
  [4, 2.6, 2.4, 6, 1.3, -8, 'rust'],
  // Low crouch walls near the Vanguard spawn.
  [3, 1.1, 0.6, -4, 0.55, 8, 'crate'],
  [3, 1.1, 0.6, 4, 0.55, 8, 'crate'],
  // Dock lane (west) cover.
  [1.2, 1.2, 1.2, -16.5, 0.6, 7, 'crate'],
  [1.2, 1.2, 1.2, -17.5, 0.6, -3, 'crate'],
  [0.6, 1.1, 4, -15.5, 0.55, -9, 'crate'],
  // Alley lane (east) cover.
  [1.2, 1.2, 1.2, 16.5, 0.6, 7, 'crate'],
  [1.2, 1.2, 1.2, 17.5, 0.6, -3, 'crate'],
  [0.6, 1.1, 4, 15.5, 0.55, -9, 'crate'],
  // Flank crates off the mid lanes.
  [1.2, 1.2, 1.2, -9.5, 0.6, -3.5, 'rust'],
  [1.2, 1.2, 1.2, 9.5, 0.6, -3.5, 'teal'],
  [1.2, 1.2, 1.2, -9.5, 1.8, -3.5, 'amber'],
  // Site A crane legs and beam.
  [0.5, 4.6, 0.5, -16.5, 2.3, -14, 'wall'],
  [0.5, 4.6, 0.5, -11.5, 2.3, -14, 'wall'],
  [0.5, 4.6, 0.5, -16.5, 2.3, -10, 'wall'],
  [0.5, 4.6, 0.5, -11.5, 2.3, -10, 'wall'],
  [5.6, 0.7, 0.9, -14, 4.9, -12, 'amber'],
  // Site B warehouse shell, open to the south.
  [0.4, 4, 6, 10.5, 2, -13, 'wall'],
  [0.4, 4, 6, 17.5, 2, -13, 'wall'],
  [7.4, 4, 0.4, 14, 2, -16, 'wall'],
  // Barrels (collider is the box; the mesh is a cylinder).
  [0.9, 1, 0.9, -10, 0.5, 2, 'amber'],
  [0.9, 1, 0.9, 10, 0.5, 2, 'rust'],
  [0.9, 1, 0.9, -13, 0.5, 6, 'teal'],
  [0.9, 1, 0.9, 13, 0.5, -6, 'amber'],
  [0.9, 1, 0.9, 0, 0.5, 12, 'rust'],
];

// Waypoint graph: [x, z] nodes the bots walk between, and their edges.
const WAYPOINTS = [
  [0, 15], [-0, 9], [-6, 4], [6, 4], [0, 0], [0, -6],
  [-17, 10], [-17, 0], [-17, -9], [17, 10], [17, 0], [17, -9],
  [-10, -10], [-14, -12], [10, -10], [14, -12], [0, -15],
  [-7, -9], [7, -9], [-19, 14], [19, 14], [-19, -15], [19, -15],
  [-8, -1], [8, -1],
];
const EDGES = [
  [0, 1], [0, 6], [0, 9], [0, 19], [0, 20],
  [1, 2], [1, 3], [1, 4],
  [2, 4], [2, 7], [2, 23],
  [3, 4], [3, 10], [3, 24],
  [4, 5], [4, 23], [4, 24],
  [5, 12], [5, 14], [5, 17], [5, 18],
  [6, 7], [7, 8], [8, 12], [8, 21],
  [9, 10], [10, 11], [11, 14], [11, 22],
  [12, 13], [12, 17], [12, 21],
  [14, 15], [14, 18], [14, 22],
  [16, 17], [16, 18], [16, 21], [16, 22],
  [23, 12], [24, 14],
];

export const MAP = {
  bounds: { minX: -22, maxX: 22, minZ: -18, maxZ: 18 },
  boxes: BOXES,
  waypoints: WAYPOINTS,
  edges: EDGES,
  sites: {
    A: { name: 'Crane', x: -14, z: -12, waypoint: 13 },
    B: { name: 'Warehouse', x: 14, z: -12, waypoint: 15 },
  },
  spawns: {
    vanguard: [[-4, 15], [0, 16], [4, 15], [-1.5, 13.5]],
    sentinel: [[-4, -15], [0, -16], [4, -15], [-1.5, -13.5], [1.5, -13.5]],
  },
};

// Breadth-first path over the waypoint graph, returned as a list of node indices.
export function findPath(from, to) {
  if (from === to) return [to];
  const prev = new Array(WAYPOINTS.length).fill(-1);
  const queue = [from];
  prev[from] = from;
  while (queue.length) {
    const node = queue.shift();
    if (node === to) break;
    for (const [a, b] of EDGES) {
      const next = a === node ? b : b === node ? a : -1;
      if (next !== -1 && prev[next] === -1) {
        prev[next] = node;
        queue.push(next);
      }
    }
  }
  if (prev[to] === -1) return [to];
  const path = [];
  let node = to;
  while (node !== from) {
    path.unshift(node);
    node = prev[node];
  }
  path.unshift(from);
  return path;
}

// Nearest waypoint to a position.
export function nearestWaypoint(x, z) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < WAYPOINTS.length; i += 1) {
    const dx = WAYPOINTS[i][0] - x;
    const dz = WAYPOINTS[i][1] - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.5 : 0.9,
      metalness: name === 'rust' || name === 'amber' || name === 'teal' ? 0.25 : 0.03,
    });
  }
  const barrelGeo = new THREE.CylinderGeometry(0.45, 0.45, 1, 14);
  const colliders = [];
  const shootables = [];
  const boxGeoCache = new Map();
  function boxGeo(w, h, d) {
    const key = `${w}|${h}|${d}`;
    if (!boxGeoCache.has(key)) boxGeoCache.set(key, new THREE.BoxGeometry(w, h, d));
    return boxGeoCache.get(key);
  }

  for (const [w, h, d, x, y, z, material] of BOXES) {
    const isBarrel = material !== 'floor' && material !== 'wall' && w === 0.9 && h === 1 && d === 0.9;
    const mesh = new THREE.Mesh(isBarrel ? barrelGeo : boxGeo(w, h, d), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
  }

  // Site pads: a flat border and a lamp pole each, so both sites read at a glance.
  for (const site of Object.values(MAP.sites)) {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(5, 0.06, 5), materials.amber);
    pad.position.set(site.x, 0.03, site.z);
    pad.receiveShadow = true;
    group.add(pad);
    const inner = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.06, 4.2), materials.floor);
    inner.position.set(site.x, 0.05, site.z);
    inner.receiveShadow = true;
    group.add(inner);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.4, 8), materials.wall);
    pole.position.set(site.x + 2.2, 1.7, site.z + 2.2);
    pole.castShadow = true;
    group.add(pole);
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 12, 8),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.gold) }),
    );
    lamp.position.set(site.x + 2.2, 3.5, site.z + 2.2);
    group.add(lamp);
    const light = new THREE.PointLight(new THREE.Color(PALETTE.gold), 14, 12, 1.6);
    light.position.set(site.x + 2.2, 3.4, site.z + 2.2);
    scene.add(light);
  }

  // Painted lane lines on the concrete, thin and flat.
  const lineMat = materials.gold;
  for (const [w, d, x, z] of [[0.18, 20, -11, 2], [0.18, 20, 11, 2], [0.18, 12, 0, 12]]) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), lineMat);
    line.position.set(x, 0.02, z);
    line.receiveShadow = true;
    group.add(line);
  }

  // Distant harbour silhouettes beyond the walls, and a low sun disc, for the vista.
  const silhouette = new THREE.MeshStandardMaterial({ color: new THREE.Color('#232a33'), roughness: 1 });
  for (const [w, h, d, x, z] of [
    [10, 14, 4, -30, -26], [8, 9, 4, -12, -30], [14, 18, 5, 8, -28], [7, 11, 4, 26, -24], [9, 7, 4, 30, 6],
  ]) {
    const block = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), silhouette);
    block.position.set(x, h / 2, z);
    scene.add(block);
  }
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(5, 32),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb35c'), fog: false }),
  );
  sun.position.set(-34, 13, -52);
  sun.lookAt(0, 2, 0);
  scene.add(sun);

  // Light: warm low sun with shadows, a cool sky fill, and a dusk fog.
  const sky = new THREE.HemisphereLight(new THREE.Color('#8fa3b8'), new THREE.Color('#20242a'), 0.85);
  scene.add(sky);
  const key = new THREE.DirectionalLight(new THREE.Color('#ffb35c'), 2.4);
  key.position.set(-18, 22, 14);
  key.target.position.set(0, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -26;
  key.shadow.camera.right = 26;
  key.shadow.camera.top = 26;
  key.shadow.camera.bottom = -26;
  key.shadow.camera.far = 70;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#7d90a8'), 0.5);
  fill.position.set(14, 10, -12);
  scene.add(fill);

  return { colliders, shootables, group };
}
