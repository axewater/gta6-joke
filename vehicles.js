import * as THREE from 'three';
import { scene } from './renderer.js';
import { state } from './state.js';
import { GRID, CELL, HALF_CITY, TRAFFIC_CAR_COUNT } from './constants.js';

// ── Shared materials ───────────────────────────────────────────────────
const chromeMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.1, metalness: 0.9 });
const glassMat = new THREE.MeshStandardMaterial({
  color: 0x88ccff, roughness: 0.05, metalness: 0.1, opacity: 0.55, transparent: true
});
const rubberMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });
const rimMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.2, metalness: 0.9 });

// ── createDetailedCar ──────────────────────────────────────────────────
// Replaces createVehicle / createTrafficCar / createPoliceCar
// options: { isPolice, castShadow }
export function createDetailedCar(x, z, rotation, color, options = {}) {
  const group = new THREE.Group();
  const cs = options.castShadow || false;

  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.6 });

  // ── Main body ──────────────────────────────────────────────────────
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1, 4.5), bodyMat);
  body.position.y = 0.7;
  body.castShadow = cs;
  group.add(body);

  // Hood panel
  const hood = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.06, 1.2), bodyMat);
  hood.position.set(0, 1.23, 1.5);
  group.add(hood);

  // Trunk panel
  const trunk = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.06, 0.8), bodyMat);
  trunk.position.set(0, 1.23, -1.6);
  group.add(trunk);

  // Front bumper
  const fBumper = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.3, 0.2), chromeMat);
  fBumper.position.set(0, 0.4, 2.35);
  fBumper.name = 'fBumper';
  group.add(fBumper);

  // Rear bumper
  const rBumper = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.3, 0.2), chromeMat);
  rBumper.position.set(0, 0.4, -2.35);
  rBumper.name = 'rBumper';
  group.add(rBumper);

  // Door line strips (left & right)
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
  const doorLine = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.6, 2.6), doorMat);
  doorLine.position.set(-1.12, 0.9, -0.2);
  group.add(doorLine);
  const doorLineR = doorLine.clone();
  doorLineR.position.x = 1.12;
  group.add(doorLineR);

  // Door handles
  const handleGeo = new THREE.BoxGeometry(0.05, 0.08, 0.25);
  const lHandle = new THREE.Mesh(handleGeo, chromeMat);
  lHandle.position.set(-1.14, 1.0, -0.1);
  group.add(lHandle);
  const rHandle = new THREE.Mesh(handleGeo, chromeMat);
  rHandle.position.set(1.14, 1.0, -0.1);
  group.add(rHandle);

  // ── Cabin ─────────────────────────────────────────────────────────
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.75, 2.1), bodyMat);
  cabin.position.set(0, 1.58, -0.25);
  group.add(cabin);

  // Windshield (slight tilt simulated by scaling)
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.7, 0.08), glassMat);
  windshield.position.set(0, 1.58, 0.83);
  windshield.rotation.x = 0.2;
  group.add(windshield);

  // Rear window
  const rearWin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 0.08), glassMat);
  rearWin.position.set(0, 1.55, -1.31);
  rearWin.rotation.x = -0.15;
  group.add(rearWin);

  // Side windows
  const sideWinGeo = new THREE.BoxGeometry(0.07, 0.45, 1.1);
  const lWin = new THREE.Mesh(sideWinGeo, glassMat);
  lWin.position.set(-0.96, 1.6, -0.25);
  group.add(lWin);
  const rWin = new THREE.Mesh(sideWinGeo, glassMat);
  rWin.position.set(0.96, 1.6, -0.25);
  group.add(rWin);

  // ── Roof details ──────────────────────────────────────────────────
  const rackGeo = new THREE.BoxGeometry(1.8, 0.05, 0.08);
  const rack1 = new THREE.Mesh(rackGeo, chromeMat);
  rack1.position.set(0, 2.0, 0.3);
  group.add(rack1);
  const rack2 = rack1.clone();
  rack2.position.z = -0.7;
  group.add(rack2);

  // Antenna
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 5), chromeMat);
  antenna.position.set(-0.7, 2.35, -0.5);
  antenna.name = 'antenna';
  group.add(antenna);

  // Side mirrors
  const mirrorGeo = new THREE.BoxGeometry(0.18, 0.1, 0.12);
  const lMirror = new THREE.Mesh(mirrorGeo, bodyMat);
  lMirror.position.set(-1.2, 1.35, 0.7);
  lMirror.name = 'lMirror';
  group.add(lMirror);
  const rMirror = new THREE.Mesh(mirrorGeo, bodyMat);
  rMirror.position.set(1.2, 1.35, 0.7);
  rMirror.name = 'rMirror';
  group.add(rMirror);

  // Dual exhaust
  const exhaustGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.25, 6);
  const ex1 = new THREE.Mesh(exhaustGeo, chromeMat);
  ex1.rotation.x = Math.PI / 2;
  ex1.position.set(-0.5, 0.3, -2.5);
  group.add(ex1);
  const ex2 = ex1.clone();
  ex2.position.x = 0.5;
  group.add(ex2);

  // ── Lights ────────────────────────────────────────────────────────
  // Headlights (rectangular)
  const hlMat = new THREE.MeshStandardMaterial({ color: 0xffffee, emissive: 0xffffee, emissiveIntensity: 1.0 });
  const hlGeo = new THREE.BoxGeometry(0.5, 0.2, 0.08);
  const hl1 = new THREE.Mesh(hlGeo, hlMat);
  hl1.position.set(-0.7, 0.72, 2.3);
  group.add(hl1);
  const hl2 = hl1.clone();
  hl2.position.x = 0.7;
  group.add(hl2);

  // Taillights (rectangular red)
  const tlMat = new THREE.MeshStandardMaterial({ color: 0xff1111, emissive: 0xff0000, emissiveIntensity: 1.0 });
  const tlGeo = new THREE.BoxGeometry(0.5, 0.18, 0.08);
  const tl1 = new THREE.Mesh(tlGeo, tlMat);
  tl1.position.set(-0.7, 0.72, -2.3);
  group.add(tl1);
  const tl2 = tl1.clone();
  tl2.position.x = 0.7;
  group.add(tl2);

  // ── Wheels ────────────────────────────────────────────────────────
  const wheels = [];
  const wheelPositions = [
    [-1.15, 0.38, 1.35], [1.15, 0.38, 1.35],
    [-1.15, 0.38, -1.35], [1.15, 0.38, -1.35]
  ];
  for (const [wx, wy, wz] of wheelPositions) {
    const wGroup = new THREE.Group();
    const rubber = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.28, 10), rubberMat);
    rubber.rotation.z = Math.PI / 2;
    wGroup.add(rubber);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.3, 8), rimMat);
    rim.rotation.z = Math.PI / 2;
    wGroup.add(rim);
    wGroup.position.set(wx, wy, wz);
    group.add(wGroup);
    wheels.push(wGroup);
  }

  // ── Police extras ─────────────────────────────────────────────────
  let redLight = null, blueLight = null, redMat = null, blueMat = null;
  if (options.isPolice) {
    // Light bar base
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.45), chromeMat);
    barBase.position.set(0, 2.07, -0.25);
    group.add(barBase);

    redMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 2.0 });
    blueMat = new THREE.MeshStandardMaterial({ color: 0x0000ff, emissive: 0x0000ff, emissiveIntensity: 2.0 });
    redLight = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.2, 0.35), redMat);
    redLight.position.set(-0.45, 2.18, -0.25);
    group.add(redLight);
    blueLight = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.2, 0.35), blueMat);
    blueLight.position.set(0.45, 2.18, -0.25);
    group.add(blueLight);
  }

  group.rotation.y = rotation;
  group.position.set(x, 0, z);
  scene.add(group);

  return {
    mesh: group,
    x, z, rotation,
    speed: 0,
    wheels,
    color,
    halfW: 1.3, halfD: 2.5,
    redLight, blueLight, redMat, blueMat,
    flashTimer: 0,
    waypointDist: 0,
    waypointMax: 40 + Math.random() * 40,
    isTraffic: false,
    // Damage system
    health: 100,
    damageLevel: 0,
    isExploded: false,
    explosionTimer: 0,
    originalColor: color,
    smokeEmitter: null,
    explosion: null,
    bodyMaterial: bodyMat,
    detachableParts: { fBumper, rBumper, lMirror, rMirror, antenna }
  };
}

// ── Spawn player-drivable vehicles ─────────────────────────────────────
export function spawnVehicles() {
  const positions = [
    { x: 20, z: 6, rot: 0, color: 0xff3333 },
    { x: -30, z: -CELL + 6, rot: Math.PI, color: 0x3333ff },
    { x: CELL - 6, z: 25, rot: Math.PI / 2, color: 0xffcc00 },
    { x: -CELL + 6, z: -40, rot: -Math.PI / 2, color: 0x33cc33 },
    { x: 2 * CELL, z: 6, rot: 0, color: 0xff6600 },
    { x: -2 * CELL, z: -6, rot: Math.PI, color: 0xcc33ff },
    { x: 6, z: 3 * CELL, rot: Math.PI / 2, color: 0x00cccc },
  ];
  for (const p of positions) {
    const car = createDetailedCar(p.x, p.z, p.rot, p.color, { castShadow: true });
    state.vehicles.push(car);
  }
}

// ── Traffic cars ───────────────────────────────────────────────────────
export function createTrafficCars() {
  const colors = [
    0xFF6633, 0x33CCFF, 0xFFCC00, 0xCC33FF, 0x33FF66, 0xFF3366,
    0x4488FF, 0xFF8844, 0x44CC88, 0xDD4477, 0x88BBDD, 0xEEAA33,
    0x77AAFF, 0xBB5533, 0x55CC55
  ];
  for (let i = 0; i < TRAFFIC_CAR_COUNT; i++) {
    const roadIdx = 1 + Math.floor(Math.random() * (GRID - 1));
    const horizontal = Math.random() > 0.5;
    let x, z, rot;
    if (horizontal) {
      z = -HALF_CITY + roadIdx * CELL + (Math.random() > 0.5 ? 3 : -3);
      x = -HALF_CITY + Math.random() * (GRID * CELL);
      rot = Math.random() > 0.5 ? 0 : Math.PI;
    } else {
      x = -HALF_CITY + roadIdx * CELL + (Math.random() > 0.5 ? 3 : -3);
      z = -HALF_CITY + Math.random() * (GRID * CELL);
      rot = Math.random() > 0.5 ? Math.PI / 2 : -Math.PI / 2;
    }
    const car = createDetailedCar(x, z, rot, colors[i % colors.length]);
    car.speed = 10 + Math.random() * 5;
    car.isTraffic = true;
    car.atIntersection = false;
    state.trafficCars.push(car);
  }
}

// ── Spawn a single new traffic car (for respawn) ───────────────────────
export function spawnTrafficCar() {
  const colors = [0xFF6633, 0x33CCFF, 0xFFCC00, 0xCC33FF, 0x33FF66, 0xFF3366];
  const roadIdx = 1 + Math.floor(Math.random() * (GRID - 1));
  const horizontal = Math.random() > 0.5;
  let x, z, rot;
  if (horizontal) {
    z = -HALF_CITY + roadIdx * CELL + (Math.random() > 0.5 ? 3 : -3);
    x = -HALF_CITY + Math.random() * (GRID * CELL);
    rot = Math.random() > 0.5 ? 0 : Math.PI;
  } else {
    x = -HALF_CITY + roadIdx * CELL + (Math.random() > 0.5 ? 3 : -3);
    z = -HALF_CITY + Math.random() * (GRID * CELL);
    rot = Math.random() > 0.5 ? Math.PI / 2 : -Math.PI / 2;
  }
  const car = createDetailedCar(x, z, rot, colors[Math.floor(Math.random() * colors.length)]);
  car.speed = 10 + Math.random() * 5;
  car.isTraffic = true;
  car.atIntersection = false;
  return car;
}

// ── Police car ─────────────────────────────────────────────────────────
export function createPoliceCar(x, z, rotation) {
  const car = createDetailedCar(x, z, rotation, 0x111133, { isPolice: true });
  car.speed = 18;
  return car;
}

// ── Army Tank ───────────────────────────────────────────────────────────
export function createTank(x, z) {
  const group = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x3a5a1a, roughness: 0.9 });
  const trackMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.95 });

  // Hull
  const hull = new THREE.Mesh(new THREE.BoxGeometry(4, 1.2, 6), hullMat);
  hull.position.y = 0.8;
  group.add(hull);

  // Tracks (left & right)
  const trackGeo = new THREE.BoxGeometry(0.8, 0.9, 6.2);
  const trackL = new THREE.Mesh(trackGeo, trackMat);
  trackL.position.set(-2.1, 0.55, 0);
  group.add(trackL);
  const trackR = trackL.clone();
  trackR.position.x = 2.1;
  group.add(trackR);

  // Turret group (rotates independently)
  const turretGroup = new THREE.Group();
  turretGroup.position.set(0, 1.6, 0);
  group.add(turretGroup);

  const turret = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.8, 2.5), hullMat);
  turretGroup.add(turret);

  // Barrel
  const barrelMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.8, metalness: 0.5 });
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 2.5, 8), barrelMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0, 1.5);
  turretGroup.add(barrel);

  group.position.set(x, 0, z);
  scene.add(group);

  return {
    mesh: group,
    turretGroup,
    x, z,
    rotation: Math.random() * Math.PI * 2,
    halfW: 2.2, halfD: 3.2,
    shootTimer: 4 + Math.random() * 2,
    shells: []
  };
}
