import * as THREE from 'three';
import { scene } from './renderer.js';
import { state } from './state.js';
import { BLOCK, BUILDING_COLORS, SHOP_SIGN_COLORS } from './constants.js';
import { S } from './city-constants.js';
import { pick, clampToBlock, addBuilding, pushAABB } from './city-helpers.js';
import { registerStaticMesh } from './geometry-merger.js';

// ── Shared module-scope materials & geometry ────────────────────────
const gasPoleMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.5 });
const gasCanopyMat = new THREE.MeshStandardMaterial({ color: 0xCCCCCC, roughness: 0.5, metalness: 0.3 });
const pumpMat = new THREE.MeshStandardMaterial({ color: 0xEEEEEE, roughness: 0.6 });
const barMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.7 });
const restTableMat = new THREE.MeshStandardMaterial({ color: 0xCCCCCC, roughness: 0.6 });
const restChairMat = new THREE.MeshStandardMaterial({ color: 0xFF4444, roughness: 0.7 });
const restStripeMat = new THREE.MeshStandardMaterial({ color: 0xFFCC00, roughness: 0.5 });
const donutTrimMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.5 });
const donutShopChairMat = new THREE.MeshStandardMaterial({ color: 0xFFB6C1, roughness: 0.7 });
const legGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.8, 6);

export function createShop(blockCenterX, blockCenterZ) {
  const count = 2 + Math.floor(Math.random() * 2); // 2-3 shops per block
  for (let b = 0; b < count; b++) {
    const height = (8 + Math.random() * 7) * S;
    const bw = (12 + Math.random() * 10) * S;
    const bd = (10 + Math.random() * 8) * S;
    const offX = (b - count / 2) * (BLOCK / count) + (Math.random() - 0.5) * 6;
    const offZ = (Math.random() - 0.5) * (BLOCK * 0.4);
    const bx = blockCenterX + offX;
    const bz = blockCenterZ + offZ;
    const c = clampToBlock(bx, bz, bw, bd, blockCenterX, blockCenterZ);
    const actualW = c.maxX - c.minX, actualD = c.maxZ - c.minZ;
    if (actualW < 6 * S || actualD < 6 * S) continue;
    const cx = (c.minX + c.maxX) / 2, cz = (c.minZ + c.maxZ) / 2;
    const color = pick(BUILDING_COLORS);

    addBuilding(cx, cz, actualW, height, actualD, color, true);
    pushAABB(cx, cz, actualW, actualD, height);

    // Awning (decorative, no AABB)
    const awningMat = new THREE.MeshStandardMaterial({ color: pick(SHOP_SIGN_COLORS), roughness: 0.6 });
    const awning = new THREE.Mesh(new THREE.BoxGeometry(actualW * 0.8, 0.2, 2.5), awningMat);
    awning.position.set(cx, height * 0.55, c.maxZ + 1.2);
    scene.add(awning);

    // Emissive shop sign on front
    const signColor = pick(SHOP_SIGN_COLORS);
    const signMat = new THREE.MeshStandardMaterial({ color: signColor, emissive: signColor, emissiveIntensity: 2.0 });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(actualW * 0.5, 1.2), signMat);
    sign.position.set(cx, height * 0.75, c.maxZ + 0.06);
    scene.add(sign);

    // Billboard on top (20% chance)
    if (Math.random() < 0.2) {
      const bbColor = pick(SHOP_SIGN_COLORS);
      const bbMat = new THREE.MeshStandardMaterial({ color: bbColor, emissive: bbColor, emissiveIntensity: 1.5 });
      const bb = new THREE.Mesh(new THREE.PlaneGeometry(actualW * 0.7, 4), bbMat);
      bb.position.set(cx, height + 2.5, c.maxZ + 0.06);
      scene.add(bb);
    }
  }
}

// ── Gas Station ──────────────────────────────────────────────────────
export function createGasStation(blockCenterX, blockCenterZ) {
  // Flat canopy on 4 poles
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(20 * S, 0.4, 12 * S), gasCanopyMat);
  canopy.position.set(blockCenterX, 4 * S, blockCenterZ - 5 * S);
  canopy.castShadow = true;
  scene.add(canopy);
  registerStaticMesh(canopy, gasCanopyMat);

  // 4 poles
  const poleGeo = new THREE.CylinderGeometry(0.2, 0.2, 4 * S, 6);
  for (const [px, pz] of [[-8, -10], [8, -10], [-8, 0], [8, 0]]) {
    const pole = new THREE.Mesh(poleGeo, gasPoleMat);
    pole.position.set(blockCenterX + px * S, 2 * S, blockCenterZ + pz * S);
    scene.add(pole);
    registerStaticMesh(pole, gasPoleMat);
  }

  // Small shop building
  const shopW = 10 * S, shopH = 5 * S, shopD = 8 * S;
  const shopMat = new THREE.MeshStandardMaterial({ color: 0xCC3333, roughness: 0.7 });
  const shop = new THREE.Mesh(new THREE.BoxGeometry(shopW, shopH, shopD), shopMat);
  shop.position.set(blockCenterX, shopH / 2, blockCenterZ + 15 * S);
  shop.castShadow = true;
  scene.add(shop);
  state.buildingMeshes.push(shop);
  pushAABB(blockCenterX, blockCenterZ + 15 * S, shopW, shopD, shopH);

  // Gas pumps
  for (let p = 0; p < 3; p++) {
    const pump = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 0.8), pumpMat);
    pump.position.set(blockCenterX - 6 * S + p * 6 * S, 1, blockCenterZ - 5 * S);
    scene.add(pump);
    registerStaticMesh(pump, pumpMat);
    pushAABB(blockCenterX - 6 * S + p * 6 * S, blockCenterZ - 5 * S, 1, 0.8, 2);
  }

  // Sign
  const signMat = new THREE.MeshStandardMaterial({ color: 0xFF4444, emissive: 0xFF2222, emissiveIntensity: 2 });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 2), signMat);
  sign.position.set(blockCenterX, 6 * S, blockCenterZ + 19.1 * S);
  scene.add(sign);
}

// ── Liquor Store ─────────────────────────────────────────────────────
export function createLiquorStore(blockCenterX, blockCenterZ) {
  const w = 12 * S, h = 6 * S, d = 10 * S;
  const color = 0x8B7355;
  addBuilding(blockCenterX, blockCenterZ, w, h, d, color, false);
  pushAABB(blockCenterX, blockCenterZ, w, d, h);

  // Neon "LIQUOR" sign
  const signMat = new THREE.MeshStandardMaterial({ color: 0xFF1493, emissive: 0xFF1493, emissiveIntensity: 3 });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.5), signMat);
  sign.position.set(blockCenterX, h * 0.8, blockCenterZ + d / 2 + 0.06);
  scene.add(sign);

  // Window bars
  for (let b = 0; b < 4; b++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3, 0.1), barMat);
    bar.position.set(blockCenterX - 3 + b * 2, 2, blockCenterZ + d / 2 + 0.1);
    scene.add(bar);
    registerStaticMesh(bar, barMat);
  }

  // Neon light
  const pl = new THREE.PointLight(0xFF1493, 2, 20);
  pl.position.set(blockCenterX, h, blockCenterZ + d / 2 + 1);
  pl.castShadow = false;
  scene.add(pl);
  state.neonPointLights.push(pl);
}

// ── Restaurant (McDonald's-like) ─────────────────────────────────────
export function createRestaurant(blockCenterX, blockCenterZ) {
  const w = 10 * S, h = 6 * S, d = 12 * S;
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xCC2222, roughness: 0.7 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
  mesh.position.set(blockCenterX, h / 2, blockCenterZ);
  mesh.castShadow = true;
  scene.add(mesh);
  state.buildingMeshes.push(mesh);
  pushAABB(blockCenterX, blockCenterZ, w, d, h);

  // Yellow accent stripe
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 1, d + 0.1), restStripeMat);
  stripe.position.set(blockCenterX, h - 0.5, blockCenterZ);
  scene.add(stripe);
  registerStaticMesh(stripe, restStripeMat);

  // Golden "M" sign on front (3 yellow boxes forming M shape)
  const mMat = new THREE.MeshStandardMaterial({ color: 0xFFD700, emissive: 0xFFD700, emissiveIntensity: 2 });
  // Left leg of M
  const mL = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3, 0.2), mMat);
  mL.position.set(blockCenterX - 1.2, 4, blockCenterZ + d / 2 + 0.15);
  scene.add(mL);
  // Right leg of M
  const mR = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3, 0.2), mMat);
  mR.position.set(blockCenterX + 1.2, 4, blockCenterZ + d / 2 + 0.15);
  scene.add(mR);
  // Center peak of M
  const mC = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2, 0.2), mMat);
  mC.position.set(blockCenterX, 4.5, blockCenterZ + d / 2 + 0.15);
  scene.add(mC);

  // Emissive sign board on top
  const signMat = new THREE.MeshStandardMaterial({ color: 0xFF4444, emissive: 0xFF2222, emissiveIntensity: 2 });
  const signBoard = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, 2, 0.3), signMat);
  signBoard.position.set(blockCenterX, h + 1.5, blockCenterZ + d / 2 + 0.2);
  scene.add(signBoard);

  // Outdoor seating — tables on one side
  for (let t = 0; t < 5; t++) {
    const tx = blockCenterX - 8 * S + t * 4 * S;
    const tz = blockCenterZ + d / 2 + 4;

    // Table top
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 1.5), restTableMat);
    top.position.set(tx, 0.85, tz);
    scene.add(top);
    registerStaticMesh(top, restTableMat);
    // Table leg
    const leg = new THREE.Mesh(legGeo, restTableMat);
    leg.position.set(tx, 0.4, tz);
    scene.add(leg);
    registerStaticMesh(leg, restTableMat);

    // 2 chairs
    for (const cz of [tz - 1.2, tz + 1.2]) {
      const chair = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.6), restChairMat);
      chair.position.set(tx, 0.5, cz);
      scene.add(chair);
      registerStaticMesh(chair, restChairMat);

      // Register seat
      state.restaurantSeats.push({
        x: tx, z: cz, tableX: tx, tableZ: tz, occupied: false
      });
    }
  }
}

// ── Donut Shop ───────────────────────────────────────────────────────
export function createDonutShop(blockCenterX, blockCenterZ) {
  const w = 8 * S, h = 5 * S, d = 9 * S;
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xFFB6C1, roughness: 0.7 }); // pink
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
  mesh.position.set(blockCenterX, h / 2, blockCenterZ);
  mesh.castShadow = true;
  scene.add(mesh);
  state.buildingMeshes.push(mesh);
  pushAABB(blockCenterX, blockCenterZ, w, d, h);

  // White trim
  const trim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.5, d + 0.1), donutTrimMat);
  trim.position.set(blockCenterX, h, blockCenterZ);
  scene.add(trim);
  registerStaticMesh(trim, donutTrimMat);

  // Giant donut on roof
  const donutGeo = new THREE.TorusGeometry(3 * S, 1.2 * S, 12, 24);
  const donutMat = new THREE.MeshStandardMaterial({ color: 0xFF69B4, roughness: 0.4 }); // pink frosting
  const donut = new THREE.Mesh(donutGeo, donutMat);
  donut.position.set(blockCenterX, h + 4 * S, blockCenterZ);
  donut.rotation.y = Math.PI / 2;
  scene.add(donut);

  // Brown base of donut
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.6 });
  const donutBase = new THREE.Mesh(new THREE.TorusGeometry(3 * S, 1.0 * S, 12, 24), baseMat);
  donutBase.position.set(blockCenterX, h + 3.8 * S, blockCenterZ);
  donutBase.rotation.y = Math.PI / 2;
  scene.add(donutBase);

  // Neon "DONUTS" sign
  const signMat = new THREE.MeshStandardMaterial({ color: 0xFF00FF, emissive: 0xFF00FF, emissiveIntensity: 3 });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.2), signMat);
  sign.position.set(blockCenterX, h * 0.7, blockCenterZ + d / 2 + 0.06);
  scene.add(sign);

  const pl = new THREE.PointLight(0xFF00FF, 2, 20);
  pl.position.set(blockCenterX, h, blockCenterZ + d / 2 + 1);
  pl.castShadow = false;
  scene.add(pl);
  state.neonPointLights.push(pl);

  // Outdoor tables with seats
  for (let t = 0; t < 3; t++) {
    const tx = blockCenterX - 4 * S + t * 4 * S;
    const tz = blockCenterZ + d / 2 + 4;

    const top = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 1.5), restTableMat);
    top.position.set(tx, 0.85, tz);
    scene.add(top);
    registerStaticMesh(top, restTableMat);
    const leg = new THREE.Mesh(legGeo, restTableMat);
    leg.position.set(tx, 0.4, tz);
    scene.add(leg);
    registerStaticMesh(leg, restTableMat);

    for (const cz of [tz - 1.2, tz + 1.2]) {
      const chair = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.6), donutShopChairMat);
      chair.position.set(tx, 0.5, cz);
      scene.add(chair);
      registerStaticMesh(chair, donutShopChairMat);

      state.restaurantSeats.push({
        x: tx, z: cz, tableX: tx, tableZ: tz, occupied: false
      });
    }
  }
}
