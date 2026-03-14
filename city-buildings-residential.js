import * as THREE from 'three';
import { scene } from './renderer.js';
import { state } from './state.js';
import { BLOCK, RESIDENTIAL_COLORS } from './constants.js';
import { S } from './city-constants.js';
import { pick, clampToBlock, addBuilding, pushAABB } from './city-helpers.js';
import { registerStaticMesh } from './geometry-merger.js';

// Module-scope materials for geometry merging
const fenceMat = new THREE.MeshStandardMaterial({ color: 0xDDDDDD, roughness: 0.7 });
const escapeMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.6 });
const steepleMat = new THREE.MeshStandardMaterial({ color: 0xFFFFEE, roughness: 0.7 });
const pyramidMat = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.8 });
const crossMat = new THREE.MeshStandardMaterial({ color: 0xFFD700, metalness: 0.6 });
const railMat = new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.5 });

export function createHouse(blockCenterX, blockCenterZ) {
  const count = 1 + Math.floor(Math.random() * 2); // 1-2 houses
  for (let b = 0; b < count; b++) {
    const height = (6 + Math.random() * 4) * S;
    const bw = (8 + Math.random() * 6) * S;
    const bd = (8 + Math.random() * 6) * S;
    const offX = (b === 0 ? -1 : 1) * (BLOCK * 0.15) + (Math.random() - 0.5) * 6;
    const offZ = (Math.random() - 0.5) * (BLOCK * 0.3);
    const bx = blockCenterX + offX;
    const bz = blockCenterZ + offZ;
    const c = clampToBlock(bx, bz, bw, bd, blockCenterX, blockCenterZ);
    const actualW = c.maxX - c.minX, actualD = c.maxZ - c.minZ;
    if (actualW < 6 * S || actualD < 6 * S) continue;
    const cx = (c.minX + c.maxX) / 2, cz = (c.minZ + c.maxZ) / 2;
    const color = pick(RESIDENTIAL_COLORS);

    addBuilding(cx, cz, actualW, height, actualD, color, false);
    pushAABB(cx, cz, actualW, actualD, height);

    // Flat roof cornice (slight overhang, no rotation artifacts)
    const roofColor = 0x8B4513 + Math.floor(Math.random() * 0x222222);
    const roofMat = new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.9 });
    const roof = new THREE.Mesh(new THREE.BoxGeometry(actualW + 1.5, 0.7, actualD + 1.5), roofMat);
    roof.position.set(cx, height + 0.35, cz);
    scene.add(roof);

    // Small fence around base (decorative, no AABB)
    if (Math.random() < 0.5) {
      const fenceH = 1.2;
      // Front and back
      for (const zOff of [-actualD / 2 - 1.5, actualD / 2 + 1.5]) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(actualW + 4, fenceH, 0.15), fenceMat);
        f.position.set(cx, fenceH / 2, cz + zOff);
        scene.add(f);
        registerStaticMesh(f, fenceMat);
      }
      // Sides
      for (const xOff of [-actualW / 2 - 2, actualW / 2 + 2]) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(0.15, fenceH, actualD + 3), fenceMat);
        f.position.set(cx + xOff, fenceH / 2, cz);
        scene.add(f);
        registerStaticMesh(f, fenceMat);
      }
    }
  }
}

// ── Apartment Block ──────────────────────────────────────────────────
export function createApartmentBlock(blockCenterX, blockCenterZ) {
  const h = (20 + Math.random() * 15) * S;
  const w = (14 + Math.random() * 6) * S, d = (12 + Math.random() * 6) * S;
  const color = pick(RESIDENTIAL_COLORS);

  addBuilding(blockCenterX, blockCenterZ, w, h, d, color, true);
  pushAABB(blockCenterX, blockCenterZ, w, d, h);

  // Fire escape zig-zag on side
  const floors = Math.floor(h / 4);
  for (let f = 0; f < floors; f++) {
    const y = 2 + f * 4;
    // Platform
    const plat = new THREE.Mesh(new THREE.BoxGeometry(3, 0.1, 1.5), escapeMat);
    plat.position.set(blockCenterX + w / 2 + 0.8, y, blockCenterZ + (f % 2 === 0 ? -2 : 2));
    scene.add(plat);
    registerStaticMesh(plat, escapeMat);
    // Railing
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1, 1.5), escapeMat);
    rail.position.set(blockCenterX + w / 2 + 2.2, y + 0.5, blockCenterZ + (f % 2 === 0 ? -2 : 2));
    scene.add(rail);
    registerStaticMesh(rail, escapeMat);
  }
}

// ── Church ───────────────────────────────────────────────────────────
export function createChurch(blockCenterX, blockCenterZ) {
  const h = 10 * S, w = 14 * S, d = 20 * S;
  const color = 0xFFF8DC; // cream

  addBuilding(blockCenterX, blockCenterZ, w, h, d, color, false);
  pushAABB(blockCenterX, blockCenterZ, w, d, h);

  // Steeple - tall thin box
  const steeple = new THREE.Mesh(new THREE.BoxGeometry(3 * S, 12 * S, 3 * S), steepleMat);
  steeple.position.set(blockCenterX, h + 6 * S, blockCenterZ - d / 2 + 3 * S);
  scene.add(steeple);
  registerStaticMesh(steeple, steepleMat);

  // Pyramid top
  const pyramidGeo = new THREE.ConeGeometry(2.5 * S, 6 * S, 4);
  const pyramid = new THREE.Mesh(pyramidGeo, pyramidMat);
  pyramid.position.set(blockCenterX, h + 15 * S, blockCenterZ - d / 2 + 3 * S);
  pyramid.rotation.y = Math.PI / 4;
  scene.add(pyramid);
  registerStaticMesh(pyramid, pyramidMat);

  // Cross on top (not AABB) — sits on pyramid tip at h + 18*S
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4, 0.4), crossMat);
  crossV.position.set(blockCenterX, h + 18 * S + 2, blockCenterZ - d / 2 + 3 * S);
  scene.add(crossV);
  registerStaticMesh(crossV, crossMat);
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.4, 0.4), crossMat);
  crossH.position.set(blockCenterX, h + 18 * S + 3, blockCenterZ - d / 2 + 3 * S);
  scene.add(crossH);
  registerStaticMesh(crossH, crossMat);
}

// ── Motel ────────────────────────────────────────────────────────────
export function createMotel(blockCenterX, blockCenterZ) {
  // L-shaped 2-story building
  const h = 8 * S;
  const w1 = 25 * S, d1 = 8 * S;
  addBuilding(blockCenterX, blockCenterZ - 10 * S, w1, h, d1, 0xDEB887, false);
  pushAABB(blockCenterX, blockCenterZ - 10 * S, w1, d1, h);

  const w2 = 8 * S, d2 = 20 * S;
  addBuilding(blockCenterX + 10 * S, blockCenterZ + 2 * S, w2, h, d2, 0xDEB887, false);
  pushAABB(blockCenterX + 10 * S, blockCenterZ + 2 * S, w2, d2, h);

  // Corridor railings (exterior walkway)
  const rail = new THREE.Mesh(new THREE.BoxGeometry(w1 - 2, 0.1, 0.1), railMat);
  rail.position.set(blockCenterX, 4.5 * S, blockCenterZ - 6.1 * S);
  scene.add(rail);
  registerStaticMesh(rail, railMat);

  // "MOTEL" neon sign
  const signMat = new THREE.MeshStandardMaterial({ color: 0x00FFFF, emissive: 0x00FFFF, emissiveIntensity: 3 });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), signMat);
  sign.position.set(blockCenterX - 8 * S, h + 1, blockCenterZ - 14.1 * S);
  scene.add(sign);

  // Vacancy sub-sign
  const vacMat = new THREE.MeshStandardMaterial({ color: 0xFF4444, emissive: 0xFF4444, emissiveIntensity: 2 });
  const vac = new THREE.Mesh(new THREE.PlaneGeometry(5, 1), vacMat);
  vac.position.set(blockCenterX - 8 * S, h - 0.5, blockCenterZ - 14.1 * S);
  scene.add(vac);

  const pl = new THREE.PointLight(0x00FFFF, 2, 20);
  pl.position.set(blockCenterX - 8 * S, h + 1, blockCenterZ - 14 * S);
  pl.castShadow = false;
  scene.add(pl);
  state.neonPointLights.push(pl);
}
