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

// ── Street Light & Traffic Light Destruction ──────────────────────────
export function checkStreetLightCollision() {
  if (!state.isInVehicle) return;
  const v = state.currentVehicle;
  if (!v || v.isExploded) return;
  const speed = Math.abs(v.speed);
  if (speed < 3) return;

  // Street lights
  for (const sl of state.streetLights) {
    if (sl.destroyed) continue;
    const dx = sl.x - v.x;
    const dz = sl.z - v.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < v.halfW + 0.5) {
      if (!sl.damaged && speed < 10) {
        // Light hit — tilt but don't break
        sl.damaged = true;
        sl.tiltAngle = 0.3 + Math.random() * 0.2;
        sl.fallDirX = Math.sin(v.rotation);
        sl.fallDirZ = Math.cos(v.rotation);
        v.speed *= 0.9;
        state.cameraShake.intensity = 0.3;
        state.cameraShake.timer = 0.15;
      } else {
        // Hard hit — break and fall
        sl.destroyed = true;
        sl.aabb.destroyed = true;
        sl.fallDirX = Math.sin(v.rotation);
        sl.fallDirZ = Math.cos(v.rotation);
        sl.fallTimer = 0;
        v.speed *= 0.85;
        state.cameraShake.intensity = 0.5;
        state.cameraShake.timer = 0.25;
      }
    }
  }

  // Traffic lights
  for (const tl of state.trafficLights) {
    if (tl.destroyed) continue;
    const dx = tl.px - v.x;
    const dz = tl.pz - v.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < v.halfW + 0.4) {
      if (!tl.damaged && speed < 10) {
        // Light hit — tilt but don't break
        tl.damaged = true;
        tl.tiltAngle = 0.25 + Math.random() * 0.2;
        tl.fallDirX = Math.sin(v.rotation);
        tl.fallDirZ = Math.cos(v.rotation);
        v.speed *= 0.9;
        state.cameraShake.intensity = 0.3;
        state.cameraShake.timer = 0.15;
      } else {
        // Hard hit — break and fall
        tl.destroyed = true;
        tl.aabb.destroyed = true;
        tl.fallDirX = Math.sin(v.rotation);
        tl.fallDirZ = Math.cos(v.rotation);
        tl.fallTimer = 0;
        v.speed *= 0.8;
        state.cameraShake.intensity = 0.6;
        state.cameraShake.timer = 0.3;
        applyVehicleDamage(v, 5);
      }
    }
  }
}

export function updateFallingLights(dt) {
  // Street lights
  for (const sl of state.streetLights) {
    if (sl.damaged && !sl.destroyed) {
      // Animate tilt smoothly
      const targetX = sl.fallDirZ * sl.tiltAngle;
      const targetZ = -sl.fallDirX * sl.tiltAngle;
      sl.group.rotation.x += (targetX - sl.group.rotation.x) * Math.min(1, dt * 5);
      sl.group.rotation.z += (targetZ - sl.group.rotation.z) * Math.min(1, dt * 5);
      continue;
    }
    if (!sl.destroyed || sl.fallTimer > 2) continue;
    sl.fallTimer += dt;
    const t = Math.min(sl.fallTimer / 0.8, 1);
    const angle = t * Math.PI / 2;
    sl.group.rotation.x = sl.fallDirZ * angle;
    sl.group.rotation.z = -sl.fallDirX * angle;
    if (sl.pointLight.intensity > 0.01) {
      sl.pointLight.intensity *= 0.92;
    }
  }

  // Traffic lights
  for (const tl of state.trafficLights) {
    if (tl.damaged && !tl.destroyed) {
      // Animate tilt smoothly
      const targetX = tl.fallDirZ * tl.tiltAngle;
      const targetZ = -tl.fallDirX * tl.tiltAngle;
      tl.group.rotation.x += (targetX - tl.group.rotation.x) * Math.min(1, dt * 5);
      tl.group.rotation.z += (targetZ - tl.group.rotation.z) * Math.min(1, dt * 5);
      continue;
    }
    if (!tl.destroyed || tl.fallTimer > 2) continue;
    tl.fallTimer += dt;
    const t = Math.min(tl.fallTimer / 0.8, 1);
    const angle = t * Math.PI / 2;
    tl.group.rotation.x = tl.fallDirZ * angle;
    tl.group.rotation.z = -tl.fallDirX * angle;
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
