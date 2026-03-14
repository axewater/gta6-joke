import * as THREE from 'three';
import { scene } from './renderer.js';
import { state } from './state.js';
import { BLOCK, DOWNTOWN_COLORS } from './constants.js';
import { S } from './city-constants.js';
import { pick, clampToBlock, addBuilding, pushAABB, addNeonSign } from './city-helpers.js';

export function createSkyscraper(blockCenterX, blockCenterZ) {
  const count = 4 + Math.floor(Math.random() * 4); // 4-7
  const antennaMat = new THREE.MeshStandardMaterial({ color: 0xAAAAAA, metalness: 0.8, roughness: 0.3 });

  // 15% chance of a supertall landmark per block (1 max)
  if (Math.random() < 0.15) {
    const stH = (250 + Math.random() * 100) * S;
    const stW = (10 + Math.random() * 6) * S, stD = (10 + Math.random() * 6) * S;
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
    const height = (80 + Math.random() * 120) * S; // 80-200 scaled
    const col = b % gridCols;
    const row = Math.floor(b / gridCols);
    const bw = Math.min(cellW * 0.75, (14 + Math.random() * 8) * S);
    const bd = Math.min(cellD * 0.75, (14 + Math.random() * 8) * S);
    const offX = (col + 0.5) * cellW - BLOCK / 2 + (Math.random() - 0.5) * 4;
    const offZ = (row + 0.5) * cellD - BLOCK / 2 + (Math.random() - 0.5) * 4;
    const bx = blockCenterX + offX;
    const bz = blockCenterZ + offZ;
    const c = clampToBlock(bx, bz, bw, bd, blockCenterX, blockCenterZ);
    const actualW = c.maxX - c.minX, actualD = c.maxZ - c.minZ;
    if (actualW < 8 * S || actualD < 8 * S) continue;
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
      const phW = actualW * 0.5, phD = actualD * 0.5, phH = (8 + Math.random() * 6) * S;
      addBuilding(cx, cz, phW, phH, phD, color, true);
      // position it on top
      state.buildingMeshes[state.buildingMeshes.length - 1].position.y = height + phH / 2;
      pushAABB(cx, cz, phW, phD, height + phH);
    }

    // Neon — 50% chance downtown
    addNeonSign(cx, cz, actualW, actualD, height, bounds, 0.5);
  }
}

export function createLShapedBuilding(blockCenterX, blockCenterZ, colors, isDowntown) {
  const height = (20 + Math.random() * 30) * S;
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
