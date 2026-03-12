import * as THREE from 'three';
import { scene } from './renderer.js';
import { state } from './state.js';
import {
  GRID, BLOCK, ROAD, CELL, CITY_SIZE, HALF_CITY,
  BUILDING_COLORS, NEON_COLORS,
  DOWNTOWN_COLORS, RESIDENTIAL_COLORS, INDUSTRIAL_COLORS, SHOP_SIGN_COLORS,
  RAMP_WIDTH, RAMP_LENGTH, RAMP_HEIGHT
} from './constants.js';

// ── District Map ────────────────────────────────────────────────────────
// row = gi (north→south), col = gj (west→east)
const DISTRICT_MAP = [
  ['IND','IND','IND','COM','COM','COM','COM','RES','RES','RES'],
  ['IND','IND','COM','COM','COM','COM','RES','RES','RES','RES'],
  ['COM','COM','COM','DT', 'DT', 'DT', 'COM','COM','RES','RES'],
  ['COM','COM','DT', 'DT', 'DT', 'DT', 'DT', 'COM','COM','PARK'],
  ['COM','COM','DT', 'DT', 'DT', 'DT', 'DT', 'COM','COM','COM'],
  ['COM','PARK','DT','DT', 'DT', 'DT', 'COM','COM','COM','COM'],
  ['RES','COM','COM','COM','COM','COM','COM','COM','COM','RES'],
  ['RES','RES','COM','COM','PARK','COM','COM','COM','RES','RES'],
  ['RES','RES','RES','COM','COM','COM','COM','RES','RES','RES'],
  ['RES','RES','RES','RES','COM','COM','RES','RES','RES','RES'],
];

// Some commercial blocks become parking lots (fixed positions)
const PARKING_LOT_CELLS = [[1,2],[6,3],[8,5]];
function isParkingLot(gi, gj) {
  return PARKING_LOT_CELLS.some(([r,c]) => r === gi && c === gj);
}

function getDistrict(gi, gj) {
  if (isParkingLot(gi, gj)) return 'LOT';
  return DISTRICT_MAP[gi][gj];
}

// ── Shared Helpers ──────────────────────────────────────────────────────

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function makeWindowTexture(w, h) {
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

function makeGarageTexture(w, h) {
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

function clampToBlock(bx, bz, bw, bd, blockCenterX, blockCenterZ) {
  const minX = Math.max(bx - bw / 2, blockCenterX - BLOCK / 2 + 1);
  const maxX = Math.min(bx + bw / 2, blockCenterX + BLOCK / 2 - 1);
  const minZ = Math.max(bz - bd / 2, blockCenterZ - BLOCK / 2 + 1);
  const maxZ = Math.min(bz + bd / 2, blockCenterZ + BLOCK / 2 - 1);
  return { minX, maxX, minZ, maxZ };
}

function addBuilding(cx, cz, w, h, d, color, useWindows, castSh) {
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

function pushAABB(cx, cz, w, d, height) {
  const minX = cx - w / 2, maxX = cx + w / 2;
  const minZ = cz - d / 2, maxZ = cz + d / 2;
  state.buildings.push({ minX, maxX, minZ, maxZ, height });
  return { minX, maxX, minZ, maxZ };
}

// ── Neon sign helper ────────────────────────────────────────────────────

const neonMats = NEON_COLORS.map(c => new THREE.MeshStandardMaterial({
  color: c, emissive: c, emissiveIntensity: 4.0
}));

function addNeonSign(cx, cz, w, d, height, bounds, chance) {
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

// ── Building Type Generators ────────────────────────────────────────────

function createSkyscraper(blockCenterX, blockCenterZ) {
  const count = 2 + Math.floor(Math.random() * 3); // 2-4
  for (let b = 0; b < count; b++) {
    const height = 50 + Math.random() * 40;
    const bw = 12 + Math.random() * (BLOCK / count - 16);
    const bd = 12 + Math.random() * (BLOCK / count - 16);
    const offX = (b % 2) * (BLOCK / 2 - bw / 2) - (BLOCK / 4 - bw / 4) + (Math.random() - 0.5) * 4;
    const offZ = Math.floor(b / 2) * (BLOCK / 2 - bd / 2) - (BLOCK / 4 - bd / 4) + (Math.random() - 0.5) * 4;
    const bx = blockCenterX + offX;
    const bz = blockCenterZ + offZ;
    const c = clampToBlock(bx, bz, bw, bd, blockCenterX, blockCenterZ);
    const actualW = c.maxX - c.minX, actualD = c.maxZ - c.minZ;
    if (actualW < 8 || actualD < 8) continue;
    const cx = (c.minX + c.maxX) / 2, cz = (c.minZ + c.maxZ) / 2;
    const color = pick(DOWNTOWN_COLORS);

    addBuilding(cx, cz, actualW, height, actualD, color, true);
    const bounds = pushAABB(cx, cz, actualW, actualD, height);

    // Antenna/spire on top (decorative)
    const antennaMat = new THREE.MeshStandardMaterial({ color: 0xAAAAAA, metalness: 0.8, roughness: 0.3 });
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.3, 8, 6), antennaMat);
    antenna.position.set(cx, height + 4, cz);
    scene.add(antenna);

    // Penthouse setback (30% chance) — smaller box on top, adds 2nd AABB
    if (Math.random() < 0.3) {
      const phW = actualW * 0.5, phD = actualD * 0.5, phH = 8 + Math.random() * 6;
      addBuilding(cx, cz, phW, phH, phD, color, true);
      // position it on top
      state.buildingMeshes[state.buildingMeshes.length - 1].position.y = height + phH / 2;
      pushAABB(cx, cz, phW, phD, height + phH);
    }

    // Neon — 50% chance downtown
    addNeonSign(cx, cz, actualW, actualD, height, bounds, 0.5);
  }
}

function createLShapedBuilding(blockCenterX, blockCenterZ, colors, isDowntown) {
  const height = 20 + Math.random() * 30;
  const color = pick(colors);
  // First box (horizontal bar of L)
  const w1 = BLOCK * 0.6, d1 = BLOCK * 0.3;
  const cx1 = blockCenterX - BLOCK * 0.1, cz1 = blockCenterZ - BLOCK * 0.15;
  addBuilding(cx1, cz1, w1, height, d1, color, true);
  const b1 = pushAABB(cx1, cz1, w1, d1, height);
  // Second box (vertical bar of L)
  const w2 = BLOCK * 0.3, d2 = BLOCK * 0.6;
  const cx2 = blockCenterX - BLOCK * 0.25, cz2 = blockCenterZ + BLOCK * 0.1;
  addBuilding(cx2, cz2, w2, height, d2, color, true);
  pushAABB(cx2, cz2, w2, d2, height);

  addNeonSign(cx1, cz1, w1, d1, height, b1, isDowntown ? 0.5 : 0.3);
}

function createShop(blockCenterX, blockCenterZ) {
  const count = 2 + Math.floor(Math.random() * 2); // 2-3 shops per block
  for (let b = 0; b < count; b++) {
    const height = 8 + Math.random() * 7;
    const bw = 12 + Math.random() * 10;
    const bd = 10 + Math.random() * 8;
    const offX = (b - count / 2) * (BLOCK / count) + (Math.random() - 0.5) * 6;
    const offZ = (Math.random() - 0.5) * (BLOCK * 0.4);
    const bx = blockCenterX + offX;
    const bz = blockCenterZ + offZ;
    const c = clampToBlock(bx, bz, bw, bd, blockCenterX, blockCenterZ);
    const actualW = c.maxX - c.minX, actualD = c.maxZ - c.minZ;
    if (actualW < 6 || actualD < 6) continue;
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

function createHouse(blockCenterX, blockCenterZ) {
  const count = 1 + Math.floor(Math.random() * 2); // 1-2 houses
  for (let b = 0; b < count; b++) {
    const height = 6 + Math.random() * 4;
    const bw = 8 + Math.random() * 6;
    const bd = 8 + Math.random() * 6;
    const offX = (b === 0 ? -1 : 1) * (BLOCK * 0.15) + (Math.random() - 0.5) * 6;
    const offZ = (Math.random() - 0.5) * (BLOCK * 0.3);
    const bx = blockCenterX + offX;
    const bz = blockCenterZ + offZ;
    const c = clampToBlock(bx, bz, bw, bd, blockCenterX, blockCenterZ);
    const actualW = c.maxX - c.minX, actualD = c.maxZ - c.minZ;
    if (actualW < 6 || actualD < 6) continue;
    const cx = (c.minX + c.maxX) / 2, cz = (c.minZ + c.maxZ) / 2;
    const color = pick(RESIDENTIAL_COLORS);

    addBuilding(cx, cz, actualW, height, actualD, color, false);
    pushAABB(cx, cz, actualW, actualD, height);

    // Peaked roof accent (decorative rotated box)
    const roofColor = 0x8B4513 + Math.floor(Math.random() * 0x222222);
    const roofMat = new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.9 });
    const roofGeo = new THREE.BoxGeometry(actualW + 1, actualD * 0.7, actualD + 1);
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.set(cx, height + actualD * 0.2, cz);
    roof.rotation.z = Math.PI / 4;
    roof.scale.set(1, 0.3, 1);
    scene.add(roof);

    // Small fence around base (decorative, no AABB)
    if (Math.random() < 0.5) {
      const fenceMat = new THREE.MeshStandardMaterial({ color: 0xDDDDDD, roughness: 0.7 });
      const fenceH = 1.2;
      // Front and back
      for (const zOff of [-actualD / 2 - 1.5, actualD / 2 + 1.5]) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(actualW + 4, fenceH, 0.15), fenceMat);
        f.position.set(cx, fenceH / 2, cz + zOff);
        scene.add(f);
      }
      // Sides
      for (const xOff of [-actualW / 2 - 2, actualW / 2 + 2]) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(0.15, fenceH, actualD + 3), fenceMat);
        f.position.set(cx + xOff, fenceH / 2, cz);
        scene.add(f);
      }
    }
  }
}

function createWarehouse(blockCenterX, blockCenterZ) {
  const height = 8 + Math.random() * 10;
  const bw = BLOCK * 0.7 + Math.random() * (BLOCK * 0.2);
  const bd = BLOCK * 0.6 + Math.random() * (BLOCK * 0.2);
  const cx = blockCenterX + (Math.random() - 0.5) * 4;
  const cz = blockCenterZ + (Math.random() - 0.5) * 4;
  const c = clampToBlock(cx, cz, bw, bd, blockCenterX, blockCenterZ);
  const actualW = c.maxX - c.minX, actualD = c.maxZ - c.minZ;
  if (actualW < 10 || actualD < 10) return;
  const fcx = (c.minX + c.maxX) / 2, fcz = (c.minZ + c.maxZ) / 2;
  const color = pick(INDUSTRIAL_COLORS);

  // No window texture for warehouses — metallic look
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.4 });
  const geo = new THREE.BoxGeometry(actualW, height, actualD);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(fcx, height / 2, fcz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  state.buildingMeshes.push(mesh);
  pushAABB(fcx, fcz, actualW, actualD, height);

  // Rolling door detail (darker inset rectangle on front face)
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5, metalness: 0.6 });
  const doorW = Math.min(8, actualW * 0.4);
  const doorH = Math.min(6, height * 0.7);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(doorW, doorH), doorMat);
  door.position.set(fcx, doorH / 2, c.maxZ + 0.06);
  scene.add(door);

  // Dumpster next to warehouse
  if (Math.random() < 0.6) {
    const dumpMat = new THREE.MeshStandardMaterial({ color: 0x336633, roughness: 0.8 });
    const dumpW = 2, dumpH = 1.5, dumpD = 1.5;
    const dx = c.maxX + 0.5 < blockCenterX + BLOCK / 2 ? c.maxX - 1.5 : c.minX + 1.5;
    const dz = c.maxZ + 2;
    const dump = new THREE.Mesh(new THREE.BoxGeometry(dumpW, dumpH, dumpD), dumpMat);
    dump.position.set(dx, dumpH / 2, Math.min(dz, blockCenterZ + BLOCK / 2 - 1));
    scene.add(dump);
    // Small AABB for dumpster
    pushAABB(dx, Math.min(dz, blockCenterZ + BLOCK / 2 - 1), dumpW, dumpD, dumpH);
  }
}

function createParkingGarage(blockCenterX, blockCenterZ) {
  const height = 15 + Math.random() * 10;
  const bw = BLOCK * 0.6, bd = BLOCK * 0.5;
  const cx = blockCenterX, cz = blockCenterZ;
  const c = clampToBlock(cx, cz, bw, bd, blockCenterX, blockCenterZ);
  const actualW = c.maxX - c.minX, actualD = c.maxZ - c.minZ;
  if (actualW < 10 || actualD < 10) return;
  const fcx = (c.minX + c.maxX) / 2, fcz = (c.minZ + c.maxZ) / 2;
  const color = 0x888888;

  const garageTex = makeGarageTexture(actualW, height);
  const mat = new THREE.MeshStandardMaterial({ color, map: garageTex, roughness: 0.7 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.9 });
  const geo = new THREE.BoxGeometry(actualW, height, actualD);
  const mats = [mat, mat, roofMat, roofMat, mat, mat];
  const mesh = new THREE.Mesh(geo, mats);
  mesh.position.set(fcx, height / 2, fcz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  state.buildingMeshes.push(mesh);
  pushAABB(fcx, fcz, actualW, actualD, height);
}

function createParkingLot(blockCenterX, blockCenterZ) {
  // Flat gray surface
  const lotMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.85 });
  const lot = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK - 4, BLOCK - 4), lotMat);
  lot.rotation.x = -Math.PI / 2;
  lot.position.set(blockCenterX, 0.04, blockCenterZ);
  lot.receiveShadow = true;
  scene.add(lot);

  // White line markings
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xEEEEEE, roughness: 0.5 });
  const numSpaces = 6;
  const spacing = (BLOCK - 8) / numSpaces;
  for (let i = 0; i <= numSpaces; i++) {
    const lx = blockCenterX - (BLOCK - 8) / 2 + i * spacing;
    // Top row
    const line1 = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 8), lineMat);
    line1.rotation.x = -Math.PI / 2;
    line1.position.set(lx, 0.05, blockCenterZ - BLOCK * 0.2);
    scene.add(line1);
    // Bottom row
    const line2 = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 8), lineMat);
    line2.rotation.x = -Math.PI / 2;
    line2.position.set(lx, 0.05, blockCenterZ + BLOCK * 0.2);
    scene.add(line2);
  }
  // No AABB — open driving space
}

// ── Park Generation ─────────────────────────────────────────────────────

function createPark(blockCenterX, blockCenterZ) {
  state.parks.push({ cx: blockCenterX, cz: blockCenterZ });

  // Green ground plane
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x228B22, roughness: 0.95 });
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK, BLOCK), grassMat);
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(blockCenterX, 0.06, blockCenterZ);
  grass.receiveShadow = true;
  scene.add(grass);

  // Walking paths — lighter strips
  const pathMat = new THREE.MeshStandardMaterial({ color: 0xC8B88A, roughness: 0.8 });
  // Horizontal path
  const path1 = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK * 0.8, 3), pathMat);
  path1.rotation.x = -Math.PI / 2;
  path1.position.set(blockCenterX, 0.07, blockCenterZ);
  scene.add(path1);
  // Vertical path
  const path2 = new THREE.Mesh(new THREE.PlaneGeometry(3, BLOCK * 0.8), pathMat);
  path2.rotation.x = -Math.PI / 2;
  path2.position.set(blockCenterX, 0.07, blockCenterZ);
  scene.add(path2);
  // Diagonal path
  const path3 = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK * 0.9, 2.5), pathMat);
  path3.rotation.x = -Math.PI / 2;
  path3.rotation.z = Math.PI / 4;
  path3.position.set(blockCenterX, 0.07, blockCenterZ);
  scene.add(path3);

  // Trees — mix of palm and deciduous
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8B6914, roughness: 0.9 });
  const palmCanopyMat = new THREE.MeshStandardMaterial({ color: 0x228B22, roughness: 0.8 });
  const decidCanopyMat = new THREE.MeshStandardMaterial({ color: 0x2E8B57, roughness: 0.8 });

  const treeCount = 6 + Math.floor(Math.random() * 5);
  for (let t = 0; t < treeCount; t++) {
    const tx = blockCenterX + (Math.random() - 0.5) * (BLOCK * 0.8);
    const tz = blockCenterZ + (Math.random() - 0.5) * (BLOCK * 0.8);
    const group = new THREE.Group();

    if (Math.random() < 0.4) {
      // Palm tree
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, 6, 8), trunkMat);
      trunk.position.y = 3;
      group.add(trunk);
      const canopy = new THREE.Mesh(new THREE.SphereGeometry(2.5, 8, 6), palmCanopyMat);
      canopy.position.y = 6.5;
      canopy.scale.set(1, 0.5, 1);
      group.add(canopy);
    } else {
      // Deciduous tree (sphere canopy + thicker trunk)
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 5, 8), trunkMat);
      trunk.position.y = 2.5;
      group.add(trunk);
      const canopy = new THREE.Mesh(new THREE.SphereGeometry(3, 8, 8), decidCanopyMat);
      canopy.position.y = 6;
      group.add(canopy);
    }
    group.rotation.x = (Math.random() - 0.5) * 0.05;
    group.rotation.z = (Math.random() - 0.5) * 0.05;
    group.position.set(tx, 0, tz);
    scene.add(group);
  }

  // Fountain (center)
  const fountainMat = new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.4, metalness: 0.3 });
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x4499CC, roughness: 0.1, metalness: 0.5, transparent: true, opacity: 0.7
  });
  // Base cylinder
  const base = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.5, 1, 16), fountainMat);
  base.position.set(blockCenterX, 0.5, blockCenterZ);
  scene.add(base);
  // Water pool
  const pool = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.8, 0.3, 16), waterMat);
  pool.position.set(blockCenterX, 1.15, blockCenterZ);
  scene.add(pool);
  // Center column
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 3, 8), fountainMat);
  column.position.set(blockCenterX, 2.5, blockCenterZ);
  scene.add(column);
  // Top sphere (water spray effect)
  const sprayMat = new THREE.MeshStandardMaterial({
    color: 0xAADDFF, emissive: 0x4499CC, emissiveIntensity: 0.3,
    transparent: true, opacity: 0.6
  });
  const spray = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 8), sprayMat);
  spray.position.set(blockCenterX, 4.2, blockCenterZ);
  scene.add(spray);

  // Benches — 4-6 along paths
  const benchMat = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.9 });
  const benchCount = 4 + Math.floor(Math.random() * 3);
  for (let b = 0; b < benchCount; b++) {
    const angle = (b / benchCount) * Math.PI * 2;
    const dist = 12 + Math.random() * 8;
    const bx = blockCenterX + Math.cos(angle) * dist;
    const bz = blockCenterZ + Math.sin(angle) * dist;
    const bench = new THREE.Mesh(new THREE.BoxGeometry(3, 0.6, 1), benchMat);
    bench.position.set(bx, 0.3, bz);
    bench.rotation.y = angle;
    scene.add(bench);
  }
  // No AABB entries — parks are fully open
}

// ── Ramp Generation ─────────────────────────────────────────────────────

export function createRamps() {
  // Place 4 ramps on roads at specific positions
  const rampPositions = [
    { row: 2, col: 1, dir: 'north' },  // on horizontal road between rows 2-3, near col 1
    { row: 5, col: 7, dir: 'south' },  // on horizontal road
    { row: 3, col: 0, dir: 'east' },   // on vertical road
    { row: 7, col: 8, dir: 'west' },   // on vertical road
  ];

  const rampMat = new THREE.MeshStandardMaterial({ color: 0xFF8C00, roughness: 0.6 });
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xFFDD00, roughness: 0.5 });

  for (const rp of rampPositions) {
    let rx, rz, rotY;
    if (rp.dir === 'north' || rp.dir === 'south') {
      // On a horizontal road
      rz = -HALF_CITY + rp.row * CELL;
      rx = -HALF_CITY + rp.col * CELL + CELL / 2;
      rotY = rp.dir === 'north' ? 0 : Math.PI;
    } else {
      // On a vertical road
      rx = -HALF_CITY + rp.col * CELL;
      rz = -HALF_CITY + rp.row * CELL + CELL / 2;
      rotY = rp.dir === 'east' ? Math.PI / 2 : -Math.PI / 2;
    }

    // Create wedge geometry (triangular prism)
    const geo = new THREE.BufferGeometry();
    const hw = RAMP_WIDTH / 2;
    const hl = RAMP_LENGTH / 2;
    const h = RAMP_HEIGHT;

    // Vertices for a wedge: bottom is a rectangle, top is a line at the back
    // Front is the low end (y=0), back is the high end (y=h)
    const vertices = new Float32Array([
      // Ramp surface (2 tris)
      -hw, 0, hl,   hw, 0, hl,   hw, h, -hl,
      -hw, 0, hl,   hw, h, -hl,  -hw, h, -hl,
      // Bottom face (2 tris)
      -hw, 0, hl,   hw, 0, -hl,  hw, 0, hl,
      -hw, 0, hl,   -hw, 0, -hl, hw, 0, -hl,
      // Back face (2 tris) — vertical wall at top
      -hw, 0, -hl,  -hw, h, -hl, hw, h, -hl,
      -hw, 0, -hl,  hw, h, -hl,  hw, 0, -hl,
      // Left side (2 tris)
      -hw, 0, hl,   -hw, h, -hl, -hw, 0, -hl,
      // Right side (2 tris)
      hw, 0, hl,    hw, 0, -hl,  hw, h, -hl,
    ]);
    geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, rampMat);
    mesh.position.set(rx, 0, rz);
    mesh.rotation.y = rotY;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    // Chevron stripes on top surface (decorative)
    for (let s = 0; s < 3; s++) {
      const stripe = new THREE.Mesh(
        new THREE.PlaneGeometry(RAMP_WIDTH * 0.6, 0.5),
        stripeMat
      );
      const progress = (s + 1) / 4;
      const sz = hl - progress * RAMP_LENGTH;
      const sy = progress * h + 0.05;
      stripe.position.set(0, sy, sz);
      stripe.rotation.x = -Math.atan2(h, RAMP_LENGTH);
      const stripeGroup = new THREE.Group();
      stripeGroup.add(stripe);
      stripeGroup.position.set(rx, 0, rz);
      stripeGroup.rotation.y = rotY;
      scene.add(stripeGroup);
    }

    // Compute world-space AABB for the ramp
    const corners = [
      new THREE.Vector3(-hw, 0, -hl),
      new THREE.Vector3(hw, 0, -hl),
      new THREE.Vector3(-hw, 0, hl),
      new THREE.Vector3(hw, 0, hl),
    ];
    const euler = new THREE.Euler(0, rotY, 0);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const c of corners) {
      c.applyEuler(euler);
      c.x += rx; c.z += rz;
      minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
      minZ = Math.min(minZ, c.z); maxZ = Math.max(maxZ, c.z);
    }

    state.buildings.push({ minX, maxX, minZ, maxZ, height: h, isRamp: true });
    state.ramps.push({
      x: rx, z: rz, rotY, mesh,
      minX, maxX, minZ, maxZ,
      height: h, length: RAMP_LENGTH, width: RAMP_WIDTH
    });
  }
}

// ── Main createCity ─────────────────────────────────────────────────────

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
  return { x, z };
}

export function setupLighting() {
  const ambient = new THREE.AmbientLight(0x806040, 0.6);
  scene.add(ambient);
  state.ambient = ambient;

  const sun = new THREE.DirectionalLight(0xFFD4A0, 1.5);
  sun.position.set(150, 60, 80);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -150;
  sun.shadow.camera.right = 150;
  sun.shadow.camera.top = 150;
  sun.shadow.camera.bottom = -150;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 400;
  sun.shadow.bias = -0.001;
  scene.add(sun);
  state.sun = sun;

  const hemi = new THREE.HemisphereLight(0xFF8C60, 0x8b7355, 0.3);
  scene.add(hemi);
  state.hemi = hemi;
}

export function createCity() {
  // Ground
  const groundGeo = new THREE.PlaneGeometry(CITY_SIZE + 100, CITY_SIZE + 100);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Wet road material - neon vice city style
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.05, metalness: 0.8 });
  const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0xccbbaa, roughness: 0.7 });
  const yellowMat = new THREE.MeshStandardMaterial({ color: 0xddcc00, roughness: 0.5 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });

  // Horizontal roads
  for (let i = 0; i <= GRID; i++) {
    const z = -HALF_CITY + i * CELL;
    const road = new THREE.Mesh(new THREE.PlaneGeometry(CITY_SIZE, ROAD), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.01, z);
    scene.add(road);

    const puddleMat = new THREE.MeshStandardMaterial({
      color: 0x334466, emissive: 0x001133, emissiveIntensity: 0.3,
      roughness: 0.0, metalness: 0.9, transparent: true, opacity: 0.35
    });
    const puddle = new THREE.Mesh(new THREE.PlaneGeometry(CITY_SIZE, ROAD * 0.6), puddleMat);
    puddle.rotation.x = -Math.PI / 2;
    puddle.position.set(0, 0.02, z);
    scene.add(puddle);

    const centerLine = new THREE.Mesh(new THREE.PlaneGeometry(CITY_SIZE, 0.3), yellowMat);
    centerLine.rotation.x = -Math.PI / 2;
    centerLine.position.set(0, 0.02, z);
    scene.add(centerLine);

    for (let d = -HALF_CITY; d < HALF_CITY; d += 8) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.15), whiteMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(d + 2, 0.02, z + ROAD * 0.25);
      scene.add(dash);
      const dash2 = dash.clone();
      dash2.position.z = z - ROAD * 0.25;
      scene.add(dash2);
    }

    const sw1 = new THREE.Mesh(new THREE.BoxGeometry(CITY_SIZE, 0.3, 1.5), sidewalkMat);
    sw1.position.set(0, 0.15, z + ROAD / 2 + 0.75);
    sw1.receiveShadow = true;
    scene.add(sw1);
    const sw2 = sw1.clone();
    sw2.position.z = z - ROAD / 2 - 0.75;
    scene.add(sw2);
  }

  // Vertical roads
  for (let j = 0; j <= GRID; j++) {
    const x = -HALF_CITY + j * CELL;
    const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD, CITY_SIZE), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(x, 0.015, 0);
    scene.add(road);

    const puddleMat = new THREE.MeshStandardMaterial({
      color: 0x334466, emissive: 0x001133, emissiveIntensity: 0.3,
      roughness: 0.0, metalness: 0.9, transparent: true, opacity: 0.35
    });
    const puddle = new THREE.Mesh(new THREE.PlaneGeometry(ROAD * 0.6, CITY_SIZE), puddleMat);
    puddle.rotation.x = -Math.PI / 2;
    puddle.position.set(x, 0.025, 0);
    scene.add(puddle);

    const centerLine = new THREE.Mesh(new THREE.PlaneGeometry(0.3, CITY_SIZE), yellowMat);
    centerLine.rotation.x = -Math.PI / 2;
    centerLine.position.set(x, 0.025, 0);
    scene.add(centerLine);

    for (let d = -HALF_CITY; d < HALF_CITY; d += 8) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 4), whiteMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(x + ROAD * 0.25, 0.025, d + 2);
      scene.add(dash);
      const dash2 = dash.clone();
      dash2.position.x = x - ROAD * 0.25;
      scene.add(dash2);
    }

    const sw1 = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.3, CITY_SIZE), sidewalkMat);
    sw1.position.set(x + ROAD / 2 + 0.75, 0.15, 0);
    sw1.receiveShadow = true;
    scene.add(sw1);
    const sw2 = sw1.clone();
    sw2.position.x = x - ROAD / 2 - 0.75;
    scene.add(sw2);
  }

  // ── District-aware building loop ──────────────────────────────────────
  for (let gi = 0; gi < GRID; gi++) {
    for (let gj = 0; gj < GRID; gj++) {
      const blockCenterX = -HALF_CITY + gj * CELL + ROAD / 2 + BLOCK / 2;
      const blockCenterZ = -HALF_CITY + gi * CELL + ROAD / 2 + BLOCK / 2;
      const district = getDistrict(gi, gj);

      switch (district) {
        case 'DT': {
          // Downtown — mostly skyscrapers, occasional L-shaped or parking garage
          const roll = Math.random();
          if (roll < 0.15) createParkingGarage(blockCenterX, blockCenterZ);
          else if (roll < 0.3) createLShapedBuilding(blockCenterX, blockCenterZ, DOWNTOWN_COLORS, true);
          else createSkyscraper(blockCenterX, blockCenterZ);
          break;
        }
        case 'COM': {
          // Commercial — shops, occasional L-shaped building or parking garage
          const roll = Math.random();
          if (roll < 0.1) createParkingGarage(blockCenterX, blockCenterZ);
          else if (roll < 0.25) createLShapedBuilding(blockCenterX, blockCenterZ, BUILDING_COLORS, false);
          else createShop(blockCenterX, blockCenterZ);
          break;
        }
        case 'RES':
          createHouse(blockCenterX, blockCenterZ);
          break;
        case 'IND':
          createWarehouse(blockCenterX, blockCenterZ);
          break;
        case 'PARK':
          createPark(blockCenterX, blockCenterZ);
          break;
        case 'LOT':
          createParkingLot(blockCenterX, blockCenterZ);
          break;
      }
    }
  }

  // ── Street lights — 40 at intersections ───────────────────────────────
  const lightPoleMat = new THREE.MeshStandardMaterial({ color: 0x444444 });
  const bulbGeo = new THREE.SphereGeometry(0.3, 8, 8);
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffeecc, emissive: 0xffeecc, emissiveIntensity: 1 });

  for (let i = 0; i < 40; i++) {
    // Place at intersections
    const row = Math.floor(Math.random() * (GRID + 1));
    const col = Math.floor(Math.random() * (GRID + 1));
    const lx = -HALF_CITY + col * CELL + (Math.random() > 0.5 ? 1 : -1) * (ROAD / 2 + 0.5);
    const lz = -HALF_CITY + row * CELL + (Math.random() > 0.5 ? 1 : -1) * (ROAD / 2 + 0.5);

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 8, 6), lightPoleMat);
    pole.position.set(lx, 4, lz);
    scene.add(pole);

    const bulb = new THREE.Mesh(bulbGeo, bulbMat.clone());
    bulb.position.set(lx, 8.2, lz);
    scene.add(bulb);

    const pl = new THREE.PointLight(0xffeecc, 0.8, 30);
    pl.position.set(lx, 8, lz);
    pl.castShadow = false;
    scene.add(pl);

    state.streetLights.push({ bulb, pointLight: pl });
  }
}

export function createOceanAndBeach() {
  const sandMat = new THREE.MeshStandardMaterial({ color: 0xF4D6A0, roughness: 0.95 });
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(CITY_SIZE + 200, 60), sandMat);
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.05, HALF_CITY + 30);
  sand.receiveShadow = true;
  scene.add(sand);

  const oceanMat = new THREE.MeshStandardMaterial({
    color: 0x006994, roughness: 0.2, metalness: 0.3, transparent: true, opacity: 0.8
  });
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(CITY_SIZE + 400, 300), oceanMat);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, -0.3, HALF_CITY + 210);
  scene.add(ocean);
  state.ocean = ocean;
}

export function createPalmTrees() {
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8B6914, roughness: 0.9 });
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0x228B22, roughness: 0.8 });

  let placed = 0;
  for (let i = 0; i <= GRID && placed < 50; i++) {
    const z = -HALF_CITY + i * CELL;
    for (let x = -HALF_CITY; x < HALF_CITY && placed < 50; x += 20) {
      const px = x + (Math.random() - 0.5) * 4;
      const side = Math.random() > 0.5 ? 1 : -1;
      const pz = z + side * (ROAD / 2 + 2);

      const group = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, 6, 8), trunkMat);
      trunk.position.y = 3;
      group.add(trunk);
      const canopy = new THREE.Mesh(new THREE.SphereGeometry(2.5, 8, 6), canopyMat);
      canopy.position.y = 6.5;
      canopy.scale.set(1, 0.5, 1);
      group.add(canopy);

      group.rotation.x = (Math.random() - 0.5) * 0.1;
      group.rotation.z = (Math.random() - 0.5) * 0.1;
      group.position.set(px, 0, pz);
      scene.add(group);
      state.palmTrees.push(group);
      placed++;
    }
  }
}

export function createClouds() {
  const cloudMat = new THREE.MeshBasicMaterial({
    color: 0xFFEEDD, transparent: true, opacity: 0.3, side: THREE.DoubleSide
  });

  for (let i = 0; i < 10; i++) {
    const w = 40 + Math.random() * 60;
    const h = 15 + Math.random() * 20;
    const cloud = new THREE.Mesh(new THREE.PlaneGeometry(w, h), cloudMat);
    cloud.rotation.x = -Math.PI / 2;
    cloud.position.set(
      (Math.random() - 0.5) * CITY_SIZE * 1.5,
      120 + Math.random() * 40,
      (Math.random() - 0.5) * CITY_SIZE * 1.5
    );
    scene.add(cloud);
    state.clouds.push({ mesh: cloud, speed: 0.5 + Math.random() * 1.5 });
  }
}

export function createMoneyPickups() {
  const geo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x00FF00, emissive: 0x00FF00, emissiveIntensity: 1.0
  });

  for (let i = 0; i < 18; i++) {
    const mesh = new THREE.Mesh(geo, mat);
    const pos = randomSidewalkPos();
    mesh.position.set(pos.x, 0.8, pos.z);
    scene.add(mesh);
    state.moneyPickups.push({
      mesh, x: pos.x, z: pos.z, active: true,
      respawnTimer: 0, value: 100 + Math.floor(Math.random() * 3) * 100
    });
  }
}

export function createGunStore() {
  const roadIdx = 2 + Math.floor(Math.random() * (GRID - 3));
  const roadIdx2 = 2 + Math.floor(Math.random() * (GRID - 3));
  const x = -HALF_CITY + roadIdx2 * CELL;
  const z = -HALF_CITY + roadIdx * CELL + ROAD / 2 + 3;

  const group = new THREE.Group();

  const storeMat = new THREE.MeshStandardMaterial({ color: 0x8B0000, roughness: 0.7 });
  const store = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 5), storeMat);
  store.position.y = 2;
  store.castShadow = true;
  group.add(store);

  const signMat = new THREE.MeshStandardMaterial({ color: 0xFF4444, emissive: 0xFF4444, emissiveIntensity: 1.5 });
  const sign = new THREE.Mesh(new THREE.BoxGeometry(5, 1, 0.2), signMat);
  sign.position.set(0, 4.5, 2.6);
  group.add(sign);

  const iconMat = new THREE.MeshStandardMaterial({ color: 0xFFD700, emissive: 0xFFD700, emissiveIntensity: 2.0 });
  const icon = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.4, 0.4), iconMat);
  icon.position.set(0, 6, 0);
  group.add(icon);

  group.position.set(x, 0, z);
  scene.add(group);
  state.gunStore = { mesh: group, icon, x, z };
}
