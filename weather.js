import * as THREE from 'three';
import { scene, camera } from './renderer.js';
import { state } from './state.js';

const RAIN_COUNT = 2500;
const RAIN_AREA = 80;
const RAIN_HEIGHT = 60;

export function createRain() {
  const positions = new Float32Array(RAIN_COUNT * 3);
  const velocities = new Float32Array(RAIN_COUNT);

  for (let i = 0; i < RAIN_COUNT; i++) {
    positions[i * 3] = (Math.random() - 0.5) * RAIN_AREA * 2;
    positions[i * 3 + 1] = Math.random() * RAIN_HEIGHT;
    positions[i * 3 + 2] = (Math.random() - 0.5) * RAIN_AREA * 2;
    velocities[i] = 40 + Math.random() * 20;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.PointsMaterial({
    color: 0xAABBDD,
    size: 0.3,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
    sizeAttenuation: true
  });

  const points = new THREE.Points(geo, mat);
  points.visible = false;
  scene.add(points);

  state.rainPoints = points;
  state.rainPoints.userData = { velocities };
  state.rainActive = false;
  state.rainToggleTimer = 30 + Math.random() * 60;
}

export function updateRain(dt) {
  state.rainToggleTimer -= dt;
  if (state.rainToggleTimer <= 0) {
    state.rainActive = !state.rainActive;
    state.rainToggleTimer = state.rainActive
      ? 20 + Math.random() * 40
      : 30 + Math.random() * 60;
  }

  if (!state.rainPoints) return;
  state.rainPoints.visible = state.rainActive;
  if (!state.rainActive) return;

  const posAttr = state.rainPoints.geometry.getAttribute('position');
  const positions = posAttr.array;
  const velocities = state.rainPoints.userData.velocities;

  const camX = camera.position.x;
  const camZ = camera.position.z;
  const windX = 2;

  for (let i = 0; i < RAIN_COUNT; i++) {
    const i3 = i * 3;
    positions[i3] += windX * dt;
    positions[i3 + 1] -= velocities[i] * dt;

    if (positions[i3 + 1] < 0 ||
        Math.abs(positions[i3] - camX) > RAIN_AREA ||
        Math.abs(positions[i3 + 2] - camZ) > RAIN_AREA) {
      positions[i3] = camX + (Math.random() - 0.5) * RAIN_AREA * 2;
      positions[i3 + 1] = RAIN_HEIGHT + Math.random() * 10;
      positions[i3 + 2] = camZ + (Math.random() - 0.5) * RAIN_AREA * 2;
    }
  }

  posAttr.needsUpdate = true;
}
