// ── Ground & Nature System ──────────────────────────────────────────────
// Provides textured ground, grass, rocks, flowers, weeds, and industrial
// ground detail for the city.  All heavy geometry is either instanced or
// merged via registerStaticMesh so draw-call count stays low.

import * as THREE from 'three';
import { scene, camera } from './renderer.js';
import { state } from './state.js';
import { GRID, BLOCK, ROAD, CELL, CITY_SIZE, HALF_CITY } from './constants.js';
import { DISTRICT_MAP, getDistrict } from './city-constants.js';
import { registerStaticMesh } from './geometry-merger.js';

// ── Shared helpers ─────────────────────────────────────────────────────

const dummy = new THREE.Object3D();
const _color = new THREE.Color();

/** True when (px, pz) sits on any road grid-line (within ROAD/2). */
function isOnRoad(px, pz) {
  for (let i = 0; i <= GRID; i++) {
    const line = -HALF_CITY + i * CELL;
    if (Math.abs(px - line) < ROAD / 2) return true;
    if (Math.abs(pz - line) < ROAD / 2) return true;
  }
  return false;
}

/** True when (px, pz) overlaps any building AABB. */
function isInsideBuilding(px, pz) {
  for (let k = 0; k < state.buildings.length; k++) {
    const b = state.buildings[k];
    if (px > b.minX && px < b.maxX && pz > b.minZ && pz < b.maxZ) return true;
  }
  return false;
}

/** Returns the district code for a world-space position. */
function districtAt(px, pz) {
  const gi = Math.floor((pz + HALF_CITY) / CELL);
  const gj = Math.floor((px + HALF_CITY) / CELL);
  if (gi < 0 || gi >= GRID || gj < 0 || gj >= GRID) return null;
  return DISTRICT_MAP[gi][gj];
}

/** Block center from grid indices. */
function blockCenter(gi, gj) {
  return {
    cx: -HALF_CITY + gj * CELL + ROAD / 2 + BLOCK / 2,
    cz: -HALF_CITY + gi * CELL + ROAD / 2 + BLOCK / 2,
  };
}

/** Random position inside a block, offset from its center. */
function randomInBlock(cx, cz, margin) {
  const half = BLOCK / 2 - (margin || 2);
  return {
    x: cx + (Math.random() - 0.5) * 2 * half,
    z: cz + (Math.random() - 0.5) * 2 * half,
  };
}

// ── 1. Ground Texture ──────────────────────────────────────────────────

export function createGroundTexture() {
  const size = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // District-based colours — darker palette to avoid washed-out look
  // Each entry: [center color, edge color] for radial gradient
  const districtColors = {
    RES:  ['#2e5a22', '#3a6830'],
    PARK: ['#285a1e', '#356828'],
    IND:  ['#4a4538', '#555045'],
    DT:   ['#484848', '#555555'],
    COM:  ['#4e4e48', '#585852'],
    LOT:  ['#454540', '#505048'],
  };

  const cellPx = size / GRID; // pixels per cell

  // Fill background dark so edges outside cells aren't white
  ctx.fillStyle = '#333333';
  ctx.fillRect(0, 0, size, size);

  // Paint each cell with a radial gradient that blends into neighbours
  for (let gi = 0; gi < GRID; gi++) {
    for (let gj = 0; gj < GRID; gj++) {
      const dist = getDistrict(gi, gj);
      const shades = districtColors[dist] || districtColors.COM;

      const cx = (gj + 0.5) * cellPx;
      const cy = (gi + 0.5) * cellPx;
      const radius = cellPx * 0.75;

      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      grad.addColorStop(0, shades[0]);
      grad.addColorStop(1, shades[1]);

      ctx.fillStyle = grad;
      // Slightly oversized rect so neighbours overlap and blend
      ctx.fillRect(
        Math.floor(gj * cellPx) - 2,
        Math.floor(gi * cellPx) - 2,
        Math.ceil(cellPx) + 4,
        Math.ceil(cellPx) + 4
      );
    }
  }

  // Noise dots for dirt / gravel variation — darker palette
  for (let d = 0; d < 50000; d++) {
    const dx = Math.random() * size;
    const dy = Math.random() * size;
    const gi = Math.floor(dy / cellPx);
    const gj = Math.floor(dx / cellPx);
    if (gi < 0 || gi >= GRID || gj < 0 || gj >= GRID) continue;
    const dist = getDistrict(gi, gj);
    let r, g, b;
    if (dist === 'RES' || dist === 'PARK') {
      r = 30 + Math.random() * 30;
      g = 55 + Math.random() * 45;
      b = 20 + Math.random() * 25;
    } else if (dist === 'IND') {
      const v = 50 + Math.random() * 35;
      r = v; g = v - 5; b = v - 12;
    } else {
      const v = 50 + Math.random() * 40;
      r = v; g = v; b = v - 3;
    }
    ctx.fillStyle = `rgb(${r|0},${g|0},${b|0})`;
    ctx.fillRect(dx | 0, dy | 0, 1, 1);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearMipMapLinearFilter;
  tex.magFilter = THREE.LinearFilter;

  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
}

// ── 2. Grass Tufts (chunked InstancedMesh) ─────────────────────────────

function createGrassTufts() {
  // Grass is split into a 5x5 grid of chunks for distance culling.
  const CHUNKS = 5;
  const chunkCells = GRID / CHUNKS; // 2 cells per chunk
  const chunkSize = chunkCells * CELL;

  const shortGeo = new THREE.ConeGeometry(0.15, 0.6, 4);
  const tallGeo  = new THREE.ConeGeometry(0.2, 1.0, 4);
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x44aa33, roughness: 0.9 });

  // Density per district (attempts per block)
  const density = { PARK: 60, RES: 40, COM: 15, DT: 5, IND: 0, LOT: 5 };

  // First pass — gather positions per chunk
  const chunkPositions = []; // [chunkIdx] => [{x, z, tall}]
  for (let ci = 0; ci < CHUNKS; ci++) {
    for (let cj = 0; cj < CHUNKS; cj++) {
      chunkPositions.push([]);
    }
  }

  for (let gi = 0; gi < GRID; gi++) {
    for (let gj = 0; gj < GRID; gj++) {
      const dist = getDistrict(gi, gj);
      const attempts = density[dist] || 0;
      if (attempts === 0) continue;

      const { cx, cz } = blockCenter(gi, gj);

      for (let a = 0; a < attempts; a++) {
        const pos = randomInBlock(cx, cz, 2);
        if (isOnRoad(pos.x, pos.z)) continue;
        if (isInsideBuilding(pos.x, pos.z)) continue;

        const ci = Math.min(CHUNKS - 1, Math.floor((gi) / chunkCells));
        const cj = Math.min(CHUNKS - 1, Math.floor((gj) / chunkCells));
        const idx = ci * CHUNKS + cj;
        chunkPositions[idx].push({ x: pos.x, z: pos.z, tall: Math.random() < 0.3 });
      }
    }
  }

  // Second pass — build InstancedMeshes per chunk
  const allMeshes = [];

  for (let ci = 0; ci < CHUNKS; ci++) {
    for (let cj = 0; cj < CHUNKS; cj++) {
      const idx = ci * CHUNKS + cj;
      const points = chunkPositions[idx];
      if (points.length === 0) continue;

      const shortPoints = points.filter(p => !p.tall);
      const tallPoints  = points.filter(p => p.tall);

      // Center of this chunk in world space
      const chunkCX = -HALF_CITY + (cj + 0.5) * chunkSize;
      const chunkCZ = -HALF_CITY + (ci + 0.5) * chunkSize;

      for (const [geo, pts, yOffset] of [
        [shortGeo, shortPoints, 0.3],
        [tallGeo,  tallPoints,  0.5],
      ]) {
        if (pts.length === 0) continue;

        const mesh = new THREE.InstancedMesh(geo, grassMat.clone(), pts.length);
        mesh.instanceColor = new THREE.InstancedBufferAttribute(
          new Float32Array(pts.length * 3), 3
        );

        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          dummy.position.set(p.x, yOffset, p.z);
          dummy.rotation.set(
            (Math.random() - 0.5) * 0.3,
            Math.random() * Math.PI * 2,
            (Math.random() - 0.5) * 0.3
          );
          dummy.scale.setScalar(0.8 + Math.random() * 0.5);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);

          // Per-instance green shade
          const g = 0.35 + Math.random() * 0.45;
          _color.setRGB(0.1 + Math.random() * 0.15, g, 0.05 + Math.random() * 0.1);
          mesh.setColorAt(i, _color);
        }

        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.needsUpdate = true;
        mesh.castShadow = true;
        mesh.receiveShadow = false;
        mesh.frustumCulled = true;

        // Store chunk center for distance culling
        mesh.userData.chunkCX = chunkCX;
        mesh.userData.chunkCZ = chunkCZ;

        scene.add(mesh);
        allMeshes.push(mesh);
      }
    }
  }

  state.grassInstances = allMeshes;
  return allMeshes;
}

// ── 3. Rocks & Pebbles (merged geometry) ───────────────────────────────

function createRocksAndPebbles() {
  // Pooled materials
  const rockMats = [
    new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.92 }),
    new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.92 }),
    new THREE.MeshStandardMaterial({ color: 0x8B7355, roughness: 0.92 }),
    new THREE.MeshStandardMaterial({ color: 0xA09070, roughness: 0.88 }),
  ];

  function pickMat() {
    return rockMats[Math.floor(Math.random() * rockMats.length)];
  }

  /** Place a single rock mesh at (px, pz). */
  function placeRock(px, pz, minR, maxR) {
    const r = minR + Math.random() * (maxR - minR);
    const geo = new THREE.DodecahedronGeometry(r, 0);
    const mat = pickMat();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(px, Math.random() * 0.1, pz);
    mesh.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );
    scene.add(mesh);
    registerStaticMesh(mesh, mat);
  }

  /** Place a cluster of 3-6 pebbles near (px, pz). */
  function placePebbleCluster(px, pz) {
    const count = 3 + Math.floor(Math.random() * 4);
    const mat = pickMat();
    for (let i = 0; i < count; i++) {
      const r = 0.1 + Math.random() * 0.1;
      const geo = new THREE.IcosahedronGeometry(r, 0);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        px + (Math.random() - 0.5) * 1.5,
        Math.random() * 0.05,
        pz + (Math.random() - 0.5) * 1.5
      );
      mesh.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      );
      scene.add(mesh);
      registerStaticMesh(mesh, mat);
    }
  }

  // Per-block density
  const rockConfig = {
    IND:  { rocks: 30, pebbleClusters: 15 },
    DT:   { rocks: 0,  pebbleClusters: 5 },
    RES:  { rocks: 3,  pebbleClusters: 0 },
    COM:  { rocks: 0,  pebbleClusters: 5 },
    PARK: { rocks: 8,  pebbleClusters: 0 },
    LOT:  { rocks: 0,  pebbleClusters: 3 },
  };

  for (let gi = 0; gi < GRID; gi++) {
    for (let gj = 0; gj < GRID; gj++) {
      const dist = getDistrict(gi, gj);
      const cfg = rockConfig[dist];
      if (!cfg) continue;
      const { cx, cz } = blockCenter(gi, gj);

      for (let r = 0; r < cfg.rocks; r++) {
        const pos = randomInBlock(cx, cz, 3);
        if (isOnRoad(pos.x, pos.z) || isInsideBuilding(pos.x, pos.z)) continue;
        placeRock(pos.x, pos.z, 0.3, 0.8);
      }

      for (let p = 0; p < cfg.pebbleClusters; p++) {
        // DT pebbles sit near block edges
        let pos;
        if (dist === 'DT') {
          const edge = Math.random() < 0.5;
          const half = BLOCK / 2 - 2;
          if (edge) {
            pos = {
              x: cx + (Math.random() < 0.5 ? -1 : 1) * (half - Math.random() * 3),
              z: cz + (Math.random() - 0.5) * BLOCK * 0.5,
            };
          } else {
            pos = {
              x: cx + (Math.random() - 0.5) * BLOCK * 0.5,
              z: cz + (Math.random() < 0.5 ? -1 : 1) * (half - Math.random() * 3),
            };
          }
        } else {
          pos = randomInBlock(cx, cz, 3);
        }
        if (isOnRoad(pos.x, pos.z) || isInsideBuilding(pos.x, pos.z)) continue;
        placePebbleCluster(pos.x, pos.z);
      }
    }
  }
}

// ── 4. Flowers & Gardens ───────────────────────────────────────────────

function createFlowersAndGardens() {
  const flowerColors = [0xFF69B4, 0xFF2222, 0xFFDD00, 0xFFEEFF, 0x9933FF];
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x337722, roughness: 0.9 });
  const gardenBedMat = new THREE.MeshStandardMaterial({ color: 0x5C3317, roughness: 0.95 });

  // Collect all flower head positions first, then build a single InstancedMesh
  const flowerHeads = []; // { x, y, z, colorIdx }
  const stemGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.4, 4);
  const gardenGeo = new THREE.BoxGeometry(3, 0.15, 2);

  for (let gi = 0; gi < GRID; gi++) {
    for (let gj = 0; gj < GRID; gj++) {
      const dist = getDistrict(gi, gj);
      if (dist !== 'RES' && dist !== 'PARK') continue;
      const { cx, cz } = blockCenter(gi, gj);

      // Flower clusters near block edges
      const clusterCount = 5 + Math.floor(Math.random() * 11);
      const half = BLOCK / 2 - 3;

      for (let c = 0; c < clusterCount; c++) {
        // Near-edge position
        const side = Math.floor(Math.random() * 4);
        let fx, fz;
        if (side === 0) {
          fx = cx + (Math.random() - 0.5) * BLOCK * 0.6;
          fz = cz - half + Math.random() * 4;
        } else if (side === 1) {
          fx = cx + (Math.random() - 0.5) * BLOCK * 0.6;
          fz = cz + half - Math.random() * 4;
        } else if (side === 2) {
          fx = cx - half + Math.random() * 4;
          fz = cz + (Math.random() - 0.5) * BLOCK * 0.6;
        } else {
          fx = cx + half - Math.random() * 4;
          fz = cz + (Math.random() - 0.5) * BLOCK * 0.6;
        }

        if (isOnRoad(fx, fz) || isInsideBuilding(fx, fz)) continue;

        // Small cluster of 2-4 flowers
        const count = 2 + Math.floor(Math.random() * 3);
        for (let f = 0; f < count; f++) {
          const px = fx + (Math.random() - 0.5) * 1.2;
          const pz = fz + (Math.random() - 0.5) * 1.2;
          const stemHeight = 0.3 + Math.random() * 0.2;

          // Stem (merged)
          const stem = new THREE.Mesh(stemGeo, stemMat);
          stem.position.set(px, stemHeight / 2, pz);
          stem.scale.y = stemHeight / 0.4;
          scene.add(stem);
          registerStaticMesh(stem, stemMat);

          flowerHeads.push({
            x: px, y: stemHeight + 0.1, z: pz,
            colorIdx: Math.floor(Math.random() * flowerColors.length),
          });
        }
      }

      // Garden beds in RES blocks
      if (dist === 'RES') {
        const bedCount = 2 + Math.floor(Math.random() * 2);
        for (let b = 0; b < bedCount; b++) {
          const pos = randomInBlock(cx, cz, 8);
          if (isOnRoad(pos.x, pos.z) || isInsideBuilding(pos.x, pos.z)) continue;

          const bed = new THREE.Mesh(gardenGeo, gardenBedMat);
          bed.position.set(pos.x, 0.08, pos.z);
          bed.rotation.y = Math.random() * Math.PI;
          scene.add(bed);
          registerStaticMesh(bed, gardenBedMat);

          // A few flowers on the bed
          for (let f = 0; f < 4; f++) {
            const px = pos.x + (Math.random() - 0.5) * 2.5;
            const pz = pos.z + (Math.random() - 0.5) * 1.5;

            const stem = new THREE.Mesh(stemGeo, stemMat);
            stem.position.set(px, 0.28, pz);
            scene.add(stem);
            registerStaticMesh(stem, stemMat);

            flowerHeads.push({
              x: px, y: 0.58, z: pz,
              colorIdx: Math.floor(Math.random() * flowerColors.length),
            });
          }
        }
      }
    }
  }

  // Build InstancedMesh for all flower heads
  if (flowerHeads.length > 0) {
    const headGeo = new THREE.SphereGeometry(0.15, 6, 6);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
    const mesh = new THREE.InstancedMesh(headGeo, headMat, flowerHeads.length);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(flowerHeads.length * 3), 3
    );

    for (let i = 0; i < flowerHeads.length; i++) {
      const h = flowerHeads[i];
      dummy.position.set(h.x, h.y, h.z);
      dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
      dummy.scale.setScalar(0.8 + Math.random() * 0.5);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      _color.setHex(flowerColors[h.colorIdx]);
      mesh.setColorAt(i, _color);
    }

    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = true;
    scene.add(mesh);
  }
}

// ── 5. Sidewalk Weeds (merged) ─────────────────────────────────────────

function createSidewalkWeeds() {
  const weedGeo = new THREE.ConeGeometry(0.08, 0.25, 3);
  const weedMat = new THREE.MeshStandardMaterial({ color: 0x337722, roughness: 0.9 });

  let placed = 0;
  const target = 500;

  // Walk along every road edge (sidewalks sit at +/-(ROAD/2 + 0.75))
  for (let i = 0; i <= GRID && placed < target; i++) {
    const line = -HALF_CITY + i * CELL;

    // Horizontal road sidewalks
    for (let x = -HALF_CITY; x < HALF_CITY && placed < target; x += 3 + Math.random() * 5) {
      if (Math.random() > 0.35) continue;
      const side = Math.random() > 0.5 ? 1 : -1;
      const pz = line + side * (ROAD / 2 + 0.75);
      const px = x + (Math.random() - 0.5) * 2;
      if (isInsideBuilding(px, pz)) continue;

      const weed = new THREE.Mesh(weedGeo, weedMat);
      weed.position.set(px, 0.12, pz);
      weed.rotation.set(
        (Math.random() - 0.5) * 0.4,
        Math.random() * Math.PI * 2,
        (Math.random() - 0.5) * 0.4
      );
      weed.scale.setScalar(0.7 + Math.random() * 0.6);
      scene.add(weed);
      registerStaticMesh(weed, weedMat);
      placed++;
    }

    // Vertical road sidewalks
    for (let z = -HALF_CITY; z < HALF_CITY && placed < target; z += 3 + Math.random() * 5) {
      if (Math.random() > 0.35) continue;
      const side = Math.random() > 0.5 ? 1 : -1;
      const px = line + side * (ROAD / 2 + 0.75);
      const pz = z + (Math.random() - 0.5) * 2;
      if (isInsideBuilding(px, pz)) continue;

      const weed = new THREE.Mesh(weedGeo, weedMat);
      weed.position.set(px, 0.12, pz);
      weed.rotation.set(
        (Math.random() - 0.5) * 0.4,
        Math.random() * Math.PI * 2,
        (Math.random() - 0.5) * 0.4
      );
      weed.scale.setScalar(0.7 + Math.random() * 0.6);
      scene.add(weed);
      registerStaticMesh(weed, weedMat);
      placed++;
    }
  }
}

// ── 6. Gravel & Industrial Detail ──────────────────────────────────────

function createGravelAndIndustrial() {
  const dirtMat  = new THREE.MeshStandardMaterial({ color: 0x8B7355, roughness: 0.95 });
  const gravelMat = new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.95 });
  const oilMat = new THREE.MeshStandardMaterial({
    color: 0x111111,
    transparent: true,
    opacity: 0.4,
    roughness: 1.0,
    depthWrite: false,
  });

  for (let gi = 0; gi < GRID; gi++) {
    for (let gj = 0; gj < GRID; gj++) {
      const dist = getDistrict(gi, gj);
      if (dist !== 'IND') continue;
      const { cx, cz } = blockCenter(gi, gj);

      // Dirt / gravel patches
      const patchCount = 3 + Math.floor(Math.random() * 3);
      for (let p = 0; p < patchCount; p++) {
        const pos = randomInBlock(cx, cz, 5);
        if (isOnRoad(pos.x, pos.z) || isInsideBuilding(pos.x, pos.z)) continue;

        const w = 3 + Math.random() * 5;
        const h = 3 + Math.random() * 5;
        const geo = new THREE.PlaneGeometry(w, h);
        const mat = Math.random() > 0.5 ? dirtMat : gravelMat;
        const patch = new THREE.Mesh(geo, mat);
        patch.rotation.x = -Math.PI / 2;
        patch.rotation.z = Math.random() * Math.PI;
        patch.position.set(pos.x, 0.05, pos.z);
        scene.add(patch);
        registerStaticMesh(patch, mat);
      }

      // Oil stain decals
      const oilCount = 1 + Math.floor(Math.random() * 3);
      for (let o = 0; o < oilCount; o++) {
        const pos = randomInBlock(cx, cz, 8);
        if (isOnRoad(pos.x, pos.z) || isInsideBuilding(pos.x, pos.z)) continue;

        const radius = 1 + Math.random();
        const geo = new THREE.CircleGeometry(radius, 8);
        const stain = new THREE.Mesh(geo, oilMat);
        stain.rotation.x = -Math.PI / 2;
        stain.position.set(pos.x, 0.03, pos.z);
        scene.add(stain);
        registerStaticMesh(stain, oilMat);
      }
    }
  }
}

// ── 7. Distance Culling ────────────────────────────────────────────────

const GRASS_CULL_DISTANCE = 400;

export function updateGrassCulling() {
  const meshes = state.grassInstances;
  if (!meshes) return;

  const camX = camera.position.x;
  const camZ = camera.position.z;

  for (let i = 0; i < meshes.length; i++) {
    const m = meshes[i];
    const dx = camX - m.userData.chunkCX;
    const dz = camZ - m.userData.chunkCZ;
    m.visible = (dx * dx + dz * dz) < GRASS_CULL_DISTANCE * GRASS_CULL_DISTANCE;
  }
}

// ── Public API ─────────────────────────────────────────────────────────

export function createGroundCover() {
  createGrassTufts();
  createRocksAndPebbles();
  createFlowersAndGardens();
  createSidewalkWeeds();
  createGravelAndIndustrial();
}
