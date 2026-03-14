import * as THREE from 'three';
import { scene } from './renderer.js';
import { state } from './state.js';
import { BLOCK, INDUSTRIAL_COLORS } from './constants.js';
import { S } from './city-constants.js';
import { pick, clampToBlock, makeGarageTexture, pushAABB } from './city-helpers.js';
import { registerStaticMesh } from './geometry-merger.js';

// ── Shared materials (module scope) ─────────────────────────────────────
const doorMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5, metalness: 0.6 });
const dumpMat = new THREE.MeshStandardMaterial({ color: 0x336633, roughness: 0.8 });

const warehouseMatPool = new Map();
function getPooledWarehouseMat(color) {
  if (!warehouseMatPool.has(color)) {
    warehouseMatPool.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.4 }));
  }
  return warehouseMatPool.get(color);
}

const lotMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.85 });
const lineMat = new THREE.MeshStandardMaterial({ color: 0xEEEEEE, roughness: 0.5 });

const grassMat = new THREE.MeshStandardMaterial({ color: 0x228B22, roughness: 0.95 });
const pathMat = new THREE.MeshStandardMaterial({ color: 0xC8B88A, roughness: 0.8 });
const benchMat = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.9 });
const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8B6914, roughness: 0.9 });
const palmCanopyMat = new THREE.MeshStandardMaterial({ color: 0x228B22, roughness: 0.8 });
const decidCanopyMat = new THREE.MeshStandardMaterial({ color: 0x2E8B57, roughness: 0.8 });
const fountainMat = new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.4, metalness: 0.3 });
const waterMat = new THREE.MeshStandardMaterial({
  color: 0x4499CC, roughness: 0.1, metalness: 0.5, transparent: true, opacity: 0.7
});
const sprayMat = new THREE.MeshStandardMaterial({
  color: 0xAADDFF, emissive: 0x4499CC, emissiveIntensity: 0.3,
  transparent: true, opacity: 0.6
});

export function createWarehouse(blockCenterX, blockCenterZ) {
  const height = (8 + Math.random() * 10) * S;
  const bw = BLOCK * 0.7 + Math.random() * (BLOCK * 0.2);
  const bd = BLOCK * 0.6 + Math.random() * (BLOCK * 0.2);
  const cx = blockCenterX + (Math.random() - 0.5) * 4;
  const cz = blockCenterZ + (Math.random() - 0.5) * 4;
  const c = clampToBlock(cx, cz, bw, bd, blockCenterX, blockCenterZ);
  const actualW = c.maxX - c.minX, actualD = c.maxZ - c.minZ;
  if (actualW < 10 * S || actualD < 10 * S) return;
  const fcx = (c.minX + c.maxX) / 2, fcz = (c.minZ + c.maxZ) / 2;
  const color = pick(INDUSTRIAL_COLORS);

  // No window texture for warehouses — metallic look
  const mat = getPooledWarehouseMat(color);
  const geo = new THREE.BoxGeometry(actualW, height, actualD);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(fcx, height / 2, fcz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  registerStaticMesh(mesh, mat);
  state.buildingMeshes.push(mesh);
  pushAABB(fcx, fcz, actualW, actualD, height);

  // Rolling door detail (darker inset rectangle on front face)
  const doorW = Math.min(8 * S, actualW * 0.4);
  const doorH = Math.min(6 * S, height * 0.7);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(doorW, doorH), doorMat);
  door.position.set(fcx, doorH / 2, c.maxZ + 0.06);
  scene.add(door);
  registerStaticMesh(door, doorMat);

  // Dumpster next to warehouse
  if (Math.random() < 0.6) {
    const dumpW = 2, dumpH = 1.5, dumpD = 1.5;
    const dx = c.maxX + 0.5 < blockCenterX + BLOCK / 2 ? c.maxX - 1.5 : c.minX + 1.5;
    const dz = c.maxZ + 2;
    const dump = new THREE.Mesh(new THREE.BoxGeometry(dumpW, dumpH, dumpD), dumpMat);
    dump.position.set(dx, dumpH / 2, Math.min(dz, blockCenterZ + BLOCK / 2 - 1));
    scene.add(dump);
    registerStaticMesh(dump, dumpMat);
    // Small AABB for dumpster
    pushAABB(dx, Math.min(dz, blockCenterZ + BLOCK / 2 - 1), dumpW, dumpD, dumpH);
  }
}

export function createParkingGarage(blockCenterX, blockCenterZ) {
  const height = (15 + Math.random() * 10) * S;
  const bw = BLOCK * 0.6, bd = BLOCK * 0.5;
  const cx = blockCenterX, cz = blockCenterZ;
  const c = clampToBlock(cx, cz, bw, bd, blockCenterX, blockCenterZ);
  const actualW = c.maxX - c.minX, actualD = c.maxZ - c.minZ;
  if (actualW < 10 * S || actualD < 10 * S) return;
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

export function createParkingLot(blockCenterX, blockCenterZ) {
  // Flat gray surface
  const lot = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK - 4, BLOCK - 4), lotMat);
  lot.rotation.x = -Math.PI / 2;
  lot.position.set(blockCenterX, 0.04, blockCenterZ);
  lot.receiveShadow = true;
  scene.add(lot);
  registerStaticMesh(lot, lotMat);

  // White line markings
  const numSpaces = 6;
  const spacing = (BLOCK - 8) / numSpaces;
  for (let i = 0; i <= numSpaces; i++) {
    const lx = blockCenterX - (BLOCK - 8) / 2 + i * spacing;
    // Top row
    const line1 = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 8), lineMat);
    line1.rotation.x = -Math.PI / 2;
    line1.position.set(lx, 0.05, blockCenterZ - BLOCK * 0.2);
    scene.add(line1);
    registerStaticMesh(line1, lineMat);
    // Bottom row
    const line2 = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 8), lineMat);
    line2.rotation.x = -Math.PI / 2;
    line2.position.set(lx, 0.05, blockCenterZ + BLOCK * 0.2);
    scene.add(line2);
    registerStaticMesh(line2, lineMat);
  }
  // No AABB — open driving space
}

// ── Park Generation ─────────────────────────────────────────────────────

export function createPark(blockCenterX, blockCenterZ) {
  state.parks.push({ cx: blockCenterX, cz: blockCenterZ });

  // Green ground plane
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK, BLOCK), grassMat);
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(blockCenterX, 0.06, blockCenterZ);
  grass.receiveShadow = true;
  scene.add(grass);
  registerStaticMesh(grass, grassMat);

  // Walking paths — lighter strips
  // Horizontal path
  const path1 = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK * 0.8, 3), pathMat);
  path1.rotation.x = -Math.PI / 2;
  path1.position.set(blockCenterX, 0.07, blockCenterZ);
  scene.add(path1);
  registerStaticMesh(path1, pathMat);
  // Vertical path
  const path2 = new THREE.Mesh(new THREE.PlaneGeometry(3, BLOCK * 0.8), pathMat);
  path2.rotation.x = -Math.PI / 2;
  path2.position.set(blockCenterX, 0.07, blockCenterZ);
  scene.add(path2);
  registerStaticMesh(path2, pathMat);
  // Diagonal path
  const path3 = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK * 0.9, 2.5), pathMat);
  path3.rotation.x = -Math.PI / 2;
  path3.rotation.z = Math.PI / 4;
  path3.position.set(blockCenterX, 0.07, blockCenterZ);
  scene.add(path3);
  registerStaticMesh(path3, pathMat);

  // Trees — mix of palm and deciduous
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
      registerStaticMesh(trunk, trunkMat);
      const canopy = new THREE.Mesh(new THREE.SphereGeometry(2.5, 8, 6), palmCanopyMat);
      canopy.position.y = 6.5;
      canopy.scale.set(1, 0.5, 1);
      group.add(canopy);
      registerStaticMesh(canopy, palmCanopyMat);
    } else {
      // Deciduous tree (sphere canopy + thicker trunk)
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 5, 8), trunkMat);
      trunk.position.y = 2.5;
      group.add(trunk);
      registerStaticMesh(trunk, trunkMat);
      const canopy = new THREE.Mesh(new THREE.SphereGeometry(3, 8, 8), decidCanopyMat);
      canopy.position.y = 6;
      group.add(canopy);
      registerStaticMesh(canopy, decidCanopyMat);
    }
    group.rotation.x = (Math.random() - 0.5) * 0.05;
    group.rotation.z = (Math.random() - 0.5) * 0.05;
    group.position.set(tx, 0, tz);
    scene.add(group);
    // Tree trunk collision
    pushAABB(tx, tz, 1, 1, 6);
  }

  // Fountain (center)
  // Base cylinder
  const base = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.5, 1, 16), fountainMat);
  base.position.set(blockCenterX, 0.5, blockCenterZ);
  scene.add(base);
  registerStaticMesh(base, fountainMat);
  // Water pool
  const pool = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.8, 0.3, 16), waterMat);
  pool.position.set(blockCenterX, 1.15, blockCenterZ);
  scene.add(pool);
  registerStaticMesh(pool, waterMat);
  // Center column
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 3, 8), fountainMat);
  column.position.set(blockCenterX, 2.5, blockCenterZ);
  scene.add(column);
  registerStaticMesh(column, fountainMat);
  // Top sphere (water spray effect)
  const spray = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 8), sprayMat);
  spray.position.set(blockCenterX, 4.2, blockCenterZ);
  scene.add(spray);
  registerStaticMesh(spray, sprayMat);

  // Benches — 4-6 along paths
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
    registerStaticMesh(bench, benchMat);
  }
  // No AABB entries — parks are fully open
}
