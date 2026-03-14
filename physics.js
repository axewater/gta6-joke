import { state } from './state.js';
import { RAGDOLL_KILL_SPEED } from './constants.js';

// ── AABB Building Collision ─────────────────────────────────────────────
export function collideAABB(x, z, halfW, halfD, skipRamps = false) {
  let cx = x, cz = z;
  for (const b of state.buildings) {
    if (skipRamps && b.isRamp) continue;
    const overlapX = Math.min(cx + halfW, b.maxX) - Math.max(cx - halfW, b.minX);
    const overlapZ = Math.min(cz + halfD, b.maxZ) - Math.max(cz - halfD, b.minZ);
    if (overlapX > 0 && overlapZ > 0) {
      if (overlapX < overlapZ) {
        cx += (cx < (b.minX + b.maxX) / 2) ? -overlapX : overlapX;
      } else {
        cz += (cz < (b.minZ + b.maxZ) / 2) ? -overlapZ : overlapZ;
      }
    }
  }
  return { x: cx, z: cz };
}

// ── Trigger Ragdoll ─────────────────────────────────────────────────────
export function triggerRagdoll(vx, vy, vz, lethal) {
  if (state.ragdoll.active) return;
  const speed = Math.sqrt(vx * vx + vz * vz);

  state.ragdoll.active = true;
  state.ragdoll.vx = vx;
  state.ragdoll.vy = Math.max(8, speed * 0.4);
  state.ragdoll.vz = vz;
  state.ragdoll.rotX = (Math.random() - 0.5) * 8;
  state.ragdoll.rotZ = (Math.random() - 0.5) * 8;
  state.ragdoll.timer = 2.0;
  state.ragdoll.lethal = lethal || speed > RAGDOLL_KILL_SPEED;

  if (state.ragdoll.lethal) {
    state.health = 0;
  } else {
    state.health -= Math.min(80, speed * 3);
  }

  // Camera shake
  state.cameraShake.intensity = 1.5;
  state.cameraShake.timer = 1.5;
}

// ── Update Ragdoll ──────────────────────────────────────────────────────
export function updateRagdoll(dt) {
  if (!state.ragdoll.active) return;

  const r = state.ragdoll;
  const p = state.player;
  const GRAVITY = -30;

  // Apply velocity
  p.x += r.vx * dt;
  p.y += r.vy * dt;
  p.z += r.vz * dt;

  r.vy += GRAVITY * dt;

  // Tumble rotation
  p.mesh.rotation.x += r.rotX * dt;
  p.mesh.rotation.z += r.rotZ * dt;

  // Bounce on ground
  if (p.y < 0) {
    p.y = 0;
    r.vy = Math.abs(r.vy) * 0.35;
    r.vx *= 0.6;
    r.vz *= 0.6;
    r.rotX *= 0.5;
    r.rotZ *= 0.5;
  }

  p.mesh.position.set(p.x, p.y, p.z);

  r.timer -= dt;
  if (r.timer <= 0) {
    // Reset ragdoll
    r.active = false;
    p.mesh.rotation.x = 0;
    p.mesh.rotation.z = 0;
    p.mesh.rotation.y = 0;
    r.vx = 0; r.vy = 0; r.vz = 0;
    r.rotX = 0; r.rotZ = 0;
  }
}

// ── Check Vehicle → Player Collision ───────────────────────────────────
export function checkVehiclePlayerCollision() {
  if (state.isInVehicle || state.ragdoll.active || state.isDead) return;

  const px = state.player.x;
  const pz = state.player.z;

  const allCars = [...state.trafficCars, ...state.policeCars];

  for (const car of allCars) {
    const dx = px - car.x;
    const dz = pz - car.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < car.halfW + 1.5) {
      const speed = Math.abs(car.speed);
      if (speed < 2) continue; // too slow to matter

      const lethal = speed > RAGDOLL_KILL_SPEED;
      // Velocity away from car in car's direction
      const fwdX = Math.sin(car.rotation) * speed * 1.2;
      const fwdZ = Math.cos(car.rotation) * speed * 1.2;

      triggerRagdoll(fwdX, 0, fwdZ, lethal);
      break;
    }
  }
}
