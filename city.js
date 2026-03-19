import * as THREE from 'three';
import { scene } from './renderer.js';
import { state } from './state.js';
import {
  GRID, BLOCK, ROAD, CELL, CITY_SIZE, HALF_CITY, WORLD_SCALE,
  BUILDING_COLORS, DOWNTOWN_COLORS, RESIDENTIAL_COLORS,
  RAMP_WIDTH, RAMP_LENGTH, RAMP_HEIGHT,
} from './constants.js';

import { S, getDistrict, SPECIAL_BUILDINGS } from './city-constants.js';
import { pick, clampToBlock, addBuilding, pushAABB, addNeonSign } from './city-helpers.js';
import { registerStaticMesh } from './geometry-merger.js';
import { createSkyscraper, createLShapedBuilding } from './city-buildings-downtown.js';
import { createShop, createGasStation, createLiquorStore, createRestaurant, createDonutShop } from './city-buildings-commercial.js';
import { createHouse, createApartmentBlock, createChurch, createMotel } from './city-buildings-residential.js';
import { createWarehouse, createParkingGarage, createParkingLot, createPark } from './city-buildings-industrial.js';
import { setupLighting, createOceanAndBeach, createPalmTrees, createClouds, createSkyDome, createMountains } from './city-environment.js';
import { createTrafficLights, updateTrafficLights } from './city-traffic.js';
import { createMoneyPickups, createGunStore } from './city-pickups.js';

const yieldFrame = () => new Promise(r => requestAnimationFrame(r));

// ── Re-exports (backward compatibility) ─────────────────────────────────
export { randomSidewalkPos } from './city-helpers.js';
export { setupLighting, createOceanAndBeach, createPalmTrees, createClouds, createSkyDome, createMountains } from './city-environment.js';
export { createTrafficLights, updateTrafficLights } from './city-traffic.js';
export { createMoneyPickups, createGunStore } from './city-pickups.js';

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
    registerStaticMesh(mesh, rampMat);

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
      registerStaticMesh(stripe, stripeMat);
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

export async function createCity() {
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
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.8 });

  // Horizontal roads
  for (let i = 0; i <= GRID; i++) {
    const z = -HALF_CITY + i * CELL;
    const road = new THREE.Mesh(new THREE.PlaneGeometry(CITY_SIZE, ROAD), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.01, z);
    scene.add(road);
    registerStaticMesh(road, roadMat);

    const puddle = new THREE.Mesh(new THREE.PlaneGeometry(CITY_SIZE, ROAD * 0.6), puddleMat);
    puddle.rotation.x = -Math.PI / 2;
    puddle.position.set(0, 0.02, z);
    scene.add(puddle);
    registerStaticMesh(puddle, puddleMat);

    const centerLine = new THREE.Mesh(new THREE.PlaneGeometry(CITY_SIZE, 0.3), yellowMat);
    centerLine.rotation.x = -Math.PI / 2;
    centerLine.position.set(0, 0.02, z);
    scene.add(centerLine);
    registerStaticMesh(centerLine, yellowMat);

    for (let d = -HALF_CITY; d < HALF_CITY; d += 8) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.15), whiteMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(d + 2, 0.02, z + ROAD * 0.25);
      scene.add(dash);
      registerStaticMesh(dash, whiteMat);
      const dash2 = dash.clone();
      dash2.position.z = z - ROAD * 0.25;
      scene.add(dash2);
      registerStaticMesh(dash2, whiteMat);
    }

    const sw1 = new THREE.Mesh(new THREE.BoxGeometry(CITY_SIZE, 0.3, 1.5), sidewalkMat);
    sw1.position.set(0, 0.15, z + ROAD / 2 + 0.75);
    sw1.receiveShadow = true;
    scene.add(sw1);
    registerStaticMesh(sw1, sidewalkMat);
    const sw2 = sw1.clone();
    sw2.position.z = z - ROAD / 2 - 0.75;
    scene.add(sw2);
    registerStaticMesh(sw2, sidewalkMat);
  }

  // Vertical roads
  for (let j = 0; j <= GRID; j++) {
    const x = -HALF_CITY + j * CELL;
    const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD, CITY_SIZE), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(x, 0.015, 0);
    scene.add(road);
    registerStaticMesh(road, roadMat);

    const puddle = new THREE.Mesh(new THREE.PlaneGeometry(ROAD * 0.6, CITY_SIZE), puddleMat);
    puddle.rotation.x = -Math.PI / 2;
    puddle.position.set(x, 0.025, 0);
    scene.add(puddle);
    registerStaticMesh(puddle, puddleMat);

    const centerLine = new THREE.Mesh(new THREE.PlaneGeometry(0.3, CITY_SIZE), yellowMat);
    centerLine.rotation.x = -Math.PI / 2;
    centerLine.position.set(x, 0.025, 0);
    scene.add(centerLine);
    registerStaticMesh(centerLine, yellowMat);

    for (let d = -HALF_CITY; d < HALF_CITY; d += 8) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 4), whiteMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(x + ROAD * 0.25, 0.025, d + 2);
      scene.add(dash);
      registerStaticMesh(dash, whiteMat);
      const dash2 = dash.clone();
      dash2.position.x = x - ROAD * 0.25;
      scene.add(dash2);
      registerStaticMesh(dash2, whiteMat);
    }

    const sw1 = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.3, CITY_SIZE), sidewalkMat);
    sw1.position.set(x + ROAD / 2 + 0.75, 0.15, 0);
    sw1.receiveShadow = true;
    scene.add(sw1);
    registerStaticMesh(sw1, sidewalkMat);
    const sw2 = sw1.clone();
    sw2.position.x = x - ROAD / 2 - 0.75;
    scene.add(sw2);
    registerStaticMesh(sw2, sidewalkMat);
  }

  // ── District-aware building loop ──────────────────────────────────────
  for (let gi = 0; gi < GRID; gi++) {
    for (let gj = 0; gj < GRID; gj++) {
      if ((gi * GRID + gj) % 5 === 0 && (gi + gj) > 0) await yieldFrame();
      const blockCenterX = -HALF_CITY + gj * CELL + ROAD / 2 + BLOCK / 2;
      const blockCenterZ = -HALF_CITY + gi * CELL + ROAD / 2 + BLOCK / 2;

      // Check for special fixed-placement buildings first
      const specialKey = `${gi},${gj}`;
      if (SPECIAL_BUILDINGS[specialKey]) {
        if (SPECIAL_BUILDINGS[specialKey] === 'RESTAURANT') {
          createRestaurant(blockCenterX, blockCenterZ);
        } else if (SPECIAL_BUILDINGS[specialKey] === 'DONUT_SHOP') {
          createDonutShop(blockCenterX, blockCenterZ);
        }
        continue;
      }

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
          // Commercial — expanded roll table
          const roll = Math.random();
          if (roll < 0.05) createGasStation(blockCenterX, blockCenterZ);
          else if (roll < 0.10) createLiquorStore(blockCenterX, blockCenterZ);
          else if (roll < 0.15) createParkingGarage(blockCenterX, blockCenterZ);
          else if (roll < 0.25) createLShapedBuilding(blockCenterX, blockCenterZ, BUILDING_COLORS, false);
          else createShop(blockCenterX, blockCenterZ);
          break;
        }
        case 'RES': {
          // Residential — more variety
          const roll = Math.random();
          if (roll < 0.15) createMotel(blockCenterX, blockCenterZ);
          else if (roll < 0.25) createApartmentBlock(blockCenterX, blockCenterZ);
          else if (roll < 0.35) createChurch(blockCenterX, blockCenterZ);
          else createHouse(blockCenterX, blockCenterZ);
          break;
        }
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

  // ── Street lights — 40 at intersections (grouped for destruction) ─────
  const lightPoleMat = new THREE.MeshStandardMaterial({ color: 0x444444 });
  const bulbGeo = new THREE.SphereGeometry(0.3, 8, 8);
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffeecc, emissive: 0xffeecc, emissiveIntensity: 1 });
  state.bulbMat = bulbMat;

  for (let i = 0; i < 40; i++) {
    if (i > 0 && i % 10 === 0) await yieldFrame();
    const row = Math.floor(Math.random() * (GRID + 1));
    const col = Math.floor(Math.random() * (GRID + 1));
    const lx = -HALF_CITY + col * CELL + (Math.random() > 0.5 ? 1 : -1) * (ROAD / 2 + 0.5);
    const lz = -HALF_CITY + row * CELL + (Math.random() > 0.5 ? 1 : -1) * (ROAD / 2 + 0.5);

    // Group so the whole light can fall as a unit
    const group = new THREE.Group();
    group.position.set(lx, 0, lz);

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 8, 6), lightPoleMat);
    pole.position.set(0, 4, 0);
    group.add(pole);

    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.set(0, 8.2, 0);
    group.add(bulb);

    const pl = new THREE.PointLight(0xffeecc, 0.8, 30);
    pl.position.set(0, 8, 0);
    pl.castShadow = false;
    group.add(pl);

    scene.add(group);

    // Collision AABB (thin pole footprint)
    const aabb = { minX: lx - 0.3, maxX: lx + 0.3, minZ: lz - 0.3, maxZ: lz + 0.3, height: 8, destroyed: false };
    state.buildings.push(aabb);

    state.streetLights.push({
      group, bulb, pointLight: pl,
      x: lx, z: lz,
      aabb,
      destroyed: false,
      fallTimer: 0,
      fallDirX: 0, fallDirZ: 0
    });
  }
}
