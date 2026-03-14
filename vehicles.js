import * as THREE from 'three';
import { scene } from './renderer.js';
import { state } from './state.js';
import { GRID, CELL, HALF_CITY, TRAFFIC_CAR_COUNT } from './constants.js';

const yieldFrame = () => new Promise(r => requestAnimationFrame(r));

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

  group.scale.set(1.5, 1.2, 1.5);
  group.rotation.y = rotation;
  group.position.set(x, 0, z);
  scene.add(group);

  return {
    mesh: group,
    x, z, rotation,
    speed: 0,
    wheels,
    color,
    halfW: 1.95, halfD: 3.75,
    redLight, blueLight, redMat, blueMat,
    flashTimer: 0,
    waypointDist: 0,
    waypointMax: 40 + Math.random() * 40,
    isTraffic: false,
    vehicleType: 'car',
    // Per-vehicle physics
    maxSpeed: 30, accel: 15, brake: 20, friction: 5, turnRate: 2.5, grip: 1.0,
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

// ── Sports Car ──────────────────────────────────────────────────────────
export function createSportsCar(x, z, rotation, color = 0xFF0000, options = {}) {
  const group = new THREE.Group();
  const cs = options.castShadow || false;
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.15, metalness: 0.8 });
  const carbonMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.3 });
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.5 });

  // ── Ultra-low wide body — noticeably flatter than normal car ─────
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.55, 4.8), bodyMat);
  body.position.y = 0.42;
  body.castShadow = cs;
  group.add(body);

  // Wide fender flares (left & right) — makes it visually wider
  const fenderGeo = new THREE.BoxGeometry(0.2, 0.45, 3.6);
  const fenderL = new THREE.Mesh(fenderGeo, bodyMat);
  fenderL.position.set(-1.5, 0.42, 0.2);
  group.add(fenderL);
  const fenderR = fenderL.clone();
  fenderR.position.x = 1.5;
  group.add(fenderR);

  // Racing stripes (two white lines down the center)
  const stripeGeo = new THREE.BoxGeometry(0.15, 0.02, 4.6);
  const stripe1 = new THREE.Mesh(stripeGeo, stripeMat);
  stripe1.position.set(-0.2, 0.71, 0);
  group.add(stripe1);
  const stripe2 = new THREE.Mesh(stripeGeo, stripeMat);
  stripe2.position.set(0.2, 0.71, 0);
  group.add(stripe2);

  // Hood — long, very flat with hood scoop
  const hood = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.04, 2.0), bodyMat);
  hood.position.set(0, 0.72, 1.1);
  group.add(hood);
  // Hood scoop
  const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.15, 0.5), carbonMat);
  scoop.position.set(0, 0.8, 1.5);
  group.add(scoop);

  // Aggressive front splitter (carbon fiber look)
  const fBumper = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.15, 0.35), carbonMat);
  fBumper.position.set(0, 0.22, 2.5);
  fBumper.name = 'fBumper';
  group.add(fBumper);

  // Rear diffuser
  const rBumper = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.15, 0.35), carbonMat);
  rBumper.position.set(0, 0.22, -2.5);
  rBumper.name = 'rBumper';
  group.add(rBumper);

  // Side air intakes (triangular look via boxes)
  const intakeGeo = new THREE.BoxGeometry(0.08, 0.25, 0.8);
  const intakeL = new THREE.Mesh(intakeGeo, carbonMat);
  intakeL.position.set(-1.42, 0.45, -0.6);
  group.add(intakeL);
  const intakeR = intakeL.clone();
  intakeR.position.x = 1.42;
  group.add(intakeR);

  // Side skirts (carbon)
  const skirtGeo = new THREE.BoxGeometry(0.1, 0.12, 3.8);
  const skirtL = new THREE.Mesh(skirtGeo, carbonMat);
  skirtL.position.set(-1.42, 0.2, 0);
  group.add(skirtL);
  const skirtR = skirtL.clone();
  skirtR.position.x = 1.42;
  group.add(skirtR);

  // ── Very low cabin — almost flush with body ─────────────────────
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.4, 1.4), bodyMat);
  cabin.position.set(0, 0.92, -0.4);
  group.add(cabin);

  // Heavily raked windshield
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.45, 0.08), glassMat);
  windshield.position.set(0, 0.92, 0.4);
  windshield.rotation.x = 0.45;
  group.add(windshield);

  // Rear window — very small
  const rearWin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.3, 0.08), glassMat);
  rearWin.position.set(0, 0.9, -1.15);
  rearWin.rotation.x = -0.25;
  group.add(rearWin);

  // Side windows — narrow slits
  const sideWinGeo = new THREE.BoxGeometry(0.07, 0.25, 0.8);
  const lWin = new THREE.Mesh(sideWinGeo, glassMat);
  lWin.position.set(-1.17, 0.95, -0.4);
  group.add(lWin);
  const rWin = new THREE.Mesh(sideWinGeo, glassMat);
  rWin.position.set(1.17, 0.95, -0.4);
  group.add(rWin);

  // ── BIG rear spoiler — the most recognizable feature ────────────
  const spoilerWing = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.08, 0.5), carbonMat);
  spoilerWing.position.set(0, 1.35, -2.1);
  group.add(spoilerWing);
  // Spoiler endplates
  const endplateGeo = new THREE.BoxGeometry(0.06, 0.35, 0.5);
  const endplateL = new THREE.Mesh(endplateGeo, carbonMat);
  endplateL.position.set(-1.35, 1.2, -2.1);
  group.add(endplateL);
  const endplateR = endplateL.clone();
  endplateR.position.x = 1.35;
  group.add(endplateR);
  // Spoiler posts
  const postGeo = new THREE.BoxGeometry(0.1, 0.5, 0.1);
  const postL = new THREE.Mesh(postGeo, carbonMat);
  postL.position.set(-0.7, 1.1, -2.1);
  group.add(postL);
  const postR = postL.clone();
  postR.position.x = 0.7;
  group.add(postR);

  // Side mirrors
  const mirrorGeo = new THREE.BoxGeometry(0.18, 0.1, 0.12);
  const lMirror = new THREE.Mesh(mirrorGeo, bodyMat);
  lMirror.position.set(-1.5, 0.8, 0.3);
  lMirror.name = 'lMirror';
  group.add(lMirror);
  const rMirror = new THREE.Mesh(mirrorGeo, bodyMat);
  rMirror.position.set(1.5, 0.8, 0.3);
  rMirror.name = 'rMirror';
  group.add(rMirror);

  // No antenna on sports car — stubby nub
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 5), carbonMat);
  antenna.position.set(-0.6, 1.15, -0.8);
  antenna.name = 'antenna';
  group.add(antenna);

  // ── Quad exhaust — 4 large pipes ────────────────────────────────
  const exhaustGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.3, 8);
  for (const ex of [[-0.7, 0.25, -2.6], [-0.35, 0.25, -2.6], [0.35, 0.25, -2.6], [0.7, 0.25, -2.6]]) {
    const pipe = new THREE.Mesh(exhaustGeo, chromeMat);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(ex[0], ex[1], ex[2]);
    group.add(pipe);
  }

  // ── Aggressive headlights — sharp, narrow ──────────────────────
  const hlMat = new THREE.MeshStandardMaterial({ color: 0xffffee, emissive: 0xffffee, emissiveIntensity: 1.5 });
  const hlGeo = new THREE.BoxGeometry(0.6, 0.1, 0.1);
  const hl1 = new THREE.Mesh(hlGeo, hlMat);
  hl1.position.set(-0.85, 0.5, 2.45);
  group.add(hl1);
  const hl2 = hl1.clone();
  hl2.position.x = 0.85;
  group.add(hl2);

  // DRL strip under headlights
  const drlMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.8 });
  const drlGeo = new THREE.BoxGeometry(0.5, 0.04, 0.06);
  const drl1 = new THREE.Mesh(drlGeo, drlMat);
  drl1.position.set(-0.85, 0.42, 2.48);
  group.add(drl1);
  const drl2 = drl1.clone();
  drl2.position.x = 0.85;
  group.add(drl2);

  // Taillights — wide LED bar
  const tlMat = new THREE.MeshStandardMaterial({ color: 0xff1111, emissive: 0xff0000, emissiveIntensity: 1.5 });
  const tlBar = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 0.08), tlMat);
  tlBar.position.set(0, 0.5, -2.45);
  group.add(tlBar);

  // ── Low-profile wide wheels ─────────────────────────────────────
  const wheels = [];
  const wheelPositions = [
    [-1.4, 0.3, 1.5], [1.4, 0.3, 1.5],
    [-1.4, 0.3, -1.5], [1.4, 0.3, -1.5]
  ];
  for (const [wx, wy, wz] of wheelPositions) {
    const wGroup = new THREE.Group();
    const rubber = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.38, 12), rubberMat);
    rubber.rotation.z = Math.PI / 2;
    wGroup.add(rubber);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.4, 10), rimMat);
    rim.rotation.z = Math.PI / 2;
    wGroup.add(rim);
    wGroup.position.set(wx, wy, wz);
    group.add(wGroup);
    wheels.push(wGroup);
  }

  group.scale.set(1.75, 1.75, 1.75);
  group.rotation.y = rotation;
  group.position.set(x, 0, z);
  scene.add(group);

  return {
    mesh: group,
    x, z, rotation,
    speed: 0,
    wheels,
    color,
    halfW: 2.8, halfD: 4.55,
    redLight: null, blueLight: null, redMat: null, blueMat: null,
    flashTimer: 0,
    waypointDist: 0,
    waypointMax: 40 + Math.random() * 40,
    isTraffic: false,
    vehicleType: 'sports',
    // Sports car physics — low grip for drifting
    maxSpeed: 55, accel: 25, brake: 18, friction: 3, turnRate: 3.2, grip: 0.4,
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

// ── School Bus ──────────────────────────────────────────────────────────
export function createSchoolBus(x, z, rotation, options = {}) {
  const group = new THREE.Group();
  const cs = options.castShadow || false;
  const busColor = 0xFFCC00;
  const bodyMat = new THREE.MeshStandardMaterial({ color: busColor, roughness: 0.5, metalness: 0.3 });
  const blackMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });

  // Long tall body
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.8, 8.0), bodyMat);
  body.position.y = 1.3;
  body.castShadow = cs;
  group.add(body);

  // Roof
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.1, 8.1), bodyMat);
  roof.position.set(0, 2.25, 0);
  group.add(roof);

  // Front bumper
  const fBumper = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.4, 0.2), chromeMat);
  fBumper.position.set(0, 0.55, 4.1);
  fBumper.name = 'fBumper';
  group.add(fBumper);

  // Rear bumper
  const rBumper = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.4, 0.2), chromeMat);
  rBumper.position.set(0, 0.55, -4.1);
  rBumper.name = 'rBumper';
  group.add(rBumper);

  // Flat front face
  const frontFace = new THREE.Mesh(new THREE.BoxGeometry(2.7, 1.6, 0.1), bodyMat);
  frontFace.position.set(0, 1.2, 4.0);
  group.add(frontFace);

  // Large front windshield
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.0, 0.08), glassMat);
  windshield.position.set(0, 1.8, 4.05);
  group.add(windshield);

  // Rear window
  const rearWin = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.8, 0.08), glassMat);
  rearWin.position.set(0, 1.7, -4.05);
  group.add(rearWin);

  // Side windows (multiple along the length)
  for (let i = 0; i < 5; i++) {
    const zPos = 2.8 - i * 1.5;
    const winL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.6, 0.8), glassMat);
    winL.position.set(-1.42, 1.8, zPos);
    group.add(winL);
    const winR = winL.clone();
    winR.position.x = 1.42;
    group.add(winR);
  }

  // Black stripe along the side
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.15, 7.8), blackMat);
  stripe.position.set(-1.43, 1.15, 0);
  group.add(stripe);
  const stripeR = stripe.clone();
  stripeR.position.x = 1.43;
  group.add(stripeR);

  // STOP sign arm (left side)
  const stopArm = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.05), new THREE.MeshStandardMaterial({ color: 0xFF0000, roughness: 0.5 }));
  stopArm.position.set(-1.8, 1.6, 2.5);
  group.add(stopArm);

  // Side mirrors
  const mirrorGeo = new THREE.BoxGeometry(0.2, 0.15, 0.15);
  const lMirror = new THREE.Mesh(mirrorGeo, chromeMat);
  lMirror.position.set(-1.6, 1.9, 3.8);
  lMirror.name = 'lMirror';
  group.add(lMirror);
  const rMirror = new THREE.Mesh(mirrorGeo, chromeMat);
  rMirror.position.set(1.6, 1.9, 3.8);
  rMirror.name = 'rMirror';
  group.add(rMirror);

  // Antenna
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 5), chromeMat);
  antenna.position.set(-0.5, 2.55, -1.0);
  antenna.name = 'antenna';
  group.add(antenna);

  // Headlights
  const hlMat = new THREE.MeshStandardMaterial({ color: 0xffffee, emissive: 0xffffee, emissiveIntensity: 1.0 });
  const hlGeo = new THREE.BoxGeometry(0.5, 0.35, 0.08);
  const hl1 = new THREE.Mesh(hlGeo, hlMat);
  hl1.position.set(-0.8, 0.9, 4.05);
  group.add(hl1);
  const hl2 = hl1.clone();
  hl2.position.x = 0.8;
  group.add(hl2);

  // Taillights
  const tlMat = new THREE.MeshStandardMaterial({ color: 0xff1111, emissive: 0xff0000, emissiveIntensity: 1.0 });
  const tlGeo = new THREE.BoxGeometry(0.5, 0.3, 0.08);
  const tl1 = new THREE.Mesh(tlGeo, tlMat);
  tl1.position.set(-0.8, 0.9, -4.05);
  group.add(tl1);
  const tl2 = tl1.clone();
  tl2.position.x = 0.8;
  group.add(tl2);

  // Exhaust
  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.3, 6), chromeMat);
  exhaust.rotation.x = Math.PI / 2;
  exhaust.position.set(0.8, 0.4, -4.2);
  group.add(exhaust);

  // 6 wheels (3 per side)
  const wheels = [];
  const wheelPositions = [
    [-1.4, 0.45, 3.0], [1.4, 0.45, 3.0],
    [-1.4, 0.45, 0], [1.4, 0.45, 0],
    [-1.4, 0.45, -3.0], [1.4, 0.45, -3.0]
  ];
  for (const [wx, wy, wz] of wheelPositions) {
    const wGroup = new THREE.Group();
    const rubber = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.35, 10), rubberMat);
    rubber.rotation.z = Math.PI / 2;
    wGroup.add(rubber);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.36, 8), rimMat);
    rim.rotation.z = Math.PI / 2;
    wGroup.add(rim);
    wGroup.position.set(wx, wy, wz);
    group.add(wGroup);
    wheels.push(wGroup);
  }

  group.scale.set(1.5, 1.5, 1.5);
  group.rotation.y = rotation;
  group.position.set(x, 0, z);
  scene.add(group);

  return {
    mesh: group,
    x, z, rotation,
    speed: 0,
    wheels,
    color: busColor,
    halfW: 2.25, halfD: 6.3,
    redLight: null, blueLight: null, redMat: null, blueMat: null,
    flashTimer: 0,
    waypointDist: 0,
    waypointMax: 40 + Math.random() * 40,
    isTraffic: false,
    vehicleType: 'bus',
    // Bus physics — slow and heavy, full grip
    maxSpeed: 16, accel: 6, brake: 12, friction: 8, turnRate: 1.2, grip: 1.0,
    // Damage system
    health: 100,
    damageLevel: 0,
    isExploded: false,
    explosionTimer: 0,
    originalColor: busColor,
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
    // Sports cars — 3 parked around the city in bright colors
    { x: -CELL + 6, z: -40, rot: -Math.PI / 2, type: 'sports', sportsColor: 0xFF0000 },
    { x: 2 * CELL, z: 6, rot: 0, type: 'sports', sportsColor: 0xFFCC00 },
    { x: -2 * CELL, z: -6, rot: Math.PI, type: 'sports', sportsColor: 0x0044FF },
    // School bus spawn
    { x: 6, z: 3 * CELL, rot: Math.PI / 2, type: 'bus' },
  ];
  for (const p of positions) {
    let car;
    if (p.type === 'sports') {
      car = createSportsCar(p.x, p.z, p.rot, p.sportsColor || 0xFF0000, { castShadow: true });
    } else if (p.type === 'bus') {
      car = createSchoolBus(p.x, p.z, p.rot, { castShadow: true });
    } else {
      car = createDetailedCar(p.x, p.z, p.rot, p.color, { castShadow: true });
    }
    state.vehicles.push(car);
  }
}

// ── Traffic cars ───────────────────────────────────────────────────────
export async function createTrafficCars() {
  const colors = [
    0xFF6633, 0x33CCFF, 0xFFCC00, 0xCC33FF, 0x33FF66, 0xFF3366,
    0x4488FF, 0xFF8844, 0x44CC88, 0xDD4477, 0x88BBDD, 0xEEAA33,
    0x77AAFF, 0xBB5533, 0x55CC55
  ];
  const sportsColors = [0xFF0000, 0xFF4400, 0x0044FF, 0xFFFFFF, 0x111111, 0xFFCC00];
  for (let i = 0; i < TRAFFIC_CAR_COUNT; i++) {
    if (i > 0 && i % 5 === 0) await yieldFrame();
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
    z = Math.min(z, HALF_CITY - 5);

    const roll = Math.random();
    let car;
    if (roll < 0.25) {
      car = createSportsCar(x, z, rot, sportsColors[Math.floor(Math.random() * sportsColors.length)]);
      car.speed = 18 + Math.random() * 4;
    } else if (roll < 0.35) {
      car = createSchoolBus(x, z, rot);
      car.speed = 7 + Math.random() * 3;
    } else {
      car = createDetailedCar(x, z, rot, colors[i % colors.length]);
      car.speed = 10 + Math.random() * 5;
    }
    car.isTraffic = true;
    car.atIntersection = false;
    state.trafficCars.push(car);
  }
}

// ── Spawn a single new traffic car (for respawn) ───────────────────────
export function spawnTrafficCar() {
  const colors = [0xFF6633, 0x33CCFF, 0xFFCC00, 0xCC33FF, 0x33FF66, 0xFF3366];
  const sportsColors = [0xFF0000, 0xFF4400, 0x0044FF, 0xFFFFFF, 0x111111, 0xFFCC00];
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
  z = Math.min(z, HALF_CITY - 5);

  const roll = Math.random();
  let car;
  if (roll < 0.15) {
    car = createSportsCar(x, z, rot, sportsColors[Math.floor(Math.random() * sportsColors.length)]);
    car.speed = 18 + Math.random() * 4;
  } else if (roll < 0.25) {
    car = createSchoolBus(x, z, rot);
    car.speed = 7 + Math.random() * 3;
  } else {
    car = createDetailedCar(x, z, rot, colors[Math.floor(Math.random() * colors.length)]);
    car.speed = 10 + Math.random() * 5;
  }
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

  group.scale.set(1.5, 1.5, 1.5);
  group.position.set(x, 0, z);
  scene.add(group);

  return {
    mesh: group,
    turretGroup,
    x, z,
    rotation: Math.random() * Math.PI * 2,
    halfW: 3.3, halfD: 4.8,
    shootTimer: 4 + Math.random() * 2,
    shells: []
  };
}
