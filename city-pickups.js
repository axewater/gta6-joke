import * as THREE from 'three';
import { scene } from './renderer.js';
import { state } from './state.js';
import { GRID, CELL, HALF_CITY, ROAD } from './constants.js';
import { S } from './city-constants.js';
import { randomSidewalkPos } from './city-helpers.js';

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
  const store = new THREE.Mesh(new THREE.BoxGeometry(6 * S, 4 * S, 5 * S), storeMat);
  store.position.y = 2 * S;
  store.castShadow = true;
  group.add(store);

  const signMat = new THREE.MeshStandardMaterial({ color: 0xFF4444, emissive: 0xFF4444, emissiveIntensity: 1.5 });
  const sign = new THREE.Mesh(new THREE.BoxGeometry(5, 1, 0.2), signMat);
  sign.position.set(0, 4.5 * S, 2.6 * S);
  group.add(sign);

  const iconMat = new THREE.MeshStandardMaterial({ color: 0xFFD700, emissive: 0xFFD700, emissiveIntensity: 2.0 });
  const icon = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.4, 0.4), iconMat);
  icon.position.set(0, 6 * S, 0);
  group.add(icon);

  group.position.set(x, 0, z);
  scene.add(group);
  state.gunStore = { mesh: group, icon, x, z };
}
