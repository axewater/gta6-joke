import * as THREE from 'three';
import { scene } from './renderer.js';
import { state } from './state.js';
import { BLOCK, NEON_COLORS, GRID, CELL, HALF_CITY, ROAD, CITY_SIZE } from './constants.js';

export function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

export function makeWindowTexture(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#555';
  ctx.fillRect(0, 0, 64, 128);
  const cols = 4, rows = 8, winW = 10, winH = 10;
  const gapX = (64 - cols * winW) / (cols + 1);
  const gapY = (128 - rows * winH) / (rows + 1);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = Math.random() > 0.35;
      ctx.fillStyle = lit ? '#ffeeaa' : '#222';
      ctx.fillRect(gapX + c * (winW + gapX), gapY + r * (winH + gapY), winW, winH);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(w / 10, h / 15);
  return tex;
}

export function makeGarageTexture(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#666';
  ctx.fillRect(0, 0, 64, 128);
  // Horizontal floor-line stripes
  const floors = Math.floor(h / 3);
  for (let f = 0; f < floors; f++) {
    const y = (f / floors) * 128;
    ctx.fillStyle = '#888';
    ctx.fillRect(0, y, 64, 2);
    // openings between pillars
    ctx.fillStyle = '#333';
    ctx.fillRect(8, y + 4, 20, 128 / floors - 8);
    ctx.fillRect(36, y + 4, 20, 128 / floors - 8);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(w / 12, h / 15);
  return tex;
}

export function clampToBlock(bx, bz, bw, bd, blockCenterX, blockCenterZ) {
  const minX = Math.max(bx - bw / 2, blockCenterX - BLOCK / 2 + 1);
  const maxX = Math.min(bx + bw / 2, blockCenterX + BLOCK / 2 - 1);
  const minZ = Math.max(bz - bd / 2, blockCenterZ - BLOCK / 2 + 1);
  const maxZ = Math.min(bz + bd / 2, blockCenterZ + BLOCK / 2 - 1);
  return { minX, maxX, minZ, maxZ };
}

export function addBuilding(cx, cz, w, h, d, color, useWindows, castSh) {
  const mat = useWindows
    ? new THREE.MeshStandardMaterial({ color, map: makeWindowTexture(w, h), roughness: 0.8 })
    : new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
  const roofMat = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
  const geo = new THREE.BoxGeometry(w, h, d);
  const mats = useWindows ? [mat, mat, roofMat, roofMat, mat, mat] : mat;
  const mesh = new THREE.Mesh(geo, mats);
  mesh.position.set(cx, h / 2, cz);
  mesh.castShadow = castSh !== false;
  mesh.receiveShadow = true;
  scene.add(mesh);
  state.buildingMeshes.push(mesh);
  return mesh;
}

export function pushAABB(cx, cz, w, d, height) {
  const minX = cx - w / 2, maxX = cx + w / 2;
  const minZ = cz - d / 2, maxZ = cz + d / 2;
  state.buildings.push({ minX, maxX, minZ, maxZ, height });
  return { minX, maxX, minZ, maxZ };
}

// ── Neon sign helper ────────────────────────────────────────────────────

const neonMats = NEON_COLORS.map(c => new THREE.MeshStandardMaterial({
  color: c, emissive: c, emissiveIntensity: 4.0
}));

export function addNeonSign(cx, cz, w, d, height, bounds, chance) {
  if (Math.random() >= chance) return;
  const neonIdx = Math.floor(Math.random() * NEON_COLORS.length);
  const neonColor = NEON_COLORS[neonIdx];
  const neonGeo = new THREE.PlaneGeometry(w * 0.4, 1.5);
  const neonMat = neonMats[neonIdx];
  const neon = new THREE.Mesh(neonGeo, neonMat);
  const neonY = height * 0.6;
  const face = Math.floor(Math.random() * 4);
  let nx = cx, nz = cz;
  if (face === 0) { nz = bounds.maxZ + 0.05; }
  else if (face === 1) { nz = bounds.minZ - 0.05; }
  else if (face === 2) { nx = bounds.maxX + 0.05; neon.rotation.y = Math.PI / 2; }
  else { nx = bounds.minX - 0.05; neon.rotation.y = Math.PI / 2; }
  neon.position.set(nx, neonY, nz);
  neon.castShadow = false;
  scene.add(neon);
  state.neonSigns.push(neon);

  const pl = new THREE.PointLight(neonColor, 3.5, 25);
  pl.position.set(nx, neonY, nz);
  pl.castShadow = false;
  scene.add(pl);
  state.neonPointLights.push(pl);
}

export function randomSidewalkPos() {
  const roadIdx = Math.floor(Math.random() * (GRID + 1));
  const horizontal = Math.random() > 0.5;
  let x, z;
  if (horizontal) {
    z = -HALF_CITY + roadIdx * CELL + (Math.random() > 0.5 ? 1 : -1) * (ROAD / 2 + 1);
    x = -HALF_CITY + Math.random() * CITY_SIZE;
  } else {
    x = -HALF_CITY + roadIdx * CELL + (Math.random() > 0.5 ? 1 : -1) * (ROAD / 2 + 1);
    z = -HALF_CITY + Math.random() * CITY_SIZE;
  }
  z = Math.min(z, HALF_CITY - 2);
  return { x, z };
}
