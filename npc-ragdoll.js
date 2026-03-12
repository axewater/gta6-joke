import { state } from './state.js';
import { NPC_RAGDOLL_LAUNCH_MULT, NPC_RAGDOLL_DURATION } from './constants.js';

// ── Launch NPC Ragdoll ──────────────────────────────────────────────────
export function launchNpcRagdoll(npc, carSpeed, carRotation) {
  npc.alive = false;
  npc.mesh.visible = true;

  const launchX = Math.sin(carRotation) * carSpeed * NPC_RAGDOLL_LAUNCH_MULT;
  const launchZ = Math.cos(carRotation) * carSpeed * NPC_RAGDOLL_LAUNCH_MULT;
  const launchY = Math.max(6, carSpeed * 0.5);

  npc.ragdoll = {
    active: true,
    vx: launchX,
    vy: launchY,
    vz: launchZ,
    rotX: (Math.random() - 0.5) * 10,
    rotZ: (Math.random() - 0.5) * 10,
    timer: NPC_RAGDOLL_DURATION,
    y: 0,
    bounceCount: 0
  };
}

// ── Update All NPC Ragdolls ─────────────────────────────────────────────
export function updateNpcRagdolls(dt) {
  const GRAVITY = -30;

  for (const npc of state.npcs) {
    if (!npc.ragdoll || !npc.ragdoll.active) continue;

    const r = npc.ragdoll;

    // Apply velocity
    npc.x += r.vx * dt;
    r.y += r.vy * dt;
    npc.z += r.vz * dt;

    r.vy += GRAVITY * dt;

    // Tumble rotation
    npc.mesh.rotation.x += r.rotX * dt;
    npc.mesh.rotation.z += r.rotZ * dt;

    // Ground bounce
    if (r.y < 0) {
      r.y = 0;
      r.bounceCount++;
      r.vy = Math.abs(r.vy) * 0.3;  // restitution
      r.vx *= 0.5;  // friction
      r.vz *= 0.5;

      if (r.bounceCount >= 3) {
        r.rotX *= 0.1;
        r.rotZ *= 0.1;
        r.vx *= 0.3;
        r.vz *= 0.3;
      }
    }

    npc.mesh.position.set(npc.x, r.y, npc.z);

    r.timer -= dt;
    if (r.timer <= 0) {
      r.active = false;
      npc.mesh.visible = false;
      npc.mesh.rotation.set(0, 0, 0);
      npc.respawnTimer = 15;
    }
  }
}
