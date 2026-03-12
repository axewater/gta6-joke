import * as THREE from 'three';
import { camera } from './renderer.js';
import { state } from './state.js';

export function updateCamera(dt) {
  state.camera.theta -= state.mouse.dx * 0.003;
  state.camera.phi = Math.max(0.1, Math.min(1.2, state.camera.phi + state.mouse.dy * 0.003));

  const target = state.isInVehicle
    ? new THREE.Vector3(state.currentVehicle.x, 1.5, state.currentVehicle.z)
    : new THREE.Vector3(state.player.x, state.player.y + 1.5, state.player.z);

  let theta = state.camera.theta;
  let phi = state.camera.phi;
  const dist = state.camera.distance;

  // Camera shake
  if (state.cameraShake.timer > 0) {
    state.cameraShake.timer -= dt;
    const i = state.cameraShake.intensity;
    theta += (Math.random() - 0.5) * i * 0.08;
    phi += (Math.random() - 0.5) * i * 0.04;
    state.cameraShake.intensity *= Math.pow(0.05, dt); // fast decay
    if (state.cameraShake.timer <= 0) state.cameraShake.intensity = 0;
  }

  // Ragdoll: camera spins with player tumble
  if (state.ragdoll.active) {
    theta += state.ragdoll.rotZ * dt * 0.3;
  }

  const camX = target.x + dist * Math.sin(theta) * Math.cos(phi);
  const camY = target.y + dist * Math.sin(phi);
  const camZ = target.z + dist * Math.cos(theta) * Math.cos(phi);

  camera.position.lerp(new THREE.Vector3(camX, camY, camZ), 0.1);
  camera.lookAt(target);
}
