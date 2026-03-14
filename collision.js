import { state } from './state.js';
import { CAR_NPC_KILL_SPEED, CAR_CAR_MIN_DAMAGE, CAR_CAR_DAMAGE_MULT, CAR_BOUNCE_RESTITUTION } from './constants.js';
import { launchNpcRagdoll } from './npc-ragdoll.js';
import { applyVehicleDamage } from './vehicle-damage.js';
import { commitCrime } from './player.js';

// ── Player Car vs NPC Collision ─────────────────────────────────────────
export function checkPlayerCarNpcCollision() {
  if (!state.isInVehicle) return;
  const v = state.currentVehicle;
  if (v.isExploded) return;
  const carSpeed = Math.abs(v.speed);
  if (carSpeed < CAR_NPC_KILL_SPEED) return;

  for (const npc of state.npcs) {
    if (!npc.alive) continue;
    if (npc.ragdoll && npc.ragdoll.active) continue;

    const dx = npc.x - v.x;
    const dz = npc.z - v.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < v.halfW + 1.5) {
      launchNpcRagdoll(npc, carSpeed, v.rotation);
      v.speed *= 0.9;
      state.cameraShake.intensity = 0.8;
      state.cameraShake.timer = 0.5;
      commitCrime();
    }
  }

  // Also check police officers
  for (const cop of state.policeOfficers) {
    if (cop.ragdoll && cop.ragdoll.active) continue;
    if (cop.dead) continue;

    const dx = cop.x - v.x;
    const dz = cop.z - v.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < v.halfW + 1.5) {
      launchNpcRagdoll(cop, carSpeed, v.rotation);
      v.speed *= 0.9;
      state.cameraShake.intensity = 0.8;
      state.cameraShake.timer = 0.5;
      commitCrime();
    }
  }

  // Also check gang NPCs
  for (const gnpc of state.gangNpcs) {
    if (gnpc.dead) continue;
    if (gnpc.ragdoll && gnpc.ragdoll.active) continue;

    const dx = gnpc.x - v.x;
    const dz = gnpc.z - v.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < v.halfW + 1.5) {
      gnpc.dead = true;
      gnpc.mesh.rotation.x = Math.PI / 2;
      gnpc.respawnTimer = 15;
      setTimeout(() => { gnpc.mesh.visible = false; }, 1000);
      v.speed *= 0.9;
      state.cameraShake.intensity = 0.8;
      state.cameraShake.timer = 0.5;
      commitCrime();
    }
  }
}

// ── Car vs Car Collision ────────────────────────────────────────────────
export function checkCarCarCollisions() {
  if (!state.isInVehicle) return;
  const v = state.currentVehicle;
  if (v.isExploded) return;

  const allAICars = [...state.trafficCars, ...state.policeCars, ...state.vehicles];

  for (const other of allAICars) {
    if (other === v) continue;
    if (other.isExploded) continue;

    const dx = other.x - v.x;
    const dz = other.z - v.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const minDist = v.halfD + other.halfD; // ~5.0

    if (dist < minDist) {
      const relSpeed = Math.abs(v.speed) + Math.abs(other.speed);
      if (relSpeed < 3) continue;

      // Separate cars
      const overlap = minDist - dist;
      const nx = dist > 0 ? dx / dist : 1;
      const nz = dist > 0 ? dz / dist : 0;

      v.x -= nx * overlap * 0.5;
      v.z -= nz * overlap * 0.5;
      other.x += nx * overlap * 0.5;
      other.z += nz * overlap * 0.5;

      // Bounce speeds
      v.speed *= -CAR_BOUNCE_RESTITUTION;
      other.speed *= -CAR_BOUNCE_RESTITUTION;

      // Push AI car away
      const pushForce = Math.abs(v.speed) * 0.5 + 3;
      other.x += nx * pushForce * 0.3;
      other.z += nz * pushForce * 0.3;

      // Damage to both
      const damage = Math.max(CAR_CAR_MIN_DAMAGE, relSpeed * CAR_CAR_DAMAGE_MULT);
      applyVehicleDamage(v, damage);
      applyVehicleDamage(other, damage);

      // Camera shake
      state.cameraShake.intensity = 1.2;
      state.cameraShake.timer = 0.8;

      // Update mesh positions
      v.mesh.position.set(v.x, 0, v.z);
      other.mesh.position.set(other.x, 0, other.z);
    }
  }
}
