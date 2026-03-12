import * as THREE from 'three';
import { scene } from './renderer.js';
import { state } from './state.js';
import {
  GRID, BLOCK, ROAD, CELL, CITY_SIZE, HALF_CITY,
  BUILDING_COLORS, NEON_COLORS,
  DOWNTOWN_COLORS, RESIDENTIAL_COLORS, INDUSTRIAL_COLORS, SHOP_SIGN_COLORS,
  RAMP_WIDTH, RAMP_LENGTH, RAMP_HEIGHT,
  TRAFFIC_GREEN_TIME, TRAFFIC_YELLOW_TIME
} from './constants.js';

// ── District Map ────────────────────────────────────────────────────────
// row = gi (north→south), col = gj (west→east)
const DISTRICT_MAP = [
  ['IND','IND','COM','COM','COM','COM','COM','COM','RES','RES'],
  ['IND','COM','COM','DT', 'DT', 'DT', 'DT', 'COM','COM','RES'],
  ['COM','COM','DT', 'DT', 'DT', 'DT', 'DT', 'DT', 'COM','RES'],
  ['COM','DT', 'DT', 'DT', 'DT', 'DT', 'DT', 'DT', 'COM','PARK'],
  ['COM','DT', 'DT', 'DT', 'DT', 'DT', 'DT', 'DT', 'COM','COM'],
  ['COM','COM','DT', 'DT', 'DT', 'DT', 'DT', 'COM','COM','COM'],
  ['RES','COM','COM','COM','COM','COM','COM','COM','COM','RES'],
  ['RES','RES','COM','COM','COM','COM','COM','COM','RES','RES'],
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
  const count = 4 + Math.floor(Math.random() * 4); // 4-7
  const antennaMat = new THREE.MeshStandardMaterial({ color: 0xAAAAAA, metalness: 0.8, roughness: 0.3 });

  // 15% chance of a supertall landmark per block (1 max)
  if (Math.random() < 0.15) {
    const stH = 250 + Math.random() * 100;
    const stW = 10 + Math.random() * 6, stD = 10 + Math.random() * 6;
    const color = pick(DOWNTOWN_COLORS);
    addBuilding(blockCenterX, blockCenterZ, stW, stH, stD, color, true);
    pushAABB(blockCenterX, blockCenterZ, stW, stD, stH);
    const spire = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.4, 25, 6),
      new THREE.MeshStandardMaterial({ color: 0xAAAAAA, metalness: 0.9, roughness: 0.2 })
    );
    spire.position.set(blockCenterX, stH + 12.5, blockCenterZ);
    scene.add(spire);
  }

  const gridCols = 2;
  const numRows = Math.ceil(count / gridCols);
  const cellW = BLOCK / gridCols;
  const cellD = BLOCK / numRows;

  for (let b = 0; b < count; b++) {
    const height = 80 + Math.random() * 120; // 80-200
    const col = b % gridCols;
    const row = Math.floor(b / gridCols);
    const bw = Math.min(cellW * 0.75, 14 + Math.random() * 8);
    const bd = Math.min(cellD * 0.75, 14 + Math.random() * 8);
    const offX = (col + 0.5) * cellW - BLOCK / 2 + (Math.random() - 0.5) * 4;
    const offZ = (row + 0.5) * cellD - BLOCK / 2 + (Math.random() - 0.5) * 4;
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

    // Flat roof cornice (slight overhang, no rotation artifacts)
    const roofColor = 0x8B4513 + Math.floor(Math.random() * 0x222222);
    const roofMat = new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.9 });
    const roof = new THREE.Mesh(new THREE.BoxGeometry(actualW + 1.5, 0.7, actualD + 1.5), roofMat);
    roof.position.set(cx, height + 0.35, cz);
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

  // Road material — dry by default, wet during rain
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.75, metalness: 0.05 });
  state.roadMaterial = roadMat;
  const puddleMat = new THREE.MeshStandardMaterial({
    color: 0x334466, emissive: 0x001133, emissiveIntensity: 0.3,
    roughness: 0.0, metalness: 0.9, transparent: true, opacity: 0
  });
  state.puddleMaterial = puddleMat;
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
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(CITY_SIZE + 200, 70), sandMat);
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.05, HALF_CITY + 35);
  sand.receiveShadow = true;
  scene.add(sand);

  // Shader water with animated waves and fresnel reflections
  const oceanGeo = new THREE.PlaneGeometry(CITY_SIZE + 400, 300, 128, 64);
  const oceanMat = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      waterColor: { value: new THREE.Color(0x006994) },
      skyColor: { value: new THREE.Color(0x87ceeb) },
      sunDirection: { value: new THREE.Vector3(0.5, 0.5, 0.3).normalize() }
    },
    vertexShader: `
      uniform float time;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying float vWaveHeight;

      void main() {
        vUv = uv;
        vec3 pos = position;

        float h = 0.0;
        h += sin(pos.x * 0.05 + time * 1.5) * 0.6;
        h += sin(pos.y * 0.08 + time * 2.0 + 1.0) * 0.32;
        h += sin((pos.x + pos.y) * 0.03 + time) * 0.8;
        h += sin(pos.x * 0.12 - time * 0.8) * 0.2;

        pos.z = h;
        vWaveHeight = h;

        vec4 worldPos = modelMatrix * vec4(pos, 1.0);
        vWorldPos = worldPos.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 waterColor;
      uniform vec3 skyColor;
      uniform vec3 sunDirection;
      uniform float time;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying float vWaveHeight;

      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorldPos);

        // Approximate normal from wave derivatives
        float wx = vWorldPos.x;
        float wz = vWorldPos.z;
        float dx = cos(wx * 0.05 + time * 1.5) * 0.075
                 + cos((wx - wz) * 0.03 + time) * 0.06;
        float dz = cos(-wz * 0.08 + time * 2.0 + 1.0) * 0.064
                 + cos((wx - wz) * 0.03 + time) * 0.06;
        vec3 normal = normalize(vec3(-dx, 1.0, -dz));

        // Fresnel reflection
        float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 3.0);
        vec3 color = mix(waterColor, skyColor * 0.7, fresnel * 0.6);

        // Sun specular highlight
        vec3 reflDir = reflect(-viewDir, normal);
        float spec = pow(max(dot(reflDir, normalize(sunDirection)), 0.0), 64.0);
        color += vec3(1.0, 0.9, 0.7) * spec * 2.0;

        // Foam at wave crests
        float foam = smoothstep(1.0, 1.6, vWaveHeight);
        color = mix(color, vec3(0.9, 0.95, 1.0), foam * 0.4);

        gl_FragColor = vec4(color, 0.85);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false
  });

  const ocean = new THREE.Mesh(oceanGeo, oceanMat);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, 0, HALF_CITY + 150);
  scene.add(ocean);
  state.ocean = ocean;
  state.oceanMaterial = oceanMat;

  // Ocean floor plane to prevent see-through at shallow angles
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x001830, roughness: 1.0 });
  const floorPlane = new THREE.Mesh(new THREE.PlaneGeometry(CITY_SIZE + 400, 300), floorMat);
  floorPlane.rotation.x = -Math.PI / 2;
  floorPlane.position.set(0, -1.5, HALF_CITY + 150);
  scene.add(floorPlane);
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
  for (let i = 0; i < 18; i++) {
    const group = new THREE.Group();
    const sphereCount = 5 + Math.floor(Math.random() * 4);
    const baseMat = new THREE.MeshBasicMaterial({
      color: 0xFFEEDD, transparent: true, opacity: 0.25, depthWrite: false
    });

    for (let s = 0; s < sphereCount; s++) {
      const r = 8 + Math.random() * 12;
      const geo = new THREE.SphereGeometry(r, 8, 8);
      const sphere = new THREE.Mesh(geo, baseMat);
      sphere.position.set(
        (Math.random() - 0.5) * 30,
        (Math.random() - 0.5) * 5,
        (Math.random() - 0.5) * 15
      );
      sphere.scale.set(1, 0.4 + Math.random() * 0.3, 1);
      group.add(sphere);
    }

    group.position.set(
      (Math.random() - 0.5) * CITY_SIZE * 1.5,
      120 + Math.random() * 40,
      (Math.random() - 0.5) * CITY_SIZE * 1.5
    );
    scene.add(group);
    state.clouds.push({ mesh: group, speed: 0.5 + Math.random() * 1.5, material: baseMat });
  }
}

export function createSkyDome() {
  // Sky dome — gradient sphere covering the scene
  const skyGeo = new THREE.SphereGeometry(450, 32, 32);
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      horizonColor: { value: new THREE.Color(0xFFA062) },
      zenithColor: { value: new THREE.Color(0x87ceeb) }
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 horizonColor;
      uniform vec3 zenithColor;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition).y;
        float t = pow(max(0.0, h), 0.7);
        vec3 color = mix(horizonColor, zenithColor, t);
        gl_FragColor = vec4(color, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false
  });
  const skyDome = new THREE.Mesh(skyGeo, skyMat);
  scene.add(skyDome);
  state.skyDome = skyDome;
  state.skyDomeMaterial = skyMat;

  // Star field — 300 points on upper hemisphere
  const starCount = 300;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI * 0.5;
    const r = 440;
    starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPositions[i * 3 + 1] = r * Math.cos(phi);
    starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const starMat = new THREE.PointsMaterial({
    color: 0xffffff, size: 1.5, transparent: true, opacity: 0,
    sizeAttenuation: false, depthWrite: false, fog: false
  });
  const starField = new THREE.Points(starGeo, starMat);
  scene.add(starField);
  state.starField = starField;
  state.starMaterial = starMat;

  // Sun mesh
  const sunGeo = new THREE.SphereGeometry(8, 16, 16);
  const sunMat = new THREE.MeshBasicMaterial({
    color: 0xFFDD44, transparent: true, depthWrite: false, fog: false
  });
  const sunMesh = new THREE.Mesh(sunGeo, sunMat);
  scene.add(sunMesh);
  state.sunMesh = sunMesh;

  // Moon mesh
  const moonGeo = new THREE.SphereGeometry(6, 16, 16);
  const moonMat = new THREE.MeshBasicMaterial({
    color: 0xDDDDFF, transparent: true, depthWrite: false, fog: false
  });
  const moonMesh = new THREE.Mesh(moonGeo, moonMat);
  scene.add(moonMesh);
  state.moonMesh = moonMesh;
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

// ── Traffic Lights ──────────────────────────────────────────────────────

// Shared materials (swapped onto meshes each frame)
const matRedOn = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 2.0 });
const matRedOff = new THREE.MeshStandardMaterial({ color: 0x330000, roughness: 0.9 });
const matYellowOn = new THREE.MeshStandardMaterial({ color: 0xffcc00, emissive: 0xffcc00, emissiveIntensity: 2.0 });
const matYellowOff = new THREE.MeshStandardMaterial({ color: 0x332200, roughness: 0.9 });
const matGreenOn = new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x00ff00, emissiveIntensity: 2.0 });
const matGreenOff = new THREE.MeshStandardMaterial({ color: 0x003300, roughness: 0.9 });

export function createTrafficLights() {
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 });
  const housingMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const poleGeo = new THREE.CylinderGeometry(0.1, 0.1, 7, 6);
  const housingGeo = new THREE.BoxGeometry(0.5, 1.4, 0.5);
  const bulbGeo = new THREE.SphereGeometry(0.12, 6, 6);

  // Build 2D grid for quick lookup
  state.trafficLightGrid = [];
  for (let r = 0; r <= GRID; r++) state.trafficLightGrid[r] = new Array(GRID + 1).fill(null);

  for (let row = 1; row < GRID; row++) {
    for (let col = 1; col < GRID; col++) {
      const ix = -HALF_CITY + col * CELL;
      const iz = -HALF_CITY + row * CELL;

      // Place pole on NE corner of intersection (on sidewalk edge)
      const px = ix + ROAD / 2 + 0.5;
      const pz = iz - ROAD / 2 - 0.5;

      const group = new THREE.Group();

      // Pole
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(0, 3.5, 0);
      group.add(pole);

      // Housing at top
      const housing = new THREE.Mesh(housingGeo, housingMat);
      housing.position.set(0, 7.5, 0);
      group.add(housing);

      // NS lights (z faces — visible to traffic heading north/south)
      const nsRed = new THREE.Mesh(bulbGeo, matRedOff);
      nsRed.position.set(0, 7.9, -0.26);
      group.add(nsRed);
      const nsYellow = new THREE.Mesh(bulbGeo, matYellowOff);
      nsYellow.position.set(0, 7.5, -0.26);
      group.add(nsYellow);
      const nsGreen = new THREE.Mesh(bulbGeo, matGreenOn);
      nsGreen.position.set(0, 7.1, -0.26);
      group.add(nsGreen);

      // NS back face
      const nsRedB = new THREE.Mesh(bulbGeo, matRedOff);
      nsRedB.position.set(0, 7.9, 0.26);
      group.add(nsRedB);
      const nsYellowB = new THREE.Mesh(bulbGeo, matYellowOff);
      nsYellowB.position.set(0, 7.5, 0.26);
      group.add(nsYellowB);
      const nsGreenB = new THREE.Mesh(bulbGeo, matGreenOn);
      nsGreenB.position.set(0, 7.1, 0.26);
      group.add(nsGreenB);

      // EW lights (x faces — visible to traffic heading east/west)
      const ewRed = new THREE.Mesh(bulbGeo, matRedOn);
      ewRed.position.set(-0.26, 7.9, 0);
      group.add(ewRed);
      const ewYellow = new THREE.Mesh(bulbGeo, matYellowOff);
      ewYellow.position.set(-0.26, 7.5, 0);
      group.add(ewYellow);
      const ewGreen = new THREE.Mesh(bulbGeo, matGreenOff);
      ewGreen.position.set(-0.26, 7.1, 0);
      group.add(ewGreen);

      // EW back face
      const ewRedB = new THREE.Mesh(bulbGeo, matRedOn);
      ewRedB.position.set(0.26, 7.9, 0);
      group.add(ewRedB);
      const ewYellowB = new THREE.Mesh(bulbGeo, matYellowOff);
      ewYellowB.position.set(0.26, 7.5, 0);
      group.add(ewYellowB);
      const ewGreenB = new THREE.Mesh(bulbGeo, matGreenOff);
      ewGreenB.position.set(0.26, 7.1, 0);
      group.add(ewGreenB);

      group.position.set(px, 0, pz);
      scene.add(group);

      // Stagger initial phase so not all lights change at once
      const initialPhase = ((row + col) % 2 === 0) ? 0 : 2;
      const initialTimer = ((row * 3 + col * 7) % 10) / 10 * TRAFFIC_GREEN_TIME;

      const tl = {
        row, col, x: ix, z: iz,
        phase: initialPhase, // 0=NS green, 1=NS yellow, 2=EW green, 3=EW yellow
        timer: initialTimer,
        nsRed: [nsRed, nsRedB],
        nsYellow: [nsYellow, nsYellowB],
        nsGreen: [nsGreen, nsGreenB],
        ewRed: [ewRed, ewRedB],
        ewYellow: [ewYellow, ewYellowB],
        ewGreen: [ewGreen, ewGreenB],
      };

      state.trafficLights.push(tl);
      state.trafficLightGrid[row][col] = tl;
    }
  }
}

export function updateTrafficLights(dt) {
  for (const tl of state.trafficLights) {
    tl.timer += dt;

    const phaseDur = (tl.phase === 0 || tl.phase === 2) ? TRAFFIC_GREEN_TIME : TRAFFIC_YELLOW_TIME;
    if (tl.timer >= phaseDur) {
      tl.timer -= phaseDur;
      tl.phase = (tl.phase + 1) % 4;
    }

    // NS state: green=phase0, yellow=phase1, red=phase2|3
    const nsS = tl.phase === 0 ? 'green' : tl.phase === 1 ? 'yellow' : 'red';
    for (const m of tl.nsRed) m.material = nsS === 'red' ? matRedOn : matRedOff;
    for (const m of tl.nsYellow) m.material = nsS === 'yellow' ? matYellowOn : matYellowOff;
    for (const m of tl.nsGreen) m.material = nsS === 'green' ? matGreenOn : matGreenOff;

    // EW state: green=phase2, yellow=phase3, red=phase0|1
    const ewS = tl.phase === 2 ? 'green' : tl.phase === 3 ? 'yellow' : 'red';
    for (const m of tl.ewRed) m.material = ewS === 'red' ? matRedOn : matRedOff;
    for (const m of tl.ewYellow) m.material = ewS === 'yellow' ? matYellowOn : matYellowOff;
    for (const m of tl.ewGreen) m.material = ewS === 'green' ? matGreenOn : matGreenOff;
  }
}

// ── Mountains ─────────────────────────────────────────────────────────────
export function createMountains() {
  // Extended background terrain under mountain areas (y=-0.1 so city ground covers it)
  const terrainMat = new THREE.MeshStandardMaterial({ color: 0x3d3830, roughness: 1.0 });
  const bgGround = new THREE.Mesh(new THREE.PlaneGeometry(CITY_SIZE + 900, CITY_SIZE + 900), terrainMat);
  bgGround.rotation.x = -Math.PI / 2;
  bgGround.position.y = -0.1;
  scene.add(bgGround);

  const snowMat = new THREE.MeshStandardMaterial({ color: 0xeeeeff, roughness: 0.55 });
  const rockColors = [0x6b6560, 0x7a7065, 0x5a5550, 0x706860, 0x6a6055, 0x807870];

  function makeMountain(cx, cz, height, greenness) {
    const baseRadius = height * 0.5 + 15 + Math.random() * 20;
    const segs = 6 + Math.floor(Math.random() * 3);
    const rotY = Math.random() * Math.PI * 2;

    // Rocky body
    const rockMat = new THREE.MeshStandardMaterial({
      color: rockColors[Math.floor(Math.random() * rockColors.length)],
      roughness: 0.92
    });
    const rock = new THREE.Mesh(new THREE.ConeGeometry(baseRadius, height, segs), rockMat);
    rock.position.set(cx, height / 2, cz);
    rock.rotation.y = rotY;
    scene.add(rock);

    // Forest layer — height controlled by greenness (0=sparse, 1=lush)
    const forestTop = height * (0.35 + greenness * 0.22);
    const forestRadius = baseRadius * (0.72 + greenness * 0.15);
    const gv = 0.2 + greenness * 0.5;
    const forestMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0.05 + greenness * 0.02, gv, 0.04),
      roughness: 0.95
    });
    const forest = new THREE.Mesh(new THREE.ConeGeometry(forestRadius, forestTop, segs), forestMat);
    forest.position.set(cx, forestTop / 2, cz);
    forest.rotation.y = rotY + 0.3;
    scene.add(forest);

    // Snow cap for mountains taller than 130 units
    if (height > 130) {
      const snowFrac = Math.min(1, (height - 130) / 120);
      const snowH = height * (0.12 + snowFrac * 0.1);
      const snowR = baseRadius * (0.12 + snowFrac * 0.06);
      const snow = new THREE.Mesh(new THREE.ConeGeometry(snowR, snowH, segs), snowMat);
      snow.position.set(cx, height - snowH / 2 + 0.5, cz);
      scene.add(snow);
    }

    // Collision footprint
    const fr = baseRadius * 0.65;
    state.buildings.push({ minX: cx - fr, maxX: cx + fr, minZ: cz - fr, maxZ: cz + fr, height });
  }

  function addRange(xMin, xMax, zMin, zMax, count) {
    for (let i = 0; i < count; i++) {
      const cx = xMin + Math.random() * (xMax - xMin);
      const cz = zMin + Math.random() * (zMax - zMin);
      const height = 80 + Math.random() * 220; // 80–300
      const greenness = 0.15 + Math.random() * 0.85;
      makeMountain(cx, cz, height, greenness);
    }
  }

  const pad = 40;   // start this far outside the city edge
  const deep = 290; // depth of the mountain range

  // North range
  addRange(-HALF_CITY - 100, HALF_CITY + 100, -HALF_CITY - deep, -HALF_CITY - pad, 28);
  // West range
  addRange(-HALF_CITY - deep, -HALF_CITY - pad, -HALF_CITY - 100, HALF_CITY + 100, 28);
  // East range
  addRange(HALF_CITY + pad, HALF_CITY + deep, -HALF_CITY - 100, HALF_CITY + 100, 28);
  // Corner fills (NW, NE) so mountains meet at corners
  addRange(-HALF_CITY - deep, -HALF_CITY - pad, -HALF_CITY - deep, -HALF_CITY - pad, 10);
  addRange(HALF_CITY + pad, HALF_CITY + deep, -HALF_CITY - deep, -HALF_CITY - pad, 10);

  // Invisible solid walls — block player/car on all 4 sides
  const BIG = 2000;
  // North wall
  state.buildings.push({ minX: -BIG, maxX: BIG, minZ: -BIG, maxZ: -HALF_CITY - 35, height: BIG });
  // West wall
  state.buildings.push({ minX: -BIG, maxX: -HALF_CITY - 35, minZ: -BIG, maxZ: BIG, height: BIG });
  // East wall
  state.buildings.push({ minX: HALF_CITY + 35, maxX: BIG, minZ: -BIG, maxZ: BIG, height: BIG });
  // South/ocean wall — drowning is handled in player.js; this stops cars going too far out
  state.buildings.push({ minX: -BIG, maxX: BIG, minZ: HALF_CITY + 72, maxZ: BIG, height: BIG });
}
