import * as THREE from 'three';
import { scene } from './renderer.js';
import { state } from './state.js';
import { GRID, CELL, HALF_CITY, ROAD, TROPICAL_OUTFIT_COLORS, SKIN_TONES, NPC_HAIR_COLORS, NPC_COUNT, GANG_ZONES, GANG_NPC_PER_ZONE } from './constants.js';
import { randomSidewalkPos } from './city.js';

const yieldFrame = () => new Promise(r => requestAnimationFrame(r));

// ── Character Head helper (sphere with hair, matching player quality) ──
// Returns a group containing the head. Options: hat, sunglasses, hairColor, hatColor, glassColor
export function createCharacterHead(skinColor, options = {}) {
  const group = new THREE.Group();

  const headMat = new THREE.MeshStandardMaterial({ color: skinColor });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 6, 5), headMat);
  head.castShadow = true;
  group.add(head);

  // Eyes — sphere whites + sphere pupils (same as player)
  const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.8 });
  const eyeWhiteGeo = new THREE.SphereGeometry(0.045, 5, 4);
  const leftEyeW = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
  leftEyeW.position.set(-0.12, 0.06, 0.29);
  group.add(leftEyeW);
  const rightEyeW = leftEyeW.clone();
  rightEyeW.position.set(0.12, 0.06, 0.29);
  group.add(rightEyeW);

  const pupilMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
  const pupilGeo = new THREE.SphereGeometry(0.025, 4, 4);
  const leftPupil = new THREE.Mesh(pupilGeo, pupilMat);
  leftPupil.position.set(-0.12, 0.06, 0.32);
  group.add(leftPupil);
  const rightPupil = leftPupil.clone();
  rightPupil.position.set(0.12, 0.06, 0.32);
  group.add(rightPupil);

  // Mouth
  const mouthMat = new THREE.MeshStandardMaterial({ color: 0x331111 });
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.04, 0.04), mouthMat);
  mouth.position.set(0, -0.12, 0.3);
  group.add(mouth);

  // ── Hair ──────────────────────────────────────────────────────────────
  const hairColor = options.hairColor || NPC_HAIR_COLORS[Math.floor(Math.random() * NPC_HAIR_COLORS.length)];
  const hairMat = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.9 });

  // Base skull cap — top 35% of sphere
  const capGeo = new THREE.SphereGeometry(0.37, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.35);
  const cap = new THREE.Mesh(capGeo, hairMat);
  cap.position.y = 0.04;
  group.add(cap);

  // Textured tufts (10 for NPCs vs player's 24, skip if wearing hat)
  if (!options.hat) {
    const tuftGeo = new THREE.BoxGeometry(0.06, 0.05, 0.06);
    for (let i = 0; i < 10; i++) {
      const tuft = new THREE.Mesh(tuftGeo, hairMat);
      const phi = Math.random() * Math.PI * 0.32;
      const theta = Math.PI * 0.3 + Math.random() * Math.PI * 1.4;
      const r = 0.38;
      tuft.position.set(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi) + 0.04,
        r * Math.sin(phi) * Math.sin(theta)
      );
      tuft.rotation.set(
        (Math.random() - 0.5) * 0.6,
        (Math.random() - 0.5) * 1.0,
        (Math.random() - 0.5) * 0.6
      );
      const s = 0.8 + Math.random() * 0.5;
      tuft.scale.set(s, s * (0.7 + Math.random() * 0.6), s);
      group.add(tuft);
    }
  }

  // Back hair
  const backHair = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.06), hairMat);
  backHair.position.set(0, 0.12, -0.34);
  group.add(backHair);
  const backLower = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.05), hairMat);
  backLower.position.set(0, 0.02, -0.35);
  group.add(backLower);

  // Side hair
  const sideGeo = new THREE.BoxGeometry(0.05, 0.1, 0.16);
  const leftSide = new THREE.Mesh(sideGeo, hairMat);
  leftSide.position.set(-0.34, 0.18, -0.02);
  group.add(leftSide);
  const rightSide = leftSide.clone();
  rightSide.position.x = 0.34;
  group.add(rightSide);

  // Optional blocky hat — raised to sit on hair
  if (options.hat) {
    const hatColor = options.hatColor || 0x111111;
    const hatMat = new THREE.MeshStandardMaterial({ color: hatColor });
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.07, 0.8), hatMat);
    brim.position.set(0, 0.33, 0);
    group.add(brim);
    const crown = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.28, 0.52), hatMat);
    crown.position.set(0, 0.47, 0);
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
    glasses.position.set(0, 0.05, 0.33);
    group.add(glasses);
  }

  return group;
}

// ── Player Head (low-poly sphere with features + hair) ───────────────
export function createPlayerHead(skinColor, options = {}) {
  const group = new THREE.Group();

  const headMat = new THREE.MeshStandardMaterial({ color: skinColor });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 6, 5), headMat);
  head.castShadow = false;
  group.add(head);

  // Eyes — non-emissive to avoid bloom blowout
  const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.8 });
  const eyeWhiteGeo = new THREE.SphereGeometry(0.045, 5, 4);
  const leftEyeW = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
  leftEyeW.position.set(-0.12, 0.06, 0.29);
  group.add(leftEyeW);
  const rightEyeW = leftEyeW.clone();
  rightEyeW.position.set(0.12, 0.06, 0.29);
  group.add(rightEyeW);

  const pupilMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
  const pupilGeo = new THREE.SphereGeometry(0.025, 4, 4);
  const leftPupil = new THREE.Mesh(pupilGeo, pupilMat);
  leftPupil.position.set(-0.12, 0.06, 0.32);
  group.add(leftPupil);
  const rightPupil = leftPupil.clone();
  rightPupil.position.set(0.12, 0.06, 0.32);
  group.add(rightPupil);

  // Mouth
  const mouthMat = new THREE.MeshStandardMaterial({ color: 0x331111 });
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.04, 0.04), mouthMat);
  mouth.position.set(0, -0.12, 0.3);
  group.add(mouth);

  // ── Hair: short textured crop ──────────────────────────────────────
  const hairColor = options.hairColor || 0x8a7040;
  const hairMat = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.9 });

  // Base skull cap — top 35% of sphere only, well above eye line
  const capGeo = new THREE.SphereGeometry(0.37, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.35);
  const cap = new THREE.Mesh(capGeo, hairMat);
  cap.position.y = 0.04;
  group.add(cap);

  // Textured tufts — scattered on top/back of head, NOT the face
  const tuftGeo = new THREE.BoxGeometry(0.06, 0.05, 0.06);
  for (let i = 0; i < 24; i++) {
    const tuft = new THREE.Mesh(tuftGeo, hairMat);
    const phi = Math.random() * Math.PI * 0.32;  // top portion only
    // Avoid the front face: theta from PI*0.3 to PI*1.7 (back & sides, skip front)
    const theta = Math.PI * 0.3 + Math.random() * Math.PI * 1.4;
    const r = 0.38;
    tuft.position.set(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi) + 0.04,
      r * Math.sin(phi) * Math.sin(theta)
    );
    tuft.rotation.set(
      (Math.random() - 0.5) * 0.6,
      (Math.random() - 0.5) * 1.0,
      (Math.random() - 0.5) * 0.6
    );
    const s = 0.8 + Math.random() * 0.5;
    tuft.scale.set(s, s * (0.7 + Math.random() * 0.6), s);
    group.add(tuft);
  }

  // Back hair — extra coverage on the back of the head
  const backGeo = new THREE.BoxGeometry(0.28, 0.18, 0.06);
  const backHair = new THREE.Mesh(backGeo, hairMat);
  backHair.position.set(0, 0.12, -0.34);
  group.add(backHair);
  const backLower = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.05), hairMat);
  backLower.position.set(0, 0.02, -0.35);
  group.add(backLower);

  // Side hair — above eye line, at temple level
  const sideGeo = new THREE.BoxGeometry(0.05, 0.1, 0.16);
  const leftSide = new THREE.Mesh(sideGeo, hairMat);
  leftSide.position.set(-0.34, 0.18, -0.02);
  group.add(leftSide);
  const rightSide = leftSide.clone();
  rightSide.position.x = 0.34;
  group.add(rightSide);

  // Optional blocky hat — raised to sit on top of hair
  if (options.hat) {
    const hatColor = options.hatColor || 0x111111;
    const hatMat = new THREE.MeshStandardMaterial({ color: hatColor });
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.07, 0.8), hatMat);
    brim.position.set(0, 0.33, 0);
    group.add(brim);
    const crown = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.28, 0.52), hatMat);
    crown.position.set(0, 0.47, 0);
    group.add(crown);
  }

  // Optional neon sunglasses — toned down emissive
  if (options.sunglasses) {
    const glassColor = options.glassColor || 0xFF00FF;
    const glassMat = new THREE.MeshStandardMaterial({
      color: glassColor, emissive: glassColor, emissiveIntensity: 0.6
    });
    const glassGeo = new THREE.BoxGeometry(0.42, 0.08, 0.04);
    const glasses = new THREE.Mesh(glassGeo, glassMat);
    glasses.position.set(0, 0.05, 0.33);
    group.add(glasses);
  }

  return group;
}

// ── Character Body (joint-pivoted, matching player quality) ───────────
// Returns { group, leftLeg (pivot), rightLeg (pivot), leftArm (pivot), rightArm (pivot),
//           bodyGroup, rightHand }
export function createCharacterBody(shirtColor, pantsColor, castShadow = true, skinColor = 0xDEB887) {
  const group = new THREE.Group();

  const shirtMat = new THREE.MeshStandardMaterial({ color: shirtColor });
  const pantsMat = new THREE.MeshStandardMaterial({ color: pantsColor });
  const skinMat = new THREE.MeshStandardMaterial({ color: skinColor });
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });

  // ── bodyGroup (for torso) ─────────────────────────────────────────
  const bodyGroup = new THREE.Group();
  bodyGroup.position.y = 0.85;
  group.add(bodyGroup);

  // Torso — trapezoid via ExtrudeGeometry (broad shoulders, narrow waist)
  const torsoShape = new THREE.Shape();
  torsoShape.moveTo(-0.4, 0);
  torsoShape.lineTo(0.4, 0);
  torsoShape.lineTo(0.55, 1.2);
  torsoShape.lineTo(-0.55, 1.2);
  torsoShape.closePath();
  const torsoGeo = new THREE.ExtrudeGeometry(torsoShape, { depth: 0.55, bevelEnabled: false });
  torsoGeo.translate(0, 0, -0.275);
  const torso = new THREE.Mesh(torsoGeo, shirtMat);
  torso.castShadow = castShadow;
  bodyGroup.add(torso);

  // Belt
  const beltMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a });
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.12, 0.58), beltMat);
  belt.position.y = 0.06;
  torso.add(belt);

  // ── Shoulder pivots ───────────────────────────────────────────────
  const leftShoulderPivot = new THREE.Group();
  leftShoulderPivot.position.set(-0.6, 1.15, 0);
  bodyGroup.add(leftShoulderPivot);

  const lUpperArmGeo = new THREE.CylinderGeometry(0.1, 0.09, 0.5, 6);
  lUpperArmGeo.translate(0, -0.25, 0);
  const lUpperArm = new THREE.Mesh(lUpperArmGeo, shirtMat);
  lUpperArm.castShadow = castShadow;
  leftShoulderPivot.add(lUpperArm);

  const lForearmGeo = new THREE.CylinderGeometry(0.08, 0.07, 0.4, 6);
  lForearmGeo.translate(0, -0.2, 0);
  const lForearm = new THREE.Mesh(lForearmGeo, skinMat);
  lForearm.position.y = -0.5;
  lUpperArm.add(lForearm);

  const lHand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.08), skinMat);
  lHand.position.y = -0.4;
  lForearm.add(lHand);

  const rightShoulderPivot = new THREE.Group();
  rightShoulderPivot.position.set(0.6, 1.15, 0);
  bodyGroup.add(rightShoulderPivot);

  const rUpperArmGeo = new THREE.CylinderGeometry(0.1, 0.09, 0.5, 6);
  rUpperArmGeo.translate(0, -0.25, 0);
  const rUpperArm = new THREE.Mesh(rUpperArmGeo, shirtMat);
  rUpperArm.castShadow = castShadow;
  rightShoulderPivot.add(rUpperArm);

  const rForearmGeo = new THREE.CylinderGeometry(0.08, 0.07, 0.4, 6);
  rForearmGeo.translate(0, -0.2, 0);
  const rForearm = new THREE.Mesh(rForearmGeo, skinMat);
  rForearm.position.y = -0.5;
  rUpperArm.add(rForearm);

  const rHand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.08), skinMat);
  rHand.position.y = -0.4;
  rForearm.add(rHand);

  // ── Hip pivots ────────────────────────────────────────────────────
  const leftHipPivot = new THREE.Group();
  leftHipPivot.position.set(-0.18, 0.88, 0);
  group.add(leftHipPivot);

  const lUpperLegGeo = new THREE.CylinderGeometry(0.12, 0.1, 0.45, 6);
  lUpperLegGeo.translate(0, -0.225, 0);
  const lUpperLeg = new THREE.Mesh(lUpperLegGeo, pantsMat);
  lUpperLeg.castShadow = castShadow;
  leftHipPivot.add(lUpperLeg);

  const lLowerLegGeo = new THREE.CylinderGeometry(0.09, 0.08, 0.4, 6);
  lLowerLegGeo.translate(0, -0.2, 0);
  const lLowerLeg = new THREE.Mesh(lLowerLegGeo, pantsMat);
  lLowerLeg.position.y = -0.45;
  lUpperLeg.add(lLowerLeg);

  const lFoot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.22), shoeMat);
  lFoot.position.set(0, -0.4, 0.04);
  lLowerLeg.add(lFoot);

  const rightHipPivot = new THREE.Group();
  rightHipPivot.position.set(0.18, 0.88, 0);
  group.add(rightHipPivot);

  const rUpperLegGeo = new THREE.CylinderGeometry(0.12, 0.1, 0.45, 6);
  rUpperLegGeo.translate(0, -0.225, 0);
  const rUpperLeg = new THREE.Mesh(rUpperLegGeo, pantsMat);
  rUpperLeg.castShadow = castShadow;
  rightHipPivot.add(rUpperLeg);

  const rLowerLegGeo = new THREE.CylinderGeometry(0.09, 0.08, 0.4, 6);
  rLowerLegGeo.translate(0, -0.2, 0);
  const rLowerLeg = new THREE.Mesh(rLowerLegGeo, pantsMat);
  rLowerLeg.position.y = -0.45;
  rUpperLeg.add(rLowerLeg);

  const rFoot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.22), shoeMat);
  rFoot.position.set(0, -0.4, 0.04);
  rLowerLeg.add(rFoot);

  return {
    group,
    leftLeg: leftHipPivot,
    rightLeg: rightHipPivot,
    leftArm: leftShoulderPivot,
    rightArm: rightShoulderPivot,
    bodyGroup,
    rightHand: rHand
  };
}

// ── Player Body (joint-pivoted, shaped geometry) ─────────────────────
// Returns { group, leftLeg (pivot), rightLeg (pivot), leftArm (pivot), rightArm (pivot),
//           torso, bodyGroup, neckPivot, rightHand, rightForearm }
export function createPlayerBody(shirtColor, pantsColor, castShadow = true) {
  const group = new THREE.Group();

  const shirtMat = new THREE.MeshStandardMaterial({ color: shirtColor });
  const pantsMat = new THREE.MeshStandardMaterial({ color: pantsColor });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xffcc99 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });

  // ── bodyGroup (for torso lean/breathing) ─────────────────────────
  const bodyGroup = new THREE.Group();
  bodyGroup.position.y = 0.85; // at hip/waist level
  group.add(bodyGroup);

  // Torso — trapezoid via ExtrudeGeometry (broad shoulders, narrow waist)
  const torsoShape = new THREE.Shape();
  torsoShape.moveTo(-0.4, 0);    // waist left
  torsoShape.lineTo(0.4, 0);     // waist right
  torsoShape.lineTo(0.55, 1.2);  // shoulder right
  torsoShape.lineTo(-0.55, 1.2); // shoulder left
  torsoShape.closePath();
  const torsoGeo = new THREE.ExtrudeGeometry(torsoShape, { depth: 0.55, bevelEnabled: false });
  torsoGeo.translate(0, 0, -0.275); // center on Z
  const torso = new THREE.Mesh(torsoGeo, shirtMat);
  torso.castShadow = castShadow;
  bodyGroup.add(torso);

  // Belt
  const beltMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a });
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.12, 0.58), beltMat);
  belt.position.y = 0.06;
  torso.add(belt);

  // ── Shoulder pivots (rotation at shoulder joint) ─────────────────
  const leftShoulderPivot = new THREE.Group();
  leftShoulderPivot.position.set(-0.6, 1.15, 0); // at shoulder
  bodyGroup.add(leftShoulderPivot);

  const lUpperArmGeo = new THREE.CylinderGeometry(0.1, 0.09, 0.5, 6);
  lUpperArmGeo.translate(0, -0.25, 0); // offset so top = pivot origin
  const lUpperArm = new THREE.Mesh(lUpperArmGeo, shirtMat);
  lUpperArm.castShadow = castShadow;
  leftShoulderPivot.add(lUpperArm);

  const lForearmGeo = new THREE.CylinderGeometry(0.08, 0.07, 0.4, 6);
  lForearmGeo.translate(0, -0.2, 0);
  const lForearm = new THREE.Mesh(lForearmGeo, skinMat);
  lForearm.position.y = -0.5;
  lUpperArm.add(lForearm);

  const lHand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.08), skinMat);
  lHand.position.y = -0.4;
  lForearm.add(lHand);

  const rightShoulderPivot = new THREE.Group();
  rightShoulderPivot.position.set(0.6, 1.15, 0);
  bodyGroup.add(rightShoulderPivot);

  const rUpperArmGeo = new THREE.CylinderGeometry(0.1, 0.09, 0.5, 6);
  rUpperArmGeo.translate(0, -0.25, 0);
  const rUpperArm = new THREE.Mesh(rUpperArmGeo, shirtMat);
  rUpperArm.castShadow = castShadow;
  rightShoulderPivot.add(rUpperArm);

  const rForearmGeo = new THREE.CylinderGeometry(0.08, 0.07, 0.4, 6);
  rForearmGeo.translate(0, -0.2, 0);
  const rForearm = new THREE.Mesh(rForearmGeo, skinMat);
  rForearm.position.y = -0.5;
  rUpperArm.add(rForearm);

  const rHand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.08), skinMat);
  rHand.position.y = -0.4;
  rForearm.add(rHand);

  // ── Hip pivots (rotation at hip joint) ───────────────────────────
  const leftHipPivot = new THREE.Group();
  leftHipPivot.position.set(-0.18, 0.88, 0); // at hip (legs extend ~0.89 below)
  group.add(leftHipPivot);

  const lUpperLegGeo = new THREE.CylinderGeometry(0.12, 0.1, 0.45, 6);
  lUpperLegGeo.translate(0, -0.225, 0);
  const lUpperLeg = new THREE.Mesh(lUpperLegGeo, pantsMat);
  lUpperLeg.castShadow = castShadow;
  leftHipPivot.add(lUpperLeg);

  const lLowerLegGeo = new THREE.CylinderGeometry(0.09, 0.08, 0.4, 6);
  lLowerLegGeo.translate(0, -0.2, 0);
  const lLowerLeg = new THREE.Mesh(lLowerLegGeo, pantsMat);
  lLowerLeg.position.y = -0.45;
  lUpperLeg.add(lLowerLeg);

  const lFoot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.22), shoeMat);
  lFoot.position.set(0, -0.4, 0.04);
  lLowerLeg.add(lFoot);

  const rightHipPivot = new THREE.Group();
  rightHipPivot.position.set(0.18, 0.88, 0);
  group.add(rightHipPivot);

  const rUpperLegGeo = new THREE.CylinderGeometry(0.12, 0.1, 0.45, 6);
  rUpperLegGeo.translate(0, -0.225, 0);
  const rUpperLeg = new THREE.Mesh(rUpperLegGeo, pantsMat);
  rUpperLeg.castShadow = castShadow;
  rightHipPivot.add(rUpperLeg);

  const rLowerLegGeo = new THREE.CylinderGeometry(0.09, 0.08, 0.4, 6);
  rLowerLegGeo.translate(0, -0.2, 0);
  const rLowerLeg = new THREE.Mesh(rLowerLegGeo, pantsMat);
  rLowerLeg.position.y = -0.45;
  rUpperLeg.add(rLowerLeg);

  const rFoot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.22), shoeMat);
  rFoot.position.set(0, -0.4, 0.04);
  rLowerLeg.add(rFoot);

  // ── Neck + pivot (for head look-around) ─────────────────────────
  const neckPivot = new THREE.Group();
  neckPivot.position.set(0, 1.35, 0);
  bodyGroup.add(neckPivot);

  // Visible neck cylinder — extends from torso top (y=1.2) to head base
  const neckGeo = new THREE.CylinderGeometry(0.1, 0.15, 0.35, 6);
  neckGeo.translate(0, 0.025, 0);
  const neckMesh = new THREE.Mesh(neckGeo, skinMat);
  neckPivot.add(neckMesh);

  return {
    group,
    leftLeg: leftHipPivot,
    rightLeg: rightHipPivot,
    leftArm: leftShoulderPivot,
    rightArm: rightShoulderPivot,
    torso,
    bodyGroup,
    neckPivot,
    rightHand: rHand,
    rightForearm: rForearm
  };
}

// ── Player ─────────────────────────────────────────────────────────────
export function createPlayer() {
  const root = new THREE.Group();

  const skinColor = 0xffcc99;
  const body = createPlayerBody(0x2266cc, 0x3355aa, true);
  root.add(body.group);

  const headGroup = createPlayerHead(skinColor, {
    hat: true, hatColor: 0x111111,
    sunglasses: true, glassColor: 0xFF00FF,
    hairColor: 0x8a7040
  });
  headGroup.position.set(0, 0.4, 0); // relative to neckPivot
  body.neckPivot.add(headGroup);

  root.scale.set(0.5, 0.625, 0.5);
  root.position.set(86, 0, 86);
  scene.add(root);

  state.player = {
    mesh: root,
    x: 86, y: 0, z: 86,
    leftLeg: body.leftLeg,
    rightLeg: body.rightLeg,
    leftArm: body.leftArm,
    rightArm: body.rightArm,
    torso: body.torso,
    head: headGroup,
    neckPivot: body.neckPivot,
    bodyGroup: body.bodyGroup,
    rightHand: body.rightHand,
    rightForearm: body.rightForearm,
    legPhase: 0,
    idle: {
      timer: 0, phase: 'none',
      breathPhase: 0, weightPhase: 0,
      headLookTimer: 0, headTargetY: 0, headTargetX: 0,
      cigMesh: null, cigGlowMesh: null,
      smokePhase: 'none', smokeTimer: 0, loopCount: 0,
      smokeParticles: []
    }
  };
}

// ── NPCs ──────────────────────────────────────────────────────────────
export async function createNPCs() {
  for (let i = 0; i < NPC_COUNT; i++) {
    if (i > 0 && i % 10 === 0) await yieldFrame();
    const root = new THREE.Group();

    const outfitColor = TROPICAL_OUTFIT_COLORS[Math.floor(Math.random() * TROPICAL_OUTFIT_COLORS.length)];
    const pantsColor = 0x333355 + Math.floor(Math.random() * 0x222222);
    const skinColor = SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)];

    const hasHat = Math.random() < 0.4;
    const hasSunglasses = Math.random() < 0.2;
    const hatColor = [0x882222, 0x228822, 0x222288, 0xaaaaaa, 0x111111][Math.floor(Math.random() * 5)];
    const glassColor = [0x00FFFF, 0xFF00FF, 0xFFFF00, 0x00FF00][Math.floor(Math.random() * 4)];

    const body = createCharacterBody(outfitColor, pantsColor, true, skinColor);
    root.add(body.group);

    const hairColor = NPC_HAIR_COLORS[Math.floor(Math.random() * NPC_HAIR_COLORS.length)];
    const headGroup = createCharacterHead(skinColor, {
      hat: hasHat, hatColor,
      sunglasses: hasSunglasses, glassColor,
      hairColor
    });
    headGroup.position.set(0, 2.2, 0);
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

    nz = Math.min(nz, HALF_CITY - 2);
    root.scale.set(0.5, 0.625, 0.5);
    root.position.set(nx, 0, nz);
    root.rotation.y = dir;
    scene.add(root);

    state.npcs.push({
      mesh: root,
      x: nx, z: nz,
      direction: dir,
      speed: 1.5 + Math.random(),
      leftLeg: body.leftLeg, rightLeg: body.rightLeg,
      leftArm: body.leftArm, rightArm: body.rightArm,
      legPhase: Math.random() * Math.PI * 2,
      waypointDist: 0,
      waypointMax: 30 + Math.random() * 30,
      alive: true,
      respawnTimer: 0,
      horizontal,
      aggressive: false,
      aggroTimer: 0,
      isSitting: false,
      sitTimer: 0,
      seatIndex: -1
    });
  }
}

// ── Gang NPC ──────────────────────────────────────────────────────────
function createGangNPC(x, z, gangInfo, gangIndex) {
  const root = new THREE.Group();

  const skinColor = SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)];
  const pantsColor = 0x1a1a1a + Math.floor(Math.random() * 0x111111);

  const body = createCharacterBody(gangInfo.shirtColor, pantsColor, true, skinColor);
  root.add(body.group);

  const hairColor = NPC_HAIR_COLORS[Math.floor(Math.random() * NPC_HAIR_COLORS.length)];
  const headGroup = createCharacterHead(skinColor, {
    hat: false, sunglasses: Math.random() < 0.5,
    glassColor: gangInfo.shirtColor,
    hairColor
  });
  headGroup.position.set(0, 2.2, 0);
  root.add(headGroup);

  // Bandana on head
  const bandanaMat = new THREE.MeshStandardMaterial({ color: gangInfo.shirtColor });
  const bandana = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.7), bandanaMat);
  bandana.position.set(0, 2.55, 0);
  root.add(bandana);

  // Gun in hand
  const gunMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.5), gunMat);
  gun.position.set(0, -0.05, 0.15);
  body.rightHand.add(gun);

  root.scale.set(0.5, 0.625, 0.5);
  root.position.set(x, 0, z);
  scene.add(root);

  return {
    mesh: root,
    x, z,
    leftLeg: body.leftLeg, rightLeg: body.rightLeg,
    leftArm: body.leftArm, rightArm: body.rightArm,
    legPhase: Math.random() * Math.PI * 2,
    speed: 4 + Math.random(),
    gangIndex,
    shootTimer: 1 + Math.random() * 2,
    ambientTimer: 5 + Math.random() * 10,
    patrolDir: Math.random() * Math.PI * 2,
    patrolDist: 0,
    patrolMax: 15 + Math.random() * 20,
    dead: false,
    respawnTimer: 0,
    alive: true
  };
}

export async function createGangNPCs() {
  for (let gi = 0; gi < GANG_ZONES.length; gi++) {
    if (gi > 0) await yieldFrame();
    const gang = GANG_ZONES[gi];
    for (let i = 0; i < GANG_NPC_PER_ZONE; i++) {
      // Pick random cell from this gang's territory
      const cell = gang.cells[Math.floor(Math.random() * gang.cells.length)];
      const cx = -HALF_CITY + cell[1] * CELL + ROAD / 2 + Math.random() * (CELL - ROAD);
      const cz = -HALF_CITY + cell[0] * CELL + ROAD / 2 + Math.random() * (CELL - ROAD);
      const gnpc = createGangNPC(cx, Math.min(cz, HALF_CITY - 2), gang, gi);
      state.gangNpcs.push(gnpc);
    }
  }
}

// ── Police Officer ─────────────────────────────────────────────────────
export function createPoliceOfficer(x, z) {
  const root = new THREE.Group();

  const body = createCharacterBody(0x000066, 0x000033, true, 0xDEB887);
  root.add(body.group);

  const headGroup = createCharacterHead(0xDEB887, { hat: true, hatColor: 0x000044, hairColor: 0x1a1a1a });
  headGroup.position.set(0, 2.2, 0);
  root.add(headGroup);

  // Gun in hand
  const gunMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.6), gunMat);
  gun.position.set(0, -0.05, 0.15);
  body.rightHand.add(gun);

  root.scale.set(0.5, 0.625, 0.5);
  root.position.set(x, 0, z);
  scene.add(root);

  return {
    mesh: root,
    x, z,
    leftLeg: body.leftLeg, rightLeg: body.rightLeg,
    leftArm: body.leftArm, rightArm: body.rightArm,
    legPhase: 0,
    shootTimer: 1 + Math.random(),
    speed: 5
  };
}
