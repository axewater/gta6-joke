import * as THREE from 'three';
import { scene } from './renderer.js';
import { state } from './state.js';
import { BLOCK, DOWNTOWN_COLORS } from './constants.js';
import { S } from './city-constants.js';
import { pick, clampToBlock, addBuilding, pushAABB, addNeonSign, makeSignTexture, BRAND_NAMES, AD_TEXTS, HOTEL_NAMES, BUSINESS_NAMES } from './city-helpers.js';
import { registerStaticMesh } from './geometry-merger.js';

const antennaMat = new THREE.MeshStandardMaterial({ color: 0xAAAAAA, metalness: 0.8, roughness: 0.3 });
const spireMat = new THREE.MeshStandardMaterial({ color: 0xAAAAAA, metalness: 0.9, roughness: 0.2 });

// Elevator materials (module-scope, shared)
const elevTubeMat = new THREE.MeshStandardMaterial({
  color: 0x88bbcc, transparent: true, opacity: 0.25, roughness: 0.1, metalness: 0.5, depthWrite: false
});
const elevCarMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0x88aacc, emissiveIntensity: 0.3, metalness: 0.5, roughness: 0.4 });
const elevRailMat = new THREE.MeshStandardMaterial({ color: 0xAAAAAA, metalness: 0.8 });

export function createSkyscraper(blockCenterX, blockCenterZ) {
  const count = 4 + Math.floor(Math.random() * 4); // 4-7

  // 15% chance of a supertall landmark per block (1 max)
  if (Math.random() < 0.15) {
    const stH = (250 + Math.random() * 100) * S;
    const stW = (10 + Math.random() * 6) * S, stD = (10 + Math.random() * 6) * S;
    const color = pick(DOWNTOWN_COLORS);
    addBuilding(blockCenterX, blockCenterZ, stW, stH, stD, color, true);
    pushAABB(blockCenterX, blockCenterZ, stW, stD, stH);
    const spire = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.4, 25, 6),
      spireMat
    );
    spire.position.set(blockCenterX, stH + 12.5, blockCenterZ);
    scene.add(spire);
    registerStaticMesh(spire, spireMat);
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
    registerStaticMesh(antenna, antennaMat);

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

    // ── Diverse building signage ──────────────────────────────────────
    // Large LED ad panel (40% chance)
    if (Math.random() < 0.4) {
      const signTexts = [...BRAND_NAMES, ...AD_TEXTS];
      const text = signTexts[Math.floor(Math.random() * signTexts.length)];
      const bgColors = ['#110022', '#001122', '#221100', '#002200', '#220011'];
      const textColors = ['#ff3366', '#33ffcc', '#ffcc00', '#ff6600', '#cc33ff', '#33ccff'];
      const bgColor = bgColors[Math.floor(Math.random() * bgColors.length)];
      const textColor = textColors[Math.floor(Math.random() * textColors.length)];
      const signTex = makeSignTexture(text, bgColor, textColor);
      const signW = 4 + Math.random() * 6;
      const signH = 2 + Math.random() * 3;
      const signMat = new THREE.MeshStandardMaterial({
        map: signTex, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 1.5
      });
      const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(signW, signH), signMat);
      const signY = height * (0.4 + Math.random() * 0.35);
      // Random face
      const face = Math.floor(Math.random() * 4);
      if (face === 0) signMesh.position.set(cx, signY, cz + actualD / 2 + 0.15);
      else if (face === 1) { signMesh.position.set(cx, signY, cz - actualD / 2 - 0.15); signMesh.rotation.y = Math.PI; }
      else if (face === 2) { signMesh.position.set(cx + actualW / 2 + 0.15, signY, cz); signMesh.rotation.y = Math.PI / 2; }
      else { signMesh.position.set(cx - actualW / 2 - 0.15, signY, cz); signMesh.rotation.y = -Math.PI / 2; }
      scene.add(signMesh);
    }

    // Hotel/business name near top (30% chance)
    if (Math.random() < 0.3) {
      const names = [...HOTEL_NAMES, ...BUSINESS_NAMES];
      const text = names[Math.floor(Math.random() * names.length)];
      const signTex = makeSignTexture(text, '#000', '#ffffff', 256, 48);
      const signW = Math.min(actualW * 0.7, 12);
      const signMat = new THREE.MeshStandardMaterial({
        map: signTex, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 1.0
      });
      const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(signW, 2), signMat);
      signMesh.position.set(cx, height * 0.9, cz + actualD / 2 + 0.15);
      scene.add(signMesh);
    }

    // Exterior elevator (28% chance)
    if (Math.random() < 0.28) {
      if (!state.elevatorCars) state.elevatorCars = [];

      const tubeH = height * 0.85;
      const railH = height * 0.9;
      const onZFace = Math.random() < 0.5;

      let elevX, elevZ;
      if (onZFace) {
        elevX = cx;
        elevZ = cz + actualD / 2 + 1.8;
      } else {
        elevX = cx + actualW / 2 + 1.8;
        elevZ = cz;
      }

      // Tube/shaft
      const tubeGeo = new THREE.CylinderGeometry(1.5, 1.5, tubeH, 8);
      const tube = new THREE.Mesh(tubeGeo, elevTubeMat);
      tube.position.set(elevX, tubeH / 2, elevZ);
      scene.add(tube);
      registerStaticMesh(tube, elevTubeMat);

      // Elevator car (animated — do NOT register for static merging)
      const carGeo = new THREE.BoxGeometry(2.2, 2.5, 2.2);
      const car = new THREE.Mesh(carGeo, elevCarMat);
      const startY = 1.5;
      car.position.set(elevX, startY, elevZ);
      scene.add(car);

      state.elevatorCars.push({
        mesh: car,
        minY: 1.5,
        maxY: tubeH - 1.5,
        speed: 3 + Math.random() * 4,
        direction: 1
      });

      // Track rails (two thin cylinders on either side)
      const railGeo = new THREE.CylinderGeometry(0.08, 0.08, railH, 4);
      const rail1 = new THREE.Mesh(railGeo, elevRailMat);
      const rail2 = new THREE.Mesh(railGeo, elevRailMat);
      if (onZFace) {
        rail1.position.set(elevX - 1.3, railH / 2, elevZ);
        rail2.position.set(elevX + 1.3, railH / 2, elevZ);
      } else {
        rail1.position.set(elevX, railH / 2, elevZ - 1.3);
        rail2.position.set(elevX, railH / 2, elevZ + 1.3);
      }
      scene.add(rail1);
      scene.add(rail2);
      registerStaticMesh(rail1, elevRailMat);
      registerStaticMesh(rail2, elevRailMat);
    }
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

export function updateElevators(dt) {
  if (!state.elevatorCars) return;
  for (const elev of state.elevatorCars) {
    elev.mesh.position.y += elev.speed * elev.direction * dt;
    if (elev.mesh.position.y >= elev.maxY) elev.direction = -1;
    if (elev.mesh.position.y <= elev.minY) elev.direction = 1;
  }
}
