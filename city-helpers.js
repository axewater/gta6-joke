import * as THREE from 'three';
import { scene } from './renderer.js';
import { state } from './state.js';
import { BLOCK, NEON_COLORS, GRID, CELL, HALF_CITY, ROAD, CITY_SIZE } from './constants.js';
import { registerStaticMesh } from './geometry-merger.js';

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
  tex.repeat.set(w / 20, h / 30);
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

// Material pool for non-windowed buildings — keyed by color hex
const buildingMatPool = new Map();
function getPooledBuildingMat(color) {
  const key = typeof color === 'number' ? color : color;
  if (!buildingMatPool.has(key)) {
    buildingMatPool.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.85 }));
  }
  return buildingMatPool.get(key);
}

// Door materials (module-scope, shared across all buildings)
const doorDarkMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5 });
const doorFrameMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.6 });
const doorGlassMat = new THREE.MeshStandardMaterial({
  color: 0x88ccff, emissive: 0x88ccff, emissiveIntensity: 0.3,
  metalness: 0.5, roughness: 0.2
});
const awningColors = [0xcc3333, 0x3366cc, 0x33aa55, 0xccaa33, 0x9933cc];

export function addBuilding(cx, cz, w, h, d, color, useWindows, castSh) {
  const mat = useWindows
    ? new THREE.MeshStandardMaterial({ color, map: makeWindowTexture(w, h), roughness: 0.8 })
    : getPooledBuildingMat(color);
  const roofMat = useWindows ? new THREE.MeshStandardMaterial({ color, roughness: 0.9 }) : null;
  const geo = new THREE.BoxGeometry(w, h, d);
  const mats = useWindows ? [mat, mat, roofMat, roofMat, mat, mat] : mat;
  const mesh = new THREE.Mesh(geo, mats);
  mesh.position.set(cx, h / 2, cz);
  mesh.castShadow = castSh !== false;
  mesh.receiveShadow = true;
  scene.add(mesh);
  state.buildingMeshes.push(mesh);

  // Auto-register non-windowed buildings for geometry merging
  if (!useWindows) {
    registerStaticMesh(mesh, mat);
  }

  // ── Door at ground level on +Z face ──────────────────────────────────
  if ((useWindows || h > 6) && w >= 4 && d >= 4) {
    const doorW = Math.min(3.0, w * 0.2);
    const doorH = Math.min(4.0, h * 0.3);
    const doorZ = cz + d / 2 + 0.06;
    const roll = Math.random();

    if (roll < 0.4) {
      // Style 1: Simple dark rectangle (40%)
      const doorGeo = new THREE.PlaneGeometry(doorW, doorH);
      const door = new THREE.Mesh(doorGeo, doorDarkMat);
      door.position.set(cx, doorH / 2, doorZ);
      scene.add(door);
      registerStaticMesh(door, doorDarkMat);
    } else if (roll < 0.7) {
      // Style 2: Detailed door with frame + awning (30%)
      const doorGeo = new THREE.PlaneGeometry(doorW, doorH);
      const door = new THREE.Mesh(doorGeo, doorDarkMat);
      door.position.set(cx, doorH / 2, doorZ);
      scene.add(door);
      registerStaticMesh(door, doorDarkMat);

      const frameThick = 0.15;
      // Top frame
      const topGeo = new THREE.BoxGeometry(doorW + frameThick * 2, frameThick, frameThick);
      const topFrame = new THREE.Mesh(topGeo, doorFrameMat);
      topFrame.position.set(cx, doorH + frameThick / 2, doorZ);
      scene.add(topFrame);
      registerStaticMesh(topFrame, doorFrameMat);

      // Left frame
      const sideGeo = new THREE.BoxGeometry(frameThick, doorH, frameThick);
      const leftFrame = new THREE.Mesh(sideGeo, doorFrameMat);
      leftFrame.position.set(cx - doorW / 2 - frameThick / 2, doorH / 2, doorZ);
      scene.add(leftFrame);
      registerStaticMesh(leftFrame, doorFrameMat);

      // Right frame
      const rightFrame = new THREE.Mesh(sideGeo, doorFrameMat);
      rightFrame.position.set(cx + doorW / 2 + frameThick / 2, doorH / 2, doorZ);
      scene.add(rightFrame);
      registerStaticMesh(rightFrame, doorFrameMat);

      // Awning/overhang
      const awningColor = awningColors[Math.floor(Math.random() * awningColors.length)];
      const awningMat = new THREE.MeshStandardMaterial({ color: awningColor, roughness: 0.7 });
      const awningGeo = new THREE.BoxGeometry(doorW + 1.5, 0.2, 1.2);
      const awning = new THREE.Mesh(awningGeo, awningMat);
      awning.position.set(cx, doorH + 0.5, doorZ + 0.5);
      scene.add(awning);
      registerStaticMesh(awning, awningMat);
    } else {
      // Style 3: Glass entrance (30%, only for tall buildings)
      if (h > 15) {
        const glassDoorW = doorW * 1.3;
        const doorGeo = new THREE.PlaneGeometry(glassDoorW, doorH);
        const door = new THREE.Mesh(doorGeo, doorGlassMat);
        door.position.set(cx, doorH / 2, doorZ);
        scene.add(door);
        registerStaticMesh(door, doorGlassMat);
      } else {
        // Fallback to simple dark door for short buildings
        const doorGeo = new THREE.PlaneGeometry(doorW, doorH);
        const door = new THREE.Mesh(doorGeo, doorDarkMat);
        door.position.set(cx, doorH / 2, doorZ);
        scene.add(door);
        registerStaticMesh(door, doorDarkMat);
      }
    }
  }

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
