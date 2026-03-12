import * as THREE from 'three';
import { scene } from './renderer.js';
import { state } from './state.js';
import { GRID, CELL, HALF_CITY, ROAD, TROPICAL_OUTFIT_COLORS, SKIN_TONES } from './constants.js';
import { randomSidewalkPos } from './city.js';

// ── Character Head helper ──────────────────────────────────────────────
// Returns a group containing the head. Options: hat (bool), sunglasses (bool), skinColor (hex)
export function createCharacterHead(skinColor, options = {}) {
  const group = new THREE.Group();

  const headMat = new THREE.MeshStandardMaterial({ color: skinColor });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.65, 0.65), headMat);
  head.castShadow = false;
  group.add(head);

  // Eyes (on +Z face)
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
  const eyeGeo = new THREE.BoxGeometry(0.1, 0.1, 0.05);
  const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
  leftEye.position.set(-0.13, 0.08, 0.33);
  group.add(leftEye);
  const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
  rightEye.position.set(0.13, 0.08, 0.33);
  group.add(rightEye);

  // Mouth
  const mouthMat = new THREE.MeshStandardMaterial({ color: 0x331111 });
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.05), mouthMat);
  mouth.position.set(0, -0.1, 0.33);
  group.add(mouth);

  // Optional blocky hat
  if (options.hat) {
    const hatColor = options.hatColor || 0x111111;
    const hatMat = new THREE.MeshStandardMaterial({ color: hatColor });
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.07, 0.8), hatMat);
    brim.position.set(0, 0.36, 0);
    group.add(brim);
    const crown = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.28, 0.5), hatMat);
    crown.position.set(0, 0.57, 0);
    group.add(crown);
  }

  // Optional neon sunglasses (emissive strip)
  if (options.sunglasses) {
    const glassColor = options.glassColor || 0xFF00FF;
    const glassMat = new THREE.MeshStandardMaterial({
      color: glassColor, emissive: glassColor, emissiveIntensity: 2.0
    });
    const glassGeo = new THREE.BoxGeometry(0.42, 0.08, 0.04);
    const glasses = new THREE.Mesh(glassGeo, glassMat);
    glasses.position.set(0, 0.08, 0.35);
    group.add(glasses);
  }

  return group;
}

// ── Character Body helper ──────────────────────────────────────────────
// Returns { group, leftLeg, rightLeg, leftArm, rightArm }
export function createCharacterBody(shirtColor, pantsColor, castShadow = false) {
  const group = new THREE.Group();

  const shirtMat = new THREE.MeshStandardMaterial({ color: shirtColor });
  const pantsMat = new THREE.MeshStandardMaterial({ color: pantsColor });
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });

  // Torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(1, 1.2, 0.6), shirtMat);
  torso.position.y = 1.2;
  torso.castShadow = castShadow;
  group.add(torso);

  // Belt strip
  const beltMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a });
  const belt = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.12, 0.62), beltMat);
  belt.position.y = 0.63;
  torso.add(belt);

  // Arms
  const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.9, 0.3), shirtMat);
  leftArm.position.set(-0.65, 1.15, 0);
  leftArm.castShadow = castShadow;
  group.add(leftArm);

  const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.9, 0.3), shirtMat);
  rightArm.position.set(0.65, 1.15, 0);
  rightArm.castShadow = castShadow;
  group.add(rightArm);

  // Legs
  const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 0.35), pantsMat);
  leftLeg.position.set(-0.2, 0.4, 0);
  leftLeg.castShadow = castShadow;
  group.add(leftLeg);

  const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 0.35), pantsMat);
  rightLeg.position.set(0.2, 0.4, 0);
  rightLeg.castShadow = castShadow;
  group.add(rightLeg);

  // Shoes (child of legs)
  const lShoe = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.45), shoeMat);
  lShoe.position.set(0, -0.47, 0.05);
  leftLeg.add(lShoe);
  const rShoe = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.45), shoeMat);
  rShoe.position.set(0, -0.47, 0.05);
  rightLeg.add(rShoe);

  return { group, leftLeg, rightLeg, leftArm, rightArm };
}

// ── Player ─────────────────────────────────────────────────────────────
export function createPlayer() {
  const root = new THREE.Group();

  const skinColor = 0xffcc99;
  const body = createCharacterBody(0x2266cc, 0x1a1a66, true);
  root.add(body.group);

  const headGroup = createCharacterHead(skinColor, {
    hat: true, hatColor: 0x111111,
    sunglasses: true, glassColor: 0xFF00FF
  });
  headGroup.position.set(0, 2.15, 0);
  root.add(headGroup);

  root.position.set(0, 0, 0);
  scene.add(root);

  state.player = {
    mesh: root,
    x: 0, y: 0, z: 0,
    leftLeg: body.leftLeg,
    rightLeg: body.rightLeg,
    leftArm: body.leftArm,
    rightArm: body.rightArm,
    legPhase: 0
  };
}

// ── NPCs ──────────────────────────────────────────────────────────────
export function createNPCs() {
  for (let i = 0; i < 50; i++) {
    const root = new THREE.Group();

    const outfitColor = TROPICAL_OUTFIT_COLORS[Math.floor(Math.random() * TROPICAL_OUTFIT_COLORS.length)];
    const pantsColor = 0x333355 + Math.floor(Math.random() * 0x222222);
    const skinColor = SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)];

    const hasHat = Math.random() < 0.4;
    const hasSunglasses = Math.random() < 0.2;
    const hatColor = [0x882222, 0x228822, 0x222288, 0xaaaaaa, 0x111111][Math.floor(Math.random() * 5)];
    const glassColor = [0x00FFFF, 0xFF00FF, 0xFFFF00, 0x00FF00][Math.floor(Math.random() * 4)];

    const body = createCharacterBody(outfitColor, pantsColor);
    root.add(body.group);

    const headGroup = createCharacterHead(skinColor, {
      hat: hasHat, hatColor,
      sunglasses: hasSunglasses, glassColor
    });
    headGroup.position.set(0, 1.95, 0);
    root.add(headGroup);

    // Place on sidewalk
    const roadIdx = Math.floor(Math.random() * (GRID + 1));
    const horizontal = Math.random() > 0.5;
    let nx, nz, dir;
    if (horizontal) {
      nz = -HALF_CITY + roadIdx * CELL + (Math.random() > 0.5 ? 1 : -1) * (ROAD / 2 + 1);
      nx = -HALF_CITY + Math.random() * (GRID * CELL);
      dir = Math.random() > 0.5 ? 0 : Math.PI;
    } else {
      nx = -HALF_CITY + roadIdx * CELL + (Math.random() > 0.5 ? 1 : -1) * (ROAD / 2 + 1);
      nz = -HALF_CITY + Math.random() * (GRID * CELL);
      dir = Math.random() > 0.5 ? Math.PI / 2 : -Math.PI / 2;
    }

    root.position.set(nx, 0, nz);
    root.rotation.y = dir;
    scene.add(root);

    state.npcs.push({
      mesh: root,
      x: nx, z: nz,
      direction: dir,
      speed: 1.5 + Math.random(),
      leftLeg: body.leftLeg, rightLeg: body.rightLeg,
      legPhase: Math.random() * Math.PI * 2,
      waypointDist: 0,
      waypointMax: 30 + Math.random() * 30,
      alive: true,
      respawnTimer: 0,
      horizontal,
      aggressive: false,
      aggroTimer: 0
    });
  }
}

// ── Police Officer ─────────────────────────────────────────────────────
export function createPoliceOfficer(x, z) {
  const root = new THREE.Group();

  const body = createCharacterBody(0x000066, 0x000033);
  root.add(body.group);

  const headGroup = createCharacterHead(0xDEB887, { hat: true, hatColor: 0x000044 });
  headGroup.position.set(0, 1.95, 0);
  root.add(headGroup);

  // Gun in hand
  const gunMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.6), gunMat);
  gun.position.set(0.55, 1.1, 0.3);
  root.add(gun);

  root.position.set(x, 0, z);
  scene.add(root);

  return {
    mesh: root,
    x, z,
    leftLeg: body.leftLeg, rightLeg: body.rightLeg,
    legPhase: 0,
    shootTimer: 1 + Math.random(),
    speed: 5
  };
}
